const { DisconnectReason, makeWASocket, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, jidDecode } = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const { db, rtdb } = require('../firebaseAdmin');
const { getPureNumber } = require('../utils/numberUtils');
const sharp = require('sharp');
const { getRandomBrowser, getStableBrowser } = require('../utils/antiBan');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { useFirestoreAuthState } = require('../utils/firebaseAuthState');


// Helper to save media to Local Disk (Render Persistent Disk) with COMPRESSION
// We keep this on disk because media is large and doesn't fit well in Firestore docs
const UPLOADS_PATH = process.env.WA_UPLOADS_PATH || path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOADS_PATH)) fs.mkdirSync(UPLOADS_PATH, { recursive: true });

async function saveMedia(buffer, filename, mimetype) {
  try {
    let finalBuffer = buffer;
    if (mimetype.startsWith('image/')) {
        finalBuffer = await sharp(buffer)
            .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 70 })
            .toBuffer();
    }
    const fullPath = path.join(UPLOADS_PATH, filename);
    fs.writeFileSync(fullPath, finalBuffer);
    return `/uploads/${filename}`;
  } catch (e) {
    console.error('[WA SERVICE] Media Save Error:', e.message);
    return null;
  }
}

const sessions = new Map();
const qrCache = new Map();

// Global set to track processed message IDs to prevent double notifications/saves
const processedMessageIds = new Set();
setInterval(() => {
  if (processedMessageIds.size > 5000) processedMessageIds.clear();
}, 300000);

// Helper to handle incoming messages
const handleIncomingMessage = async (employeeId, msg) => {
  const sock = sessions.get(employeeId);
  if (!sock) return;

  const m = msg.messages[0];
  if (!m.message || m.key.fromMe) return;

  const jid = m.key.remoteJid;
  if (processedMessageIds.has(m.key.id)) return;
  processedMessageIds.add(m.key.id);

  const chatId = getPureNumber(jid);
  const normalizedJid = jid.includes('@') ? jid : `${chatId}@s.whatsapp.net`;

  let text = m.message.conversation || m.message.extendedTextMessage?.text || '';
  let type = 'text';
  let mediaData = null;

  if (m.message.imageMessage) {
    type = 'image';
    text = m.message.imageMessage.caption || '';
  } else if (m.message.videoMessage) {
    type = 'video';
    text = m.message.videoMessage.caption || '';
  } else if (m.message.documentMessage) {
    type = 'document';
    text = m.message.documentMessage.fileName || 'ملف';
  }

  // 1. Update Student/Chat info in RTDB
  const chatRef = rtdb.ref(`chats/${employeeId}/${chatId}`);
  await chatRef.update({
    lastMessage: text || (type === 'image' ? '📷 صورة' : '📎 ملف'),
    timestamp: Date.now(),
    phone: chatId,
    fullJid: normalizedJid,
    unread: true
  });

  // 2. Save Message to History
  const msgId = m.key.id;
  await chatRef.child('messages').child(msgId).set({
    id: msgId,
    text,
    type,
    time: Date.now(),
    sender: 'them',
    senderName: m.pushName || chatId
  });

  // 3. (Optional) Auto-Forward to Admin or other logic
  console.log(`[WA-${employeeId}] New message from ${chatId}: ${text.substring(0, 30)}...`);
};

