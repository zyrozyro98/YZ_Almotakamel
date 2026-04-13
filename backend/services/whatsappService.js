const { 
  default: makeWASocket, 
  useMultiFileAuthState, 
  DisconnectReason, 
  Browsers, 
  fetchLatestBaileysVersion,
  downloadMediaMessage 
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const { db, rtdb } = require('../firebaseAdmin');

const sessions = new Map();
const qrCache = new Map(); 
const SESSIONS_PATH = path.join(__dirname, '..', 'sessions');

async function initializeSession(employeeId, onQrGenerated) {
  if (sessions.has(employeeId)) {
    const existingSock = sessions.get(employeeId);
    if (existingSock.user) return existingSock;
    try { existingSock.ws.close(); } catch(e) {}
    sessions.delete(employeeId);
  }

  qrCache.delete(employeeId);
  const sessionPath = path.join(SESSIONS_PATH, `session-${employeeId}`);
  if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1017531287] }));

  const sock = makeWASocket({
    version, auth: state, printQRInTerminal: false,
    logger: pino({ level: 'silent' }),
    browser: ['YZ_Almotakamel', 'Chrome', '114.0.5735.199'],
    connectTimeoutMs: 30000,
    generateHighQualityQR: true, 
  });

  sessions.set(employeeId, sock);
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      qrCache.set(employeeId, qr);
      rtdb.ref(`wa_status/${employeeId}`).update({ qr, lastUpdate: Date.now(), isConnected: false });
      if (onQrGenerated) onQrGenerated(qr); 
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect.error)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      rtdb.ref(`wa_status/${employeeId}`).update({ isConnected: false, lastUpdate: Date.now() });
      if (shouldReconnect) initializeSession(employeeId, onQrGenerated);
      else {
        sessions.delete(employeeId);
        if (fs.existsSync(sessionPath)) fs.rmSync(sessionPath, { recursive: true, force: true });
      }
    } else if (connection === 'open') {
      qrCache.delete(employeeId);
      console.log(`[WA-${employeeId}] Connected successfully!`);
      rtdb.ref(`wa_status/${employeeId}`).set({ 
        isConnected: true, 
        qr: null, 
        lastUpdate: Date.now(),
        phoneNumber: sock.user?.id || sock.authState?.creds?.me?.id 
      });
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify' && type !== 'append') return;
    for (const msg of messages) {
      if (!msg.message || msg.key.remoteJid === 'status@broadcast') continue;
      
      const remoteJid = msg.key.remoteJid;
      const isMe = msg.key.fromMe;
      const pushName = msg.pushName || 'مستخدم واتساب';
      
      let textMsg = "";
      let mediaType = "text";
      let mediaData = null;

      if (msg.message.conversation) textMsg = msg.message.conversation;
      else if (msg.message.extendedTextMessage) textMsg = msg.message.extendedTextMessage.text;
      else if (msg.message.imageMessage) { 
        textMsg = msg.message.imageMessage.caption || "📷 صورة"; 
        mediaType = "image"; 
      }
      else if (msg.message.videoMessage) { 
        textMsg = msg.message.videoMessage.caption || "🎥 فيديو"; 
        mediaType = "video"; 
      }
      else if (msg.message.audioMessage) {
        textMsg = "🎤 رسالة صوتية";
        mediaType = "audio";
      }
      else if (msg.message.documentMessage) { 
        textMsg = msg.message.documentMessage.fileName || "📎 ملف"; 
        mediaType = "document"; 
      }

      if (mediaType !== "text") {
        try {
          const buffer = await downloadMediaMessage(msg, 'buffer', {});
          const mime = msg.message[mediaType + 'Message']?.mimetype || 'image/jpeg';
          mediaData = `data:${mime};base64,${buffer.toString('base64')}`;
        } catch (err) { console.error("[WA] Media download failed:", err.message); }
      }

      if (!textMsg && !mediaData) continue;
      
      // 🛡️ Privacy Shield: Mask Platform Credentials in logs
      if (textMsg && textMsg.includes('بيانات الدخول الخاصة بك للمنصة التعليمية')) {
        textMsg = textMsg.replace(/(👤 \*اسم المستخدم:\* ).+/, '$1[بيانات مخفية للأمان]')
                         .replace(/(🔐 \*كلمة المرور:\* ).+/, '$1[بيانات مخفية للأمان]');
      }

      // 1. Store heavy message data in a separate node ONLY if requested
      const msgRef = rtdb.ref(`messages/${employeeId}/${cleanId}/${msg.key.id}`);
      const baseMsg = {
        text: textMsg,
        type: mediaType,
        hasMedia: mediaType !== 'text',
        time: Date.now(),
        sender: isMe ? 'me' : 'them',
        id: msg.key.id
      };

      if (mediaType !== 'text' && mediaData) {
        // Store the heavy base64 in a dedicated media storage node
        await rtdb.ref(`media_content/${employeeId}/${msg.key.id}`).set({
          base64: mediaData,
          type: mediaType,
          fileName: msg.message.documentMessage?.fileName || 'file'
        });
        // We don't include mediaData in the main message stream anymore!
      }

      await msgRef.update(baseMsg);

      // 2. Store lightweight metadata in chat_list (NO MEDIA DATA HERE)
      const chatListRef = rtdb.ref(`chat_list/${employeeId}/${cleanId}`);
      await chatListRef.update({
        lastMessage: textMsg.substring(0, 100), 
        timestamp: Date.now(), 
        phone: cleanId, 
        fullJid: remoteJid, 
        name: pushName,
        lastSender: isMe ? 'me' : 'them'
      });

      if (!isMe) {
        // Increment unread count for incoming messages
        await chatListRef.child('unreadCount').transaction((count) => (count || 0) + 1);
      }

      if (!isMe) {
        const notifRef = rtdb.ref(`notifications/${employeeId}`).push();
        await notifRef.set({ title: `رسالة جديدة من ${pushName}`, body: textMsg.substring(0, 50), time: Date.now(), read: false, type: 'chat', chatId: cleanId, fullJid: remoteJid });
      }
    }
  });

  return sock;
}

