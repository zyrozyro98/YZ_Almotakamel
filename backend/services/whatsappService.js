const { 
  default: makeWASocket, 
  useMultiFileAuthState,
  DisconnectReason, 
  fetchLatestBaileysVersion, 
  downloadMediaMessage,
  makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const admin = require('firebase-admin');
const { db, rtdb } = require('../firebaseAdmin');
const { getPureNumber } = require('../utils/numberUtils');
const sharp = require('sharp');
const { getRandomBrowser, getStableBrowser } = require('../utils/antiBan');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { syncToCloud } = require('../utils/sessionSync');
const { useFirestoreAuthState } = require('../utils/firebaseAuthState');


// Helper to save media to Local Disk (Render Persistent Disk) with COMPRESSION
async function uploadToStorage(buffer, fileName, mimeType) {
  try {
    const safeName = `${Date.now()}_${fileName.replace(/[^a-zA-Z0-9.]/g, '_')}`;
    const uploadPath = path.join(__dirname, '..', 'uploads', safeName);

    let finalBuffer = buffer;

    // 1. Image Compression (Optimization)
    if (mimeType.startsWith('image/') && !mimeType.includes('gif') && !mimeType.includes('webp')) {
      try {
        finalBuffer = await sharp(buffer)
          .resize({ width: 1200, withoutEnlargement: true }) // Max width 1200px
          .jpeg({ quality: 70 }) // 70% Quality is enough for CS
          .toBuffer();
        console.log(`[WA] Compressed image: ${buffer.length} -> ${finalBuffer.length}`);
      } catch (e) {
        console.warn("[WA] Sharp compression failed, saving original.");
      }
    }

    fs.writeFileSync(uploadPath, finalBuffer);

    // Dynamic URL generation (Points to Render backend)
    const baseUrl = process.env.BACKEND_URL || (process.env.NODE_ENV === 'development' ? `http://localhost:${process.env.PORT || 5000}` : 'https://yz-almotakamel-backend.onrender.com');
    return `${baseUrl}/uploads/${safeName}`;
  } catch (err) {
    console.error("[LOCAL STORAGE ERROR]", err.message);
    return null;
  }
}

const sessions = new Map();
const qrCache = new Map();
const SESSIONS_PATH = process.env.WA_SESSION_PATH ? path.resolve(process.env.WA_SESSION_PATH) : path.join(__dirname, '..', 'sessions');
console.log(`[WA SERVICE] Sessions path resolved to: ${SESSIONS_PATH}`);

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

    // Better Name Resolution for Groups/Channels
    let pushName = msg.pushName || 'مستخدم واتساب';
    if (jidDomain === 'g.us') pushName = `مجموعة: ${pushName}`;
    if (jidDomain === 'newsletter') pushName = `قناة: ${pushName}`;

    // If it's a group and we have participant info, try to use it
    const participant = msg.key.participant || remoteJid;
    const participantName = msg.pushName || 'مجهول';


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
    else if (msg.message.stickerMessage) {
      textMsg = "🏷️ ملصق";
      mediaType = "sticker";
    }

    if (mediaType !== "text") {
      try {
        const buffer = await downloadMediaMessage(msg, 'buffer', {});
        let mime = msg.message[mediaType + 'Message']?.mimetype || 'image/jpeg';
        let fileName = msg.message[mediaType + 'Message']?.fileName || `${mediaType}_${Date.now()}`;
        
        // Ensure extension exists for proper serving
        if (!fileName.includes('.')) {
          const extension = mime.split('/')[1]?.split(';')[0] || 'bin';
          fileName += `.${extension}`;
        }
        
        mediaData = await uploadToStorage(buffer, fileName, mime);
        console.log(`[WA] Media uploaded: ${mediaData}`);
      } catch (err) { console.error("[WA] Media error:", err.message); }
    }

    if (!textMsg && !mediaData) continue;

    // --- UNIFIED JID SYSTEM ---
    // We use the JID identifier (Phone number for standard chats) as the master key
    let chatId = getPureNumber(jidUser);

    try {
      // ADVANCED: Reverse Lookup via Quoted Message (Stanza ID)
      const isTechnicalId = jidDomain === 'lid' || /[a-zA-Z]/.test(jidUser);
      
      if (isTechnicalId) {
        // Cache for current session to avoid Firestore/RTDB spam
        if (!sock.lidCache) sock.lidCache = new Set();
        
        // First check if we already mapped this LID before
        const jidMappingSnap = await rtdb.ref(`jid_mappings/${employeeId}/${jidUser}`).once('value');
        if (jidMappingSnap.exists()) {
          chatId = getPureNumber(jidMappingSnap.val());
        } else {
          // Attempt reverse lookup tricks...
          const contextInfo = msg.message?.extendedTextMessage?.contextInfo || msg.message?.imageMessage?.contextInfo;
          let mappedPhone = null;

          if (contextInfo && contextInfo.stanzaId) {
            const allChatsSnap = await rtdb.ref(`chats/${employeeId}`).once('value');
            if (allChatsSnap.exists()) {
              const chatsData = allChatsSnap.val();
              for (const [phoneKey, chatObj] of Object.entries(chatsData || {})) {
                if (chatObj.messages && chatObj.messages[contextInfo.stanzaId]) {
                  mappedPhone = phoneKey;
                  break;
                }
              }
            }
          }

          if (!mappedPhone && (msg.key.participant || msg.participant)?.includes('@s.whatsapp.net')) {
            mappedPhone = getPureNumber(msg.key.participant || msg.participant);
          }

          if (mappedPhone) {
            chatId = mappedPhone;
            await rtdb.ref(`jid_mappings/${employeeId}/${jidUser}`).set(chatId).catch(() => { });
          }
        }

        // Optimization: Only update Firestore if we haven't done it this session to save quota
        if (chatId !== getPureNumber(jidUser) && !sock.lidCache.has(jidUser)) {
          const studentPhoneMatch = await db.collection('students').where('phone', '==', chatId).limit(1).get();
          if (!studentPhoneMatch.empty) {
            await studentPhoneMatch.docs[0].ref.update({ fullJid: normalizedJid }).catch(() => { });
            sock.lidCache.add(jidUser); // Prevent re-updating in the same session
          }
        }
      }
    } catch (err) { console.error("[WA] Identity System Error:", err.message); }

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

    // --- UNIFIED NAME RESOLUTION (Groups/Channels) ---
    let finalName = pushName;
    if (jidDomain === 'g.us' || jidDomain === 'newsletter') {
      try {
        // Check cache first
        const cacheSnap = await rtdb.ref(`name_cache/${employeeId}/${jidUser}`).once('value');
        if (cacheSnap.exists()) {
          finalName = cacheSnap.val();
        } else {
          // Live fetch from WhatsApp
          if (jidDomain === 'g.us') {
            const meta = await sock.groupMetadata(remoteJid);
            finalName = meta.subject || finalName;
          } else if (jidDomain === 'newsletter') {
            const meta = await sock.newsletterMetadata("jid", remoteJid);
            finalName = meta.name || finalName;
          }
          // Save to cache
          await rtdb.ref(`name_cache/${employeeId}/${jidUser}`).set(finalName).catch(() => { });
        }
      } catch (e) { console.warn("[WA] Metadata fetch failed:", e.message); }
    }

    await chatRef.child('messages').child(msgId).update(msgData);
    await chatRef.update({
      lastMessage: textMsg,
      timestamp: Date.now(),
      phone: chatId,
      fullJid: normalizedJid,
      name: finalName,
      lastSender: isMe ? 'me' : 'them'
    });

    if (!isMe) {
      const notifRef = rtdb.ref(`notifications/${employeeId}`).push();
      await notifRef.set({
        title: `رسالة جديدة في ${finalName}`,
        body: `${pushName}: ${textMsg.substring(0, 50)}`,
        time: Date.now(),
        read: false,
        type: 'chat',
        chatId: chatId,
        fullJid: normalizedJid
      });
    }
  }
};

