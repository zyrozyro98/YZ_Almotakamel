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
const admin = require('firebase-admin');
const { db, rtdb } = require('../firebaseAdmin');
const { getPureNumber } = require('../utils/numberUtils');

const sessions = new Map();
const qrCache = new Map(); 
const SESSIONS_PATH = path.join(__dirname, '..', 'sessions');

// Global set to track processed message IDs to prevent double notifications/saves
const processedMessageIds = new Set();
setInterval(() => {
  if (processedMessageIds.size > 5000) processedMessageIds.clear();
}, 300000); 

const messageUpsertHandler = (employeeId, sock) => async ({ messages, type }) => {
    if (type !== 'notify') return; 

    for (const msg of messages) {
      if (!msg.message || msg.key.remoteJid === 'status@broadcast') continue;
      
      const msgId = msg.key.id;
      if (processedMessageIds.has(msgId)) continue;
      processedMessageIds.add(msgId);
      
      const remoteJid = msg.key.remoteJid;
      const jidUser = remoteJid.split('@')[0].split(':')[0];
      const jidDomain = remoteJid.split('@')[1];
      const normalizedJid = `${jidUser}@${jidDomain}`;
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
        } catch (err) { console.error("[WA] Media error:", err.message); }
      }

      if (!textMsg && !mediaData) continue;

      // --- UNIFIED JID SYSTEM ---
      // We use the JID identifier (Phone number for standard chats) as the master key
      let chatId = getPureNumber(jidUser); 
      
      try {
        // 1. Resolve Identity: If it's a technical identifier (LID), try to find its JID mapping
        const isTechnicalId = jidDomain === 'lid' || /[a-zA-Z]/.test(jidUser);
        
        if (isTechnicalId) {
            const jidMappingSnap = await rtdb.ref(`jid_mappings/${employeeId}/${jidUser}`).once('value');
            if (jidMappingSnap.exists()) {
                chatId = getPureNumber(jidMappingSnap.val());
                console.log(`[WA] JID System Match: ${jidUser} -> ${chatId}`);
            } else {
                // Live JID Discovery
                try {
                  const results = await sock.onWhatsApp(normalizedJid);
                  if (results && results.length > 0 && results[0].exists) {
                    const resolvedJid = results[0].jid;
                    if (resolvedJid.includes('@s.whatsapp.net')) {
                       chatId = getPureNumber(resolvedJid);
                       // Cache the mapping to maintain unified JID history
                       await rtdb.ref(`jid_mappings/${employeeId}/${jidUser}`).set(chatId).catch(()=>{});
                    }
                  }
                } catch (e) {}
            }
        }

        // 2. Cross-reference with Students Database (Firestore)
        // Check by JID record first
        const studentJidMatch = await db.collection('students').where('fullJid', '==', normalizedJid).get();
        if (!studentJidMatch.empty) {
          const s = studentJidMatch.docs[0].data();
          if (s.phone) chatId = getPureNumber(s.phone);
        } else {
          // If match by phone exists, link this JID to the student
          const studentPhoneMatch = await db.collection('students').where('phone', '==', chatId).get();
          if (!studentPhoneMatch.empty) {
            await studentPhoneMatch.docs[0].ref.update({ fullJid: normalizedJid }).catch(() => {});
          }
        }
      } catch (err) { console.error("[WA] JID System Error:", err.message); }

      // Handle Quoted Messages
      let quotedInfo = null;
      const contextInfo = msg.message?.extendedTextMessage?.contextInfo || 
                          msg.message?.imageMessage?.contextInfo || 
                          msg.message?.videoMessage?.contextInfo || 
                          msg.message?.documentMessage?.contextInfo || 
                          msg.message?.audioMessage?.contextInfo;

      if (contextInfo && contextInfo.stanzaId) {
        let quotedText = "رسالة سابقة";
        if (contextInfo.quotedMessage) {
           const qm = contextInfo.quotedMessage;
           quotedText = qm.conversation || qm.extendedTextMessage?.text || "مرفق";
        }
        quotedInfo = {
          id: contextInfo.stanzaId,
          participant: contextInfo.participant,
          text: quotedText
        };
      }

      const chatRef = rtdb.ref(`chats/${employeeId}/${chatId}`);
      const msgData = {
        id: msgId,
        text: textMsg,
        type: mediaType,
        mediaData: mediaData,
        time: Date.now(),
        sender: isMe ? 'me' : 'them',
        quoted: quotedInfo
      };

      await chatRef.child('messages').child(msgId).update(msgData);
      await chatRef.update({
        lastMessage: textMsg,
        timestamp: Date.now(),
        phone: chatId,
        fullJid: normalizedJid,
        name: pushName,
        lastSender: isMe ? 'me' : 'them'
      });

      if (!isMe) {
        const notifRef = rtdb.ref(`notifications/${employeeId}`).push();
        await notifRef.set({ 
          title: `رسالة جديدة من ${pushName}`, 
          body: textMsg.substring(0, 50), 
          time: Date.now(), 
          read: false, 
          type: 'chat', 
          chatId: chatId, 
          fullJid: normalizedJid 
        });
      }
    }
};

