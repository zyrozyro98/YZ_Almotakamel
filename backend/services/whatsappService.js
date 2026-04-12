const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const { db, rtdb } = require('../firebaseAdmin');
const mappingService = require('./mappingService');

// Store map of active sockets by employeeId
const sessions = new Map();
const qrCache = new Map(); // Store last generated QR as fallback
const SESSIONS_PATH = path.join(__dirname, '..', 'sessions');

/**
 * Initialize a WhatsApp Baileys Session for a specific employee.
 */
async function initializeSession(employeeId, onQrGenerated) {
  if (sessions.has(employeeId)) {
    const existingSock = sessions.get(employeeId);
    if (existingSock.user) return existingSock;
  }

  const { state, saveCreds } = await useMultiFileAuthState(path.join(SESSIONS_PATH, employeeId));
  const { version, isLatest } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    printQRInTerminal: false,
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: Browsers.macOS('Desktop'),
    generateHighQualityLinkPreview: true,
  });

  sessions.set(employeeId, sock);

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      console.log(`[WA-${employeeId}] NEW QR GENERATED`);
      qrCache.set(employeeId, qr);
      if (onQrGenerated) onQrGenerated(qr);
      rtdb.ref(`whatsapp/${employeeId}/qr`).set(qr);
      rtdb.ref(`whatsapp/${employeeId}/status`).set('qr');
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log(`[WA-${employeeId}] Connection closed due to `, lastDisconnect.error, ', reconnecting: ', shouldReconnect);
      if (shouldReconnect) {
        initializeSession(employeeId, onQrGenerated);
      } else {
        sessions.delete(employeeId);
        rtdb.ref(`whatsapp/${employeeId}/status`).set('disconnected');
      }
    } else if (connection === 'open') {
      console.log(`[WA-${employeeId}] Opened connection successfully!`);
      rtdb.ref(`whatsapp/${employeeId}/status`).set('connected');
      rtdb.ref(`whatsapp/${employeeId}/qr`).remove();
    }
  });

  // MESSAGES INCOMING (UPSERT)
  sock.ev.on('messages.upsert', async (m) => {
    if (m.type !== 'notify') return;
    const msg = m.messages[0];
    if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;

    const remoteJid = msg.key.remoteJid;
    const isMe = msg.key.fromMe;
    const textMsg = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || "";
    const msgType = msg.message.imageMessage ? 'image' : 'text';
    
    // Identification
    let currentEmployeeId = employeeId;

    const fullPhone = remoteJid.split('@')[0].replace(/[^0-9]/g, '');
    const chatId = fullPhone.slice(-9); 
    
    const messagePayload = {
      text: textMsg || '',
      type: msgType,
      time: new Date().toISOString(),
      sender: isMe ? 'me' : 'them',
      remoteJid: remoteJid,
      id: msg.key.id
    };

    try {
      // V3 UID MAPPING
      const targetUid = await mappingService.getUidForEmployee(currentEmployeeId);
      if (targetUid) {
        const chatRef = rtdb.ref(`v3_chats/${targetUid}/${chatId}`);
        await chatRef.child('messages').push(messagePayload);
        await chatRef.update({
          lastMessage: textMsg || (msgType === 'image' ? 'photo' : 'file'),
          timestamp: Date.now(),
          phone: chatId,
          name: isMe ? 'أنا' : (msg.pushName || chatId)
        });
        console.log(`[WA-V3] SUCCESS: Saved Incoming for UID: ${targetUid}`);
      }
    } catch (e) { console.error('[UPSERT ERROR]', e.message); }
  });

  return sock;
}

function getSession(employeeId) {
  return sessions.get(employeeId);
}

function getConnectionStatus(employeeId) {
  const sock = sessions.get(employeeId);
  return {
    connected: !!(sock && sock.user),
    user: sock ? sock.user : null
  };
}

async function logout(employeeId) {
  const sock = sessions.get(employeeId);
  if (sock) {
    try { await sock.logout(); } catch (e) {}
    sessions.delete(employeeId);
  }
  const sessionPath = path.join(SESSIONS_PATH, employeeId);
  if (fs.existsSync(sessionPath)) fs.rmSync(sessionPath, { recursive: true, force: true });
  await rtdb.ref(`whatsapp/${employeeId}`).remove();
  return { status: 'success' };
}

module.exports = { initializeSession, getSession, getConnectionStatus, logout };