async function initializeSession(employeeId, onQrGenerated, forceReinit = false) {
  if (sessions.has(employeeId)) {
    const existingSock = sessions.get(employeeId);
    if (!forceReinit && existingSock.user && existingSock.ws && existingSock.ws.readyState === 1) {
      console.log(`[WA] Session ${employeeId} already active, skipping re-init.`);
      return existingSock;
    }
    
    if (forceReinit || !existingSock.ws || existingSock.ws.readyState === 3) {
      console.log(`[WA] Closing existing session for ${employeeId} before re-init.`);
      try { existingSock.ev.removeAllListeners(); existingSock.ws.close(); } catch (e) { }
      sessions.delete(employeeId);
    } else {
      return existingSock;
    }
  }

  const usage = process.memoryUsage().heapUsed / 1024 / 1024;
  console.log(`[SYSTEM] Initializing WA session for ${employeeId}. Current Heap: ${Math.round(usage)}MB`);

  const { state, saveCreds } = await useFirestoreAuthState(employeeId);

  // Fetch Proxy Configuration from Firestore
  let agent;
  try {
    const empDoc = await db.collection('employees').doc(employeeId).get();
    if (empDoc.exists) {
      const data = empDoc.data();
      if (data.proxy && data.proxy.host) {
        const { host, port, user, pass, protocol = 'http' } = data.proxy;
        const proxyUrl = user ? `${protocol}://${user}:${pass}@${host}:${port}` : `${protocol}://${host}:${port}`;
        agent = new HttpsProxyAgent(proxyUrl);
        console.log(`[WA] Using proxy for ${employeeId}: ${host}:${port}`);
      }
    }
  } catch (err) {
    console.error(`[WA] Proxy fetch error for ${employeeId}:`, err.message);
  }

  const fetchVersionWithTimeout = async () => {
    try {
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000));
      const { version, isLatest } = await Promise.race([fetchLatestBaileysVersion(), timeout]);
      console.log(`[WA] Using latest Baileys version: ${version.join('.')} (Latest: ${isLatest})`);
      return { version, isLatest };
    } catch (e) {
      console.warn('[WA] Failed to fetch latest version, using modern fallback.');
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
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      qrCache.set(employeeId, qr);
      rtdb.ref(`wa_status/${employeeId}`).update({
        qr,
        lastUpdate: Date.now(),
        isConnected: false,
        status: 'qr_ready'
      }).catch(e => console.error('[WA] QR RTDB Update Error:', e.message));
      if (onQrGenerated) onQrGenerated(qr);
    }
    if (connection === 'connecting') {
      rtdb.ref(`wa_status/${employeeId}`).update({ status: 'connecting', isConnected: false }).catch(e => console.error('[WA] Connecting RTDB Update Error:', e.message));
    }
    if (connection === 'close') {
      const statusCode = (lastDisconnect.error)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      
      rtdb.ref(`wa_status/${employeeId}`).update({
        isConnected: false,
        lastUpdate: Date.now(),
        status: shouldReconnect ? 'reconnecting' : 'disconnected'
      }).catch(e => console.error('[WA] Close RTDB Update Error:', e.message));
      
      if (shouldReconnect) {
        const delay = 5000 + (Math.random() * 10000); 
        console.log(`[WA] Reconnecting ${employeeId} in ${Math.round(delay/1000)} seconds...`);
        setTimeout(() => initializeSession(employeeId, onQrGenerated, true), delay);
      } else {
        sessions.delete(employeeId);
        // Clear Firebase state for this session on logout
        useFirestoreAuthState(employeeId).then(auth => auth.clearState()).catch(e => console.error('[WA] Clear State Error:', e.message));
      }
    } else if (connection === 'open') {
      qrCache.delete(employeeId);
      rtdb.ref(`wa_status/${employeeId}`).update({
        isConnected: true,
        lastUpdate: Date.now(),
        status: 'online',
        qr: null,
        phoneNumber: sock.user.id.split(':')[0]
      }).catch(e => console.error('[WA] Open RTDB Update Error:', e.message));
      console.log(`[WA-${employeeId}] Connection established!`);
    }
  });

  sock.ev.on('messages.upsert', (m) => handleIncomingMessage(employeeId, m));

  return sock;
}

function getSession(employeeId) {
  return sessions.get(employeeId);
}

function isSessionActive(employeeId) {
  const sock = sessions.get(employeeId);
  return !!(sock && (sock.user || sock.authState?.creds?.me) && sock.ws?.readyState === 1);
}

async function logout(employeeId) {
  const sock = sessions.get(employeeId);
  if (sock) {
    try {
      await sock.logout();
      sock.ws.close();
    } catch (e) {
      console.error('[WA LOGOUT ERROR]', e.message);
    }
    sessions.delete(employeeId);
  }
  
  await rtdb.ref(`wa_status/${employeeId}`).set({ isConnected: false, qr: null, lastUpdate: Date.now(), status: 'logged_out' });
  const { clearState } = await useFirestoreAuthState(employeeId);
  await clearState();
  
  return { status: 'success', message: 'Logged out successfully' };
}

function getConnectionStatus(employeeId) {
  const sock = sessions.get(employeeId);
  const isConnected = !!(sock && (sock.user || sock.authState?.creds?.me) && sock.ws?.readyState === 1);
  return {
    isConnected,
    qr: qrCache.get(employeeId) || null,
    status: isConnected ? 'online' : (qrCache.get(employeeId) ? 'qr_ready' : 'disconnected')
  };
}

module.exports = {
  initializeSession,
  getSession,
  isSessionActive,
  logout,
  getConnectionStatus,
  saveMedia
};