async function initializeSession(employeeId, onQrGenerated, forceReinit = false) {
  const existingSock = sessions.get(employeeId);
  if (existingSock) {
    if (forceReinit || !existingSock.ws || existingSock.ws.readyState === 3) {
      console.log(`[WA] Closing existing session for ${employeeId} before re-init.`);
      try { existingSock.ev.removeAllListeners(); existingSock.ws.close(); } catch (e) { }
      sessions.delete(employeeId);
    } else {
      return existingSock;
    }
  }

  // Memory Safety Check
  const usage = process.memoryUsage().heapUsed / 1024 / 1024;
  console.log(`[SYSTEM] Initializing WA Cloud session for ${employeeId}. Current Heap: ${Math.round(usage)}MB`);

  let state, saveCreds;
  try {
    // SWITCHED: Using Firestore Auth State for permanent persistence (Render Safe)
    const authData = await useFirestoreAuthState(employeeId);
    state = authData.state;
    saveCreds = authData.saveCreds;
  } catch (err) {
    console.error(`[WA-${employeeId}] Firestore Auth state failed:`, err.message);
    rtdb.ref(`wa_status/${employeeId}`).update({ status: 'disconnected', isConnected: false }).catch(() => {});
    return null; 
  }

  // 1. Fetch Proxy Configuration from RTDB (Fast Path) or Firestore (Fallback)
  let agent;
  try {
    // A. Try RTDB Cache first
    const rtdbEmpSnap = await rtdb.ref(`employee_roles/${employeeId}`).once('value');
    let proxyData = null;
    
    if (rtdbEmpSnap.exists() && rtdbEmpSnap.val().proxy) {
      proxyData = rtdbEmpSnap.val().proxy;
      console.log(`[WA] Using cached proxy from RTDB for ${employeeId}`);
    } else {
      // B. Fallback to Firestore if RTDB cache is missing
      try {
        const empDoc = await db.collection('employees').doc(employeeId).get();
        if (empDoc.exists) {
          proxyData = empDoc.data().proxy;
        }
      } catch (fe) {
        console.warn(`[WA WARNING] Firestore quota reached, no proxy cache in RTDB for ${employeeId}.`);
      }
    }

    if (proxyData && proxyData.host) {
      const { host, port, user, pass, protocol = 'http' } = proxyData;
      const proxyUrl = user ? `${protocol}://${user}:${pass}@${host}:${port}` : `${protocol}://${host}:${port}`;
      agent = new HttpsProxyAgent(proxyUrl);
      console.log(`[WA] Proxy configured: ${host}:${port}`);
    }
  } catch (err) {
    console.warn(`[WA ERROR] Proxy setup failed for ${employeeId}:`, err.message);
  }

  // Fetch version with a 10s timeout to prevent hanging
  const fetchVersionWithTimeout = async () => {
    try {
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000));
      const { version, isLatest } = await Promise.race([fetchLatestBaileysVersion(), timeout]);
      return { version, isLatest };
    } catch (e) {
      return { version: [2, 3000, 1015901307] }; // Modern fallback
    }
  };

  const { version } = await fetchVersionWithTimeout();

  const sock = makeWASocket({
    version, 
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }),
    browser: getStableBrowser(employeeId),
    connectTimeoutMs: 30000,
    generateHighQualityQR: true,
    agent
  });

  sessions.set(employeeId, sock);

  // Sync to Firestore on every creds update
  sock.ev.on('creds.update', async () => {
      await saveCreds();
  });

  // Sync keys to cloud
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    // Non-essential file syncing removed to save Firestore quota. 
    // creds.json is already handled via auth state events.


    if (qr) {
      qrCache.set(employeeId, qr);
      rtdb.ref(`wa_status/${employeeId}`).update({
        qr,
        lastUpdate: Date.now(),
        isConnected: false,
        status: 'qr_ready'
      }).catch(() => {});
      if (onQrGenerated) onQrGenerated(qr);
    }
    
    if (connection === 'connecting') {
      rtdb.ref(`wa_status/${employeeId}`).update({ status: 'connecting', isConnected: false }).catch(() => {});
    }
    
    if (connection === 'close') {
      const statusCode = (lastDisconnect.error)?.output?.statusCode;
      const isQrTimeout = lastDisconnect.error?.message?.includes('QR refs');
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut && !isQrTimeout;
      
      rtdb.ref(`wa_status/${employeeId}`).update({
        isConnected: false,
        lastUpdate: Date.now(),
        status: shouldReconnect ? 'reconnecting' : 'disconnected'
      }).catch(() => {});
      
      if (shouldReconnect) {
        const delay = 5000 + (Math.random() * 10000); 
        console.log(`[WA-${employeeId}] Reconnecting (Code: ${statusCode || 'NoCode'})...`);
        setTimeout(() => initializeSession(employeeId, onQrGenerated, true), delay);
      } else {
        console.log(`[WA-${employeeId}] Permanent disconnect or QR Timeout. Clearing memory session.`);
        sessions.delete(employeeId);
        // We do NOT wipe the cloud backup or local files on QR timeout or generic loggedOut.
        // The user must explicitly press Logout to wipe data. This prevents accidental data loss!
      }
    } else if (connection === 'open') {
      const waUser = sock.user || sock.authState?.creds?.me;
      console.log(`[WA-${employeeId}] Connected Successfully as ${waUser?.id || 'unknown'}`);
      
      qrCache.delete(employeeId);
      rtdb.ref(`wa_status/${employeeId}`).update({
        isConnected: true,
        qr: null,
        lastUpdate: Date.now(),
        status: 'online',
        phoneNumber: waUser?.id || null
      }).catch(() => {});
    }
  });

  const autoMergeBackground = async (employeeId, lidKey, phoneJid) => {
    try {
      const lidChatRef = rtdb.ref(`chats/${employeeId}/${lidKey}`);
      const lidSnap = await lidChatRef.once('value');
      if (lidSnap.exists()) {
        const lidData = lidSnap.val();
        if (lidData.messages) {
          const phoneChatRef = rtdb.ref(`chats/${employeeId}/${phoneJid}`);
          const phoneSnap = await phoneChatRef.once('value');
          let phoneData = phoneSnap.exists() ? phoneSnap.val() : { messages: {} };
          if (!phoneData.messages) phoneData.messages = {};
          
          for (const [msgId, msg] of Object.entries(lidData.messages)) {
            phoneData.messages[msgId] = msg;
          }
          
          phoneData.timestamp = Math.max(phoneData.timestamp || 0, lidData.timestamp || 0);
          phoneData.lastMessage = lidData.lastMessage || phoneData.lastMessage;
          phoneData.lastSender = lidData.lastSender === 'them' ? 'them' : phoneData.lastSender;
          phoneData.name = (phoneData.name && phoneData.name !== 'مجهول') ? phoneData.name : (lidData.name || phoneData.name);
          phoneData.fullJid = phoneData.fullJid || `${phoneJid}@s.whatsapp.net`;
          
          await phoneChatRef.update(phoneData);
          await lidChatRef.remove();
          console.log(`[AUTO-MERGE] Merged ${lidKey} into ${phoneJid} automatically in background.`);
        }
      }
    } catch (e) {
      console.error('[AUTO-MERGE ERROR]', e);
    }
  };

  sock.ev.on('contacts.upsert', async (contacts) => {
    for (const contact of contacts) {
      if (contact.lid && contact.id) {
        const jidKey = contact.lid.split('@')[0].split(':')[0];
        const phoneJid = contact.id.split('@')[0].split(':')[0];
        if (jidKey !== phoneJid && phoneJid.match(/^\d+$/)) {
          await rtdb.ref(`jid_mappings/${employeeId}/${jidKey}`).set(phoneJid).catch(() => { });
          await autoMergeBackground(employeeId, jidKey, phoneJid);
        }
      }
    }
  });

  sock.ev.on('contacts.update', async (updates) => {
    for (const update of updates) {
      if (update.lid && update.id) {
        const jidKey = update.lid.split('@')[0].split(':')[0];
        const phoneJid = update.id.split('@')[0].split(':')[0];
        if (jidKey !== phoneJid && phoneJid.match(/^\d+$/)) {
          await rtdb.ref(`jid_mappings/${employeeId}/${jidKey}`).set(phoneJid).catch(() => { });
          await autoMergeBackground(employeeId, jidKey, phoneJid);
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
      await sock.logout().catch(() => { });
      if (sock.ws) sock.ws.close();
    } catch (e) { }
    sessions.delete(employeeId);
  }
  qrCache.delete(employeeId);
  await rtdb.ref(`wa_status/${employeeId}`).set({ isConnected: false, qr: null, lastUpdate: Date.now(), status: 'logged_out' });
  
  // Clear Firestore state and files
  try {
    const { clearState } = await useFirestoreAuthState(employeeId);
    await clearState();
    
    const sync = await syncToCloud(employeeId, '');
    await sync.clearCloud();
    
    const sessionPath = path.join(SESSIONS_PATH, `session-${employeeId}`);
    if (fs.existsSync(sessionPath)) fs.rmSync(sessionPath, { recursive: true, force: true });

    console.log(`[WA-${employeeId}] Cloud and local session cleared.`);
  } catch (e) {
    console.error(`[WA-${employeeId}] Cleanup error:`, e.message);
  }

  return { success: true };
}

function getConnectionStatus(employeeId) {
  const sock = sessions.get(employeeId);
  let isConnected = false;
  if (sock) {
    isConnected = !!(sock.user || sock.authState?.creds?.me);
  } else {
    // If the server restarted, the RAM session is gone, but the creds might still exist.
    const sessionPath = path.join(SESSIONS_PATH, `session-${employeeId}`);
    if (fs.existsSync(path.join(sessionPath, 'creds.json'))) {
      isConnected = true;
    }
  }
  return { isConnected, qr: qrCache.get(employeeId) || null, employeeId };
}

function isSessionActive(employeeId) {
  const sock = sessions.get(employeeId);
  if (!sock) return false;
  return !!(sock.user || sock.authState?.creds?.me);
}


module.exports = { initializeSession, getSession, getConnectionStatus, logout, isSessionActive };
