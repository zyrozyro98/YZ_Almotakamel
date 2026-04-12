const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const { db, rtdb } = require('../firebaseAdmin');
const mappingService = require('./mappingService');

// Store map of active sockets by employeeId
const sessions = new Map();
const qrCache = new Map(); // Store last generated QR
const SESSIONS_PATH = path.join(__dirname, '..', 'sessions');

async function initializeSession(employeeId, onQrGenerated) {
  if (sessions.has(employeeId)) {
    const existingSock = sessions.get(employeeId);
    if (existingSock.user) return existingSock;
  }

  const { state, saveCreds } = await useMultiFileAuthState(path.join(SESSIONS_PATH, employeeId));
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: Browsers.macOS('Desktop'),
    printQRInTerminal: false
  });

  sessions.set(employeeId, sock);

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      console.log(`[WA-${employeeId}] QR Generated`);
      qrCache.set(employeeId, qr); 
      // Update RTDB (Using BOTH paths for compatibility)
      rtdb.ref(`whatsapp/${employeeId}`).update({ qr, isConnected: false, lastUpdate: Date.now() });
      rtdb.ref(`status/${employeeId}`).update({ qr, isConnected: false, lastUpdate: Date.now() });
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        initializeSession(employeeId);
      } else {
        sessions.delete(employeeId);
        qrCache.delete(employeeId);
        rtdb.ref(`whatsapp/${employeeId}`).update({ isConnected: false, qr: null });
        rtdb.ref(`status/${employeeId}`).update({ isConnected: false, qr: null });
      }
    } else if (connection === 'open') {
      console.log(`[WA-${employeeId}] Connected!`);
      qrCache.delete(employeeId);
      rtdb.ref(`whatsapp/${employeeId}`).update({ isConnected: true, qr: null });
      rtdb.ref(`status/${employeeId}`).update({ isConnected: true, qr: null });
    }
  });

  // MESSAGES INCOMING
  sock.ev.on('messages.upsert', async (m) => {
    if (m.type !== 'notify') return;
    const msg = m.messages[0];
    if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;

    const remoteJid = msg.key.remoteJid;
    const isMe = msg.key.fromMe;
    const textMsg = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || "";
    const msgType = msg.message.imageMessage ? 'image' : 'text';
    
    const fullPhone = remoteJid.split('@')[0].replace(/[^0-9]/g, '');
    const chatId = fullPhone.slice(-9); 
    
    const messagePayload = {
      text: textMsg || '',
      type: msgType,
      time: new Date().toISOString(),
      sender: isMe ? 'me' : 'them',
      id: msg.key.id
    };

    try {
      const targetUid = await mappingService.getUidForEmployee(employeeId);
      if (targetUid) {
        const chatRef = rtdb.ref(`v3_chats/${targetUid}/${chatId}`);
        await chatRef.child('messages').push(messagePayload);
        await chatRef.update({
          lastMessage: textMsg || '[وسائط]',
          timestamp: Date.now(),
          phone: chatId,
          name: isMe ? 'أنا' : (msg.pushName || chatId)
        });
      }
    } catch (e) { console.error(e.message); }
  });

  return sock;
}

function getSession(employeeId) {
  return sessions.get(employeeId);
}

function getConnectionStatus(employeeId) {
  const sock = sessions.get(employeeId);
  return {
    isConnected: !!(sock && sock.user),
    qr: qrCache.get(employeeId) || null,
    user: sock ? sock.user : null
  };
}

async function logout(employeeId) {
  const sock = sessions.get(employeeId);
  if (sock) {
    try { await sock.logout(); } catch (e) {}
    sessions.delete(employeeId);
  }
  qrCache.delete(employeeId);
  const sessionPath = path.join(SESSIONS_PATH, employeeId);
  if (fs.existsSync(sessionPath)) fs.rmSync(sessionPath, { recursive: true, force: true });
  await rtdb.ref(`whatsapp/${employeeId}`).remove();
  await rtdb.ref(`status/${employeeId}`).remove();
  return { status: 'success' };
}

module.exports = { initializeSession, getSession, getConnectionStatus, logout };
