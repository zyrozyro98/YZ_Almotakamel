const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const { db, rtdb } = require('../firebaseAdmin');

// Store map of active sockets by employeeId
const sessions = new Map();
const qrCache = new Map(); // Store last generated QR as fallback
const SESSIONS_PATH = path.join(__dirname, '..', 'sessions');

/**
 * Initialize a WhatsApp Baileys Session for a specific employee.
 * Generates QR code and persists session state.
 */
async function initializeSession(employeeId, onQrGenerated) {
  if (sessions.has(employeeId)) {
    const existingSock = sessions.get(employeeId);
    // If it's already connected, just return it
    if (existingSock.user) {
      console.log(`[WA] Session already active and connected for employee: ${employeeId}`);
      return existingSock;
    }
    // If it's initializing but not connected, we might want to continue or restart
    console.log(`[WA] Session exists but not fully connected for ${employeeId}. Re-initializing...`);
    // Close old one if it exists
    try { existingSock.ws.close(); } catch(e) {}
    sessions.delete(employeeId);
  }

  const sessionPath = path.join(SESSIONS_PATH, `session-${employeeId}`);
  if (!fs.existsSync(sessionPath)) {
    fs.mkdirSync(sessionPath, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

  // Fetch latest version to avoid 405 error - updated fallback to a more recent version
  const { version, isLatest } = await fetchLatestBaileysVersion().catch(() => ({ 
    version: [2, 3000, 1017531287], // More recent fallback
    isLatest: false 
  }));
  console.log(`[WA] Using WhatsApp Web v${version.join('.')}, isLatest: ${isLatest}`);

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }), // Reduce log noise
    browser: ['YZ_Almotakamel', 'Chrome', '114.0.5735.199'], // Custom browser string often bypasses 405
    connectTimeoutMs: 60000, 
    defaultQueryTimeoutMs: 0,
    keepAliveIntervalMs: 30000,
  });

  sessions.set(employeeId, sock);

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      console.log(`[WA-${employeeId}] New QR Code generated.`);
      qrCache.set(employeeId, qr); // Cache in memory
      
      rtdb.ref(`status/${employeeId}`).update({ 
        qr: qr, 
        lastUpdate: Date.now(),
        isConnected: false 
      }).catch(e => {});

      if (onQrGenerated) onQrGenerated(qr); 
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect.error)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      
      console.log(`[WA-${employeeId}] Connection closed due to `, lastDisconnect.error, ', reconnecting ', shouldReconnect);
      
      // Update status in RTDB - use update to preserve QR if exists
      rtdb.ref(`status/${employeeId}`).update({ isConnected: false, lastUpdate: Date.now() }).catch(e => {});

      if (shouldReconnect) {
        // Only re-init if not logged out
        initializeSession(employeeId, onQrGenerated);
      } else {
        console.log(`[WA-${employeeId}] Logged out. Credentials invalidated.`);
        sessions.delete(employeeId);
        // Clean up session folder
        if (fs.existsSync(sessionPath)) {
          fs.rmSync(sessionPath, { recursive: true, force: true });
        }
      }
    } else if (connection === 'open') {
      console.log(`[WA-${employeeId}] Opened connection successfully!`);
      // Clear local cache if connected
      qrCache.delete(employeeId);
      
      // Update status in RTDB - clear QR as it's no longer needed
      rtdb.ref(`status/${employeeId}`).set({ 
        isConnected: true, 
        qr: null,
        lastUpdate: Date.now() 
      }).catch(e => {});
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify' && type !== 'append') return;
    for (const msg of messages) {
      if (!msg.message) continue;
      
      const remoteJid = msg.key.remoteJid;
      const isMe = msg.key.fromMe;
      
      let textMsg = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
      let msgType = 'text';
      let url = null;

      if (msg.message.imageMessage) {
        msgType = 'image';
        textMsg = msg.message.imageMessage.caption || 'صورة';
      } else if (msg.message.audioMessage) {
        msgType = 'audio';
        textMsg = 'مقطع صوتي';
      } else if (msg.message.documentMessage) {
        msgType = 'document';
        textMsg = msg.message.documentMessage.title || 'مستند';
      }
      
      console.log(`[WA-${employeeId}][${isMe ? 'SENT' : 'RECV'}] ${remoteJid}: [${msgType}] ${textMsg}`);
      
      // Save message to Firebase for Frontend Sync
      // Use last 9 digits for chatId to ensure perfect matching across different formats
      const fullPhone = remoteJid.split('@')[0].replace(/[^0-9]/g, '');
      const chatId = fullPhone.slice(-9); 
      
      const messagePayload = {
        text: textMsg || '',
        type: msgType,
        url: url,
        time: new Date().toISOString(),
        sender: isMe ? 'me' : 'them',
        remoteJid: remoteJid,
        id: msg.key.id || Date.now().toString()
      };

      try {
        const chatPath = `chats/${employeeId}/${chatId}`;
        const chatRef = rtdb.ref(chatPath);
        
        // 1. Push the message
        await chatRef.child('messages').push(messagePayload);
        
        // 2. Update chat metadata for sidebar
        await chatRef.update({
          lastMessage: textMsg || '',
          timestamp: Date.now(),
          phone: chatId,
          name: isMe ? 'أنا' : (msg.pushName || chatId)
        });
      } catch (err) {
        console.error(`[WA-${employeeId}] Firebase Sync error for ${chatId}:`, err.message);
      }
    }
  });

  return sock;
}

/**
 * Get an active socket for an employee. Throws error if not connected.
 */
function getSession(employeeId) {
  const sock = sessions.get(employeeId);
  if (!sock) {
    throw new Error(`Employee ${employeeId} WhatsApp session not initialized.`);
  }
  return sock;
}

async function logout(employeeId) {
  const sock = sessions.get(employeeId);
  if (sock) {
    try {
      await sock.logout();
    } catch (e) {}
    sessions.delete(employeeId);
  }
  
  const sessionPath = path.join(SESSIONS_PATH, `session-${employeeId}`);
  if (fs.existsSync(sessionPath)) {
    fs.rmSync(sessionPath, { recursive: true, force: true });
  }
  return { success: true };
}

function getConnectionStatus(employeeId) {
  const sock = sessions.get(employeeId);
  return {
    isConnected: !!(sock && sock.user),
    qr: qrCache.get(employeeId) || null, // Return cached QR if exists
    employeeId,
    user: sock?.user || null
  };
}

module.exports = {
  initializeSession,
  getSession,
  getConnectionStatus,
  logout
};