async function initializeSession(employeeId, onQrGenerated) {
  if (sessions.has(employeeId)) {
    const existingSock = sessions.get(employeeId);
    if (existingSock.user) return existingSock;
    try { existingSock.ws.close(); } catch(e) {}
    sessions.delete(employeeId);
  }

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
      rtdb.ref(`wa_status/${employeeId}`).set({ 
        isConnected: true, 
        qr: null, 
        lastUpdate: Date.now(),
        phoneNumber: sock.user?.id || sock.authState?.creds?.me?.id 
      });
    }
  });

  sock.ev.on('contacts.upsert', async (contacts) => {
    for (const contact of contacts) {
      if (contact.lidJid && contact.id) {
        const jidKey = contact.lidJid.split('@')[0].split(':')[0];
        const phoneJid = contact.id.split('@')[0].split(':')[0];
        if (jidKey !== phoneJid && phoneJid.match(/^\d+$/)) {
           await rtdb.ref(`jid_mappings/${employeeId}/${jidKey}`).set(phoneJid).catch(()=>{});
        }
      }
    }
  });

  sock.ev.on('contacts.update', async (updates) => {
    for (const update of updates) {
      if (update.lidJid && update.id) {
        const jidKey = update.lidJid.split('@')[0].split(':')[0];
        const phoneJid = update.id.split('@')[0].split(':')[0];
        if (jidKey !== phoneJid && phoneJid.match(/^\d+$/)) {
           await rtdb.ref(`jid_mappings/${employeeId}/${jidKey}`).set(phoneJid).catch(()=>{});
        }
      }
    }
  });

  sock.ev.on('messages.upsert', messageUpsertHandler(employeeId, sock));
  return sock;
}

function getSession(employeeId) {
  const sock = sessions.get(employeeId);
  if (!sock) throw new Error(`Session ${employeeId} not init.`);
  return sock;
}

async function logout(employeeId) {
  const sock = sessions.get(employeeId);
  if (sock) { 
    try { 
      sock.ev.removeAllListeners();
      await sock.logout().catch(() => {}); 
      sock.ws.close();
    } catch (e) {} 
    sessions.delete(employeeId); 
  }
  qrCache.delete(employeeId);
  await rtdb.ref(`wa_status/${employeeId}`).set({ isConnected: false, qr: null, lastUpdate: Date.now(), status: 'logged_out' });
  const sessionPath = path.join(SESSIONS_PATH, `session-${employeeId}`);
  await new Promise(r => setTimeout(r, 1000));
  if (fs.existsSync(sessionPath)) fs.rmSync(sessionPath, { recursive: true, force: true });
  return { success: true };
}

function getConnectionStatus(employeeId) {
  const sock = sessions.get(employeeId);
  const isConnected = !!(sock && (sock.user || sock.authState?.creds?.me));
  return { isConnected, qr: qrCache.get(employeeId) || null, employeeId };
}

module.exports = { initializeSession, getSession, getConnectionStatus, logout };