function getSession(employeeId) {
  const sock = sessions.get(employeeId);
  if (!sock) throw new Error(`Session ${employeeId} not init.`);
  return sock;
}

async function logout(employeeId) {
  console.log(`[WA] Logging out: ${employeeId}`);
  const sock = sessions.get(employeeId);
  
  if (sock) { 
    try { 
      // Force end current connection
      sock.ev.removeAllListeners();
      await sock.logout().catch(() => {}); 
      sock.ws.close();
    } catch (e) {} 
    sessions.delete(employeeId); 
  }

  qrCache.delete(employeeId);
  
  // Clear status in RTDB immediately
  await rtdb.ref(`wa_status/${employeeId}`).set({ 
    isConnected: false, 
    qr: null, 
    lastUpdate: Date.now(),
    status: 'logged_out'
  });

  const sessionPath = path.join(SESSIONS_PATH, `session-${employeeId}`);
  
  // Give time for OS to release file locks
  await new Promise(resolve => setTimeout(resolve, 1000));

  if (fs.existsSync(sessionPath)) {
    try {
      fs.rmSync(sessionPath, { recursive: true, force: true });
    } catch (err) {
      console.error(`[WA] Failed to delete session folder: ${err.message}`);
    }
  }
  return { success: true };
}

function getConnectionStatus(employeeId) {
  const sock = sessions.get(employeeId);
  const isConnected = !!(sock && (sock.user || sock.authState?.creds?.me));
  return { isConnected, qr: qrCache.get(employeeId) || null, employeeId };
}

module.exports = { initializeSession, getSession, getConnectionStatus, logout };
