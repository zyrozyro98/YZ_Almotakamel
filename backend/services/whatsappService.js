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

      // Extract Quoted Message Info
      let quotedInfo = null;
      const contextInfo = msg.message?.extendedTextMessage?.contextInfo || 
                          msg.message?.imageMessage?.contextInfo || 
                          msg.message?.videoMessage?.contextInfo || 
                          msg.message?.documentMessage?.contextInfo || 
                          msg.message?.audioMessage?.contextInfo;

      if (contextInfo && contextInfo.quotedMessage) {
        let quotedText = "";
        const qm = contextInfo.quotedMessage;
        if (qm.conversation) quotedText = qm.conversation;
        else if (qm.extendedTextMessage) quotedText = qm.extendedTextMessage.text;
        else if (qm.imageMessage) quotedText = qm.imageMessage.caption || "📷 صورة";
        else if (qm.videoMessage) quotedText = qm.videoMessage.caption || "🎥 فيديو";
        else if (qm.documentMessage) quotedText = qm.documentMessage.fileName || "📎 ملف";

        quotedInfo = {
          id: contextInfo.stanzaId,
          participant: contextInfo.participant,
          text: quotedText
        };
      }

      // --- UNIFIED CHAT CONSOLIDATION (PURE LOCAL NUMBER) ---
      const jidUser = remoteJid.split('@')[0].split(':')[0];
      const jidDomain = remoteJid.split('@')[1];
      const normalizedJid = `${jidUser}@${jidDomain}`;
      
      const getPureNumber = (raw) => {
        if (!raw) return "";
        let d = String(raw).replace(/[^0-9]/g, '');
        d = d.replace(/^0+/, ''); 
        if (d.startsWith('966')) d = d.slice(3);
        else if (d.startsWith('967')) d = d.slice(3);
        else if (d.startsWith('249')) d = d.slice(3); 
        return d.replace(/^0+/, ''); 
      };

      const isLid = jidDomain === 'lid' || /[a-zA-Z]/.test(jidUser);
      let cleanId = isLid ? jidUser : getPureNumber(jidUser);

      // 2. SMART IDENTIFICATION: Link identity to Student record
      try {
        const jidMatch = await db.collection('students').where('fullJid', '==', normalizedJid).get();
        if (!jidMatch.empty) {
          const s = jidMatch.docs[0].data();
          if (s.phone) cleanId = getPureNumber(s.phone);
        } else if (!isLid) {
          const pureIncoming = getPureNumber(jidUser);
          const phoneMatch = await db.collection('students').where('phone', '==', pureIncoming).get();
          if (!phoneMatch.empty) {
            const studentDoc = phoneMatch.docs[0];
            cleanId = pureIncoming;
            await studentDoc.ref.update({ fullJid: normalizedJid }).catch(() => {});
          }
        }
      } catch (err) { console.error("[WA] Resolution error:", err.message); }

      // 3. PERSISTENCE
      const chatRef = rtdb.ref(`chats/${employeeId}/${cleanId}`);
      const msgData = {
        text: textMsg,
        type: mediaType,
        mediaData: mediaData,
        time: Date.now(),
        sender: isMe ? 'me' : 'them',
        id: msg.key.id,
        quoted: quotedInfo
      };

      await chatRef.child('messages').child(msg.key.id).update(msgData);
      
      await chatRef.update({
        lastMessage: textMsg, 
        timestamp: Date.now(), 
        phone: cleanId, 
        fullJid: normalizedJid, 
        name: pushName,
        lastSender: isMe ? 'me' : 'them'
      });

      if (!isMe) {
        const notifRef = rtdb.ref(`notifications/${employeeId}`).push();
        await notifRef.set({ title: `رسالة جديدة من ${pushName}`, body: textMsg.substring(0, 50), time: Date.now(), read: false, type: 'chat', chatId: cleanId, fullJid: normalizedJid });
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
