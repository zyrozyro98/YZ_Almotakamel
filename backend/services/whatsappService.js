const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const { db, rtdb } = require('../firebaseAdmin');

// Store map of active sockets by employeeId
const sessions = new Map();

/**
 * Initialize a WhatsApp Baileys Session for a specific employee.
 * Generates QR code and persists session state.
 */
async function initializeSession(employeeId, onQrGenerated) {
  if (sessions.has(employeeId)) {
    console.log(`[WA] Session already active for employee: ${employeeId}`);
    return sessions.get(employeeId);
  }

  const SESSIONS_PATH = path.join(__dirname, '..', 'sessions');
  const sessionPath = path.join(SESSIONS_PATH, `session-${employeeId}`);
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

  const { Browsers } = require('@whiskeysockets/baileys');
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: 'info' }),
    browser: Browsers.macOS('Desktop'),
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 0,
    keepAliveIntervalMs: 10000,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr && onQrGenerated) {
      console.log(`[WA-${employeeId}] New QR Code generated.`);
      onQrGenerated(qr); // Pass QR back to controller to send to frontend
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log(`[WA-${employeeId}] Connection closed due to `, lastDisconnect.error, ', reconnecting ', shouldReconnect);
      sessions.delete(employeeId); // Remove from active map
      if (shouldReconnect) {
        initializeSession(employeeId, onQrGenerated);
      } else {
        // Logged out - clean folder maybe
        console.log(`[WA-${employeeId}] Logged out. Credentials invalidated.`);
      }
    } else if (connection === 'open') {
      console.log(`[WA-${employeeId}] Opened connection successfully!`);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
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
      const chatId = remoteJid.replace('@s.whatsapp.net', '');
      const messagePayload = {
        text: textMsg,
        type: msgType,
        url: url,
        time: new Date().toISOString(),
        sender: isMe ? 'me' : 'them',
        remoteJid: remoteJid
      };

      try {
        const chatRef = rtdb.ref(`chats/${employeeId}/${chatId}`);
        // 1. Push the actual message
        await chatRef.child('messages').push(messagePayload);
        // 2. Update chat metadata for sorting and preview
        await chatRef.update({
          lastMessage: textMsg,
          timestamp: Date.now()
        });
      } catch (err) {
        console.error('[WA] Firebase Sync error:', err);
      }
    }
  });

  sessions.set(employeeId, sock);
  return sock;
}

/**
 * Get an active socket for an employee. Throws error if not connected.
 */
function getSession(employeeId) {
  if (!sessions.has(employeeId)) {
    throw new Error(`Employee ${employeeId} WhatsApp session not connected.`);
  }
  return sessions.get(employeeId);
}

const SESSIONS_PATH = path.join(__dirname, '..', 'sessions');

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
  const isConnected = !!sock && !!sock.user && !!sock.user.id;
  return {
    isConnected,
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

