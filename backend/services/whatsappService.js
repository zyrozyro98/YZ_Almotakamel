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

// Helper to keep only the latest 50 messages per chat to save RTDB quota
async function enforceMessageLimit(employeeId, chatId) {
  try {
    const messagesRef = rtdb.ref(`chats/${employeeId}/${chatId}/messages`);
    
    // Get total count first to avoid unnecessary work
    const countSnap = await messagesRef.once('value');
    if (!countSnap.exists()) return;
    
    const messages = countSnap.val();
    const keys = Object.keys(messages);
    
    if (keys.length > 50) {
      // Sort keys by time (oldest first)
      const sortedKeys = keys.sort((a, b) => (messages[a].time || 0) - (messages[b].time || 0));
      const toDelete = sortedKeys.slice(0, keys.length - 50);
      
      const updates = {};
      toDelete.forEach(k => { updates[k] = null; });
      await messagesRef.update(updates);
      console.log(`[QUOTA] Pruned ${toDelete.length} messages for chat ${chatId}`);
    }
  } catch (e) {
    console.error("[WA] Pruning error:", e.message);
  }
}

// Background task to delete messages older than 30 days (TTL)
// Optimized to avoid loading entire DB into memory
async function runTTLTask() {
  console.log("[SYSTEM] Starting Optimized TTL Cleanup Task...");
  try {
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    
    // 1. Get Employee IDs only (Shallow)
    const empsSnap = await rtdb.ref('chats').once('value');
    if (!empsSnap.exists()) return;
    
    const employeeIds = Object.keys(empsSnap.val());
    let totalDeleted = 0;

    for (const employeeId of employeeIds) {
      // 2. Process each employee's chats one by one
      const chatsSnap = await rtdb.ref(`chats/${employeeId}`).once('value');
      if (!chatsSnap.exists()) continue;
      
      const chats = chatsSnap.val();
      for (const chatId in chats) {
        const messages = chats[chatId].messages;
        if (!messages) continue;
        
        const updates = {};
        let count = 0;
        for (const msgId in messages) {
          if ((messages[msgId].time || 0) < thirtyDaysAgo) {
            updates[msgId] = null;
            count++;
          }
        }
        
        if (count > 0) {
          await rtdb.ref(`chats/${employeeId}/${chatId}/messages`).update(updates);
          totalDeleted += count;
          // Small pause to prevent hitting RTDB write rate limits during massive cleanup
          await new Promise(r => setTimeout(r, 50)); 
        }
      }
    }
    console.log(`[TTL] Cleanup finished. Deleted ${totalDeleted} expired messages.`);
  } catch (e) {
    console.error("[TTL ERROR]", e.message);
  }
}

async function triggerPendingPollMessage(employeeId, pollId, sock) {
  try {
    const pollRef = rtdb.ref(`pending_polls/${employeeId}/${pollId}`);
    const snap = await pollRef.once('value');
    if (!snap.exists()) return;

    const pollData = snap.val();
    // Delete immediately to prevent double-sending
    await pollRef.remove();

    console.log(`[POLL-DELIVERY] Student [${pollData.phoneNumber}] voted YES! Delivering pending media/message.`);

    const targetJid = pollData.targetJid;
    const { simulateHumanTyping, simulateRead, randomizeImage } = require('../utils/antiBan');

    let result;
    let buffer;
    if (pollData.type === 'image') {
      buffer = Buffer.from(pollData.base64Image.split(',')[1], 'base64');
      
      if (pollData.asDynamicPdf) {
        // Dynamic PDF Delivery
        const { PDFDocument } = require('pdf-lib');
        const pdfDoc = await PDFDocument.create();
        pdfDoc.setTitle(`Doc_${Date.now()}_${Math.random()}`);
        pdfDoc.setAuthor(`System_${Math.random()}`);

        let imageObj;
        try {
            if (pollData.base64Image.includes('jpeg') || pollData.base64Image.includes('jpg') || pollData.base64Image.startsWith('/9j/')) {
                imageObj = await pdfDoc.embedJpg(buffer);
            } else {
                imageObj = await pdfDoc.embedPng(buffer);
            }
        } catch(e) {
            const jpgBuffer = await sharp(buffer).jpeg().toBuffer();
            imageObj = await pdfDoc.embedJpg(jpgBuffer);
        }
        
        const page = pdfDoc.addPage([imageObj.width, imageObj.height]);
        page.drawImage(imageObj, { x: 0, y: 0, width: imageObj.width, height: imageObj.height });
        
        const pdfBytes = await pdfDoc.save();
        buffer = Buffer.from(pdfBytes);
        
        await simulateHumanTyping(sock, targetJid, pollData.caption);
        result = await sock.sendMessage(targetJid, {
            document: buffer,
            mimetype: 'application/pdf',
            fileName: `Certificate_${getPureNumber(pollData.phoneNumber)}.pdf`,
            caption: pollData.caption
        });
      } else {
        // Normal Image Delivery
        buffer = await randomizeImage(buffer);
        await simulateHumanTyping(sock, targetJid, pollData.caption);
        result = await sock.sendMessage(targetJid, { 
          image: buffer, 
          mimetype: 'image/jpeg', 
          caption: pollData.caption 
        });
      }
    } else {
      // Normal Text Delivery
      await simulateHumanTyping(sock, targetJid, pollData.text);
      result = await sock.sendMessage(targetJid, { text: pollData.text });
    }

    await simulateRead(sock, targetJid).catch(() => { });

    // Update RTDB Chat History
    const finalChatId = getPureNumber(targetJid);
    let msgData = {
      text: pollData.caption || pollData.text || "",
      type: pollData.type || "text",
      time: Date.now(),
      sender: "me",
      id: result.key.id,
      senderName: pollData.senderName || "نظام",
      senderId: pollData.senderId || "system"
    };

    if (pollData.type === 'image') {
      const mediaUrl = await uploadToStorage(buffer, `sent_${Date.now()}.jpg`, 'image/jpeg');
      msgData.mediaData = mediaUrl || "📷 (خطأ في رفع الصورة)";
    }

    await rtdb.ref(`chats/${employeeId}/${finalChatId}/messages/${result.key.id}`).update(msgData).catch(() => { });
    
    // Enforce 50-message limit
    const whatsappService = require('./whatsappService');
    whatsappService.enforceMessageLimit(employeeId, finalChatId).catch(() => { });

    const metaData = {
      lastMessage: pollData.caption || pollData.text || "",
      timestamp: Date.now(),
      phone: finalChatId,
      fullJid: targetJid,
      lastSender: "me"
    };
    await rtdb.ref(`chats/${employeeId}/${finalChatId}`).update(metaData).catch(() => { });
    await rtdb.ref(`chats_meta/${employeeId}/${finalChatId}`).update(metaData).catch(() => { });

  } catch (err) {
    console.error('[POLL-DELIVERY ERROR]', err.message);
  }
}

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

    // --- MESSAGE UNWRAPPING (Fix for Ephemeral, ViewOnce, and Documents) ---
    let rawMsg = msg.message;
    if (!rawMsg) continue;
    
    if (rawMsg.ephemeralMessage) rawMsg = rawMsg.ephemeralMessage.message;
    if (rawMsg.viewOnceMessage) rawMsg = rawMsg.viewOnceMessage.message;
    if (rawMsg.viewOnceMessageV2) rawMsg = rawMsg.viewOnceMessageV2.message;
    if (rawMsg.viewOnceMessageV2Extension) rawMsg = rawMsg.viewOnceMessageV2Extension.message;
    if (rawMsg.documentWithCaptionMessage) rawMsg = rawMsg.documentWithCaptionMessage.message;

    if (rawMsg.conversation) textMsg = rawMsg.conversation;
    else if (rawMsg.extendedTextMessage) textMsg = rawMsg.extendedTextMessage.text;
    else if (rawMsg.pollUpdateMessage) {
      const pollId = rawMsg.pollUpdateMessage.pollCreationMessageKey?.id;
      if (pollId) {
        console.log(`[POLL-VOTE] Detected poll update for pollId: ${pollId}`);
        triggerPendingPollMessage(employeeId, pollId, sock).catch(e => console.error(`[POLL-VOTE TRIGGER ERROR]`, e.message));
      }
      textMsg = "📊 تصويت في استبيان تفاعلي";
      mediaType = "text";
    }
    else if (rawMsg.imageMessage) {
      textMsg = rawMsg.imageMessage.caption || "📷 صورة";
      mediaType = "image";
    }
    else if (rawMsg.videoMessage) {
      textMsg = rawMsg.videoMessage.caption || "🎥 فيديو";
      mediaType = "video";
    }
    else if (rawMsg.audioMessage) {
      const isVoiceNote = rawMsg.audioMessage.ptt;
      textMsg = isVoiceNote ? "🎤 بصمة صوتية" : "🎵 مقطع صوتي";
      mediaType = "audio";
    }
    else if (rawMsg.documentMessage) {
      textMsg = rawMsg.documentMessage.fileName || "📎 ملف";
      mediaType = "document";
    }
    else if (rawMsg.stickerMessage) {
      textMsg = "🏷️ ملصق";
      mediaType = "sticker";
    }
    else if (rawMsg.contactMessage) {
      const vcard = rawMsg.contactMessage.vcard || '';
      const phoneMatch = vcard.match(/waid=([0-9]+)/i) || vcard.match(/TEL.*:([0-9\+\-\s]+)/i);
      let extractedPhone = phoneMatch ? phoneMatch[1].replace(/[^0-9]/g, '') : '';
      
      textMsg = `👤 جهة اتصال: ${rawMsg.contactMessage.displayName || 'بدون اسم'}`;
      if (extractedPhone) textMsg += `\n📞 رقم الهاتف: ${extractedPhone}`;
      mediaType = "contact";
    }

    if (mediaType !== "text" && mediaType !== "contact") {
      try {
        // downloadMediaMessage expects the original msg object wrapper
        const buffer = await downloadMediaMessage(msg, 'buffer', {});
        let mime = rawMsg[mediaType + 'Message']?.mimetype || 'application/octet-stream';
        let fileName = rawMsg[mediaType + 'Message']?.fileName;

        if (!fileName) {
          fileName = `${mediaType}_${Date.now()}`;
        }
        
        // Ensure proper extension for serving correctly in the browser
        if (!fileName.includes('.')) {
          let extension = mime.split('/')[1]?.split(';')[0] || 'bin';
          if (mediaType === 'sticker' || mime.includes('webp')) extension = 'webp';
          if (mediaType === 'audio' && (extension === 'ogg' || mime.includes('opus'))) extension = 'ogg';
          fileName += `.${extension}`;
        }
        
        mediaData = await uploadToStorage(buffer, fileName, mime);
        console.log(`[WA-${employeeId}] Media uploaded: ${mediaData}`);
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
    
    // --- AUTO-MIGRATION & REASSIGNMENT START ---
    try {
      const chatSnap = await chatRef.once('value');
      if (!chatSnap.exists() || !chatSnap.val().messages) {
        const studentDoc = await db.collection('students').where('phone', '==', chatId).limit(1).get();
        if (!studentDoc.empty) {
          const studentData = studentDoc.docs[0].data();
          const studentId = studentDoc.docs[0].id;
          const oldEmployeeId = studentData.assignedTo;
          
          if (oldEmployeeId && oldEmployeeId !== employeeId) {
            const oldChatSnap = await rtdb.ref(`chats/${oldEmployeeId}/${chatId}`).once('value');
            if (oldChatSnap.exists()) {
              await chatRef.set(oldChatSnap.val());
            }
            await db.collection('students').doc(studentId).update({ assignedTo: employeeId });
            await rtdb.ref(`active_students/${studentId}`).update({ assignedTo: employeeId });
            console.log(`[Auto-Migration] Transferred student ${studentData.name || chatId} from ${oldEmployeeId} to ${employeeId}`);
          }
        }
      }
    } catch (migErr) {
      console.error('[Auto-Migration Error]', migErr.message);
    }
    // --- AUTO-MIGRATION & REASSIGNMENT END ---

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
    
    // Enforce 50-message limit
    enforceMessageLimit(employeeId, chatId).catch(() => {});

    const metaPayload = {
      lastMessage: textMsg,
      timestamp: Date.now(),
      phone: chatId,
      fullJid: normalizedJid,
      name: finalName,
      lastSender: isMe ? 'me' : 'them'
    };

    // Increment unread count for incoming messages
    if (!isMe) {
      const currentSnap = await chatRef.child('unreadCount').once('value');
      metaPayload.unreadCount = (currentSnap.val() || 0) + 1;
    }

    await chatRef.update(metaPayload);
    await rtdb.ref(`chats_meta/${employeeId}/${chatId}`).update(metaPayload);

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

// Queue mechanism to prevent memory spikes if user spams the 'Connect' button
let initQueue = Promise.resolve();

async function initializeSession(employeeId, onQrGenerated, forceReinit = false) {
  // Add this initialization to the queue
  const currentTask = async () => {
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
    markOnlineOnConnect: false,
    connectTimeoutMs: 30000,
    generateHighQualityQR: true,
    syncFullHistory: false, // CRITICAL FIX: Disable history sync to save massive RAM!
    patchMessageBeforeSending: (message) => {
        // DEEP FIX: Multi-Device WhatsApp Server drops messages (Ghost Messages) 
        // if they don't contain the correct deviceListMetadata flags. 
        // We inject it to ensure the message arrives at the recipient's phone.
        const requiresPatch = !!(
            message.buttonsMessage ||
            message.templateMessage ||
            message.listMessage
        );
        if (requiresPatch) {
            message = {
                viewOnceMessage: {
                    message: {
                        messageContextInfo: {
                            deviceListMetadataVersion: 2,
                            deviceListMetadata: {},
                        },
                        ...message,
                    },
                },
            };
        }
        return message;
    },
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
      
      // CRITICAL FIX: Stop auto-reconnecting for bad credentials (403), replaced sessions (440), logged out (401), or mismatch (411)
      // This prevents infinite reconnect loops that cause server crashes (OOM) and WhatsApp IP bans.
      const nonReconnectCodes = [
        DisconnectReason.loggedOut, // 401
        403, // Bad Session / Forbidden
        440, // Connection Replaced (prevents infinite fighting between duplicate server instances or phone/browser)
        411  // Multidevice Mismatch
      ];
      
      const shouldReconnect = !nonReconnectCodes.includes(statusCode) && !isQrTimeout;
      
      rtdb.ref(`wa_status/${employeeId}`).update({
        isConnected: false,
        lastUpdate: Date.now(),
        status: shouldReconnect ? 'reconnecting' : 'disconnected',
        errorDetails: statusCode ? `Code ${statusCode}` : null
      }).catch(() => {});
      
      if (shouldReconnect) {
        const delay = 5000 + (Math.random() * 10000); 
        console.log(`[WA-${employeeId}] Reconnecting (Code: ${statusCode || 'NoCode'}) in ${Math.round(delay/1000)}s...`);
        setTimeout(() => initializeSession(employeeId, onQrGenerated, true), delay);
      } else {
        console.log(`[WA-${employeeId}] Permanent disconnect or QR Timeout (Code: ${statusCode || 'NoCode'}). Clearing memory session.`);
        sessions.delete(employeeId);
        
        // CRITICAL: If credentials were officially revoked (401) or banned/forbidden (403),
        // wipe them from the database and disk so we never attempt to auto-restore this dead session again.
        if (statusCode === DisconnectReason.loggedOut || statusCode === 403) {
          console.log(`[WA-${employeeId}] Credentials officially revoked or banned (Code: ${statusCode}). Wiping from DB and disk.`);
          
          rtdb.ref(`wa_sessions/${employeeId}`).remove().catch(() => {});
          rtdb.ref(`wa_status/${employeeId}`).set({ 
            isConnected: false, 
            qr: null, 
            lastUpdate: Date.now(), 
            status: 'logged_out',
            errorDetails: `Session revoked or account banned (Code ${statusCode})`
          }).catch(() => {});
          
          // Clear local folder
          try {
            const sessionPath = path.join(SESSIONS_PATH, `session-${employeeId}`);
            if (fs.existsSync(sessionPath)) fs.rmSync(sessionPath, { recursive: true, force: true });
          } catch (e) {}
        }
      }
    } else if (connection === 'open') {
      const waUser = sock.user || sock.authState?.creds?.me;
      console.log(`[WA-${employeeId}] Connected Successfully as ${waUser?.id || 'unknown'}`);
      
      qrCache.delete(employeeId);
      rtdb.ref(`wa_status/${employeeId}`).once('value').then(snap => {
          const existingData = snap.val() || {};
          rtdb.ref(`wa_status/${employeeId}`).update({
            isConnected: true,
            qr: null,
            lastUpdate: Date.now(),
            status: 'online',
            phoneNumber: waUser?.id || null,
            firstConnectionTime: existingData.firstConnectionTime || Date.now() // Track account age for Anti-Ban
          }).catch(() => {});
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
          phoneData.phone = phoneJid;
          
          await phoneChatRef.update(phoneData);
          
          // CRITICAL FIX: Enforce limit AFTER merge to prevent quota explosion
          await enforceMessageLimit(employeeId, phoneJid);

          const metaData = {
            lastMessage: phoneData.lastMessage,
            timestamp: phoneData.timestamp,
            name: phoneData.name,
            phone: phoneData.phone,
            fullJid: phoneData.fullJid,
            lastSender: phoneData.lastSender
          };
          await rtdb.ref(`chats_meta/${employeeId}/${phoneJid}`).update(metaData);
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
  };

  // Enqueue the task and wait for it to finish, with a 3-second delay after each to let GC run
  initQueue = initQueue.then(() => currentTask()).then(() => new Promise(r => setTimeout(r, 3000))).catch(e => console.error(e));
  return initQueue;
}

function getSession(employeeId) {
  const sock = sessions.get(employeeId);
  if (!sock) throw new Error(`Session ${employeeId} not init.`);
  return sock;
}

async function getTargetJid(employeeId, phoneNumber, providedJid = null) {
    const cleanPhone = getPureNumber(phoneNumber); 

    // 1. If it's a group, newsletter or technical channel, we MUST use the provided JID
    if (providedJid && (providedJid.includes('@g.us') || providedJid.includes('@newsletter'))) {
       return providedJid; 
    }

    // 2. DEEP FIX: Always force standard individual peer-to-peer chats to use the standard Phone JID
    // [phone]@s.whatsapp.net. Sending to @lid JIDs makes the messages completely INVISIBLE 
    // on both the sender's and recipient's official WhatsApp phone applications!
    return `${cleanPhone}@s.whatsapp.net`;
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


module.exports = { 
  initializeSession, 
  getSession, 
  getTargetJid,
  getConnectionStatus, 
  logout, 
  isSessionActive, 
  uploadToStorage, 
  enforceMessageLimit,
  runTTLTask,
  runHeartbeatTask
};

// Start Background Heartbeat (Simulates natural phone checking every 5-15 mins)
async function runHeartbeatTask() {
  const { simulateHeartbeat } = require('../utils/antiBan');
  console.log('[WA] Starting Background Human Heartbeat Task...');
  
  setInterval(async () => {
    for (const [employeeId, sock] of sessions.entries()) {
      // 30% chance each cycle to check phone naturally
      if (Math.random() > 0.7 && !!(sock.user || sock.authState?.creds?.me)) {
        simulateHeartbeat(sock).catch(() => {});
      }
    }
  }, 300000 + Math.random() * 300000); // Every 5-10 minutes
}

// Start Auto-Warmer (Bot-to-Bot conversations to build Trust Score for new numbers)
async function runAutoWarmerTask() {
  const { simulateHumanTyping, simulateRead } = require('../utils/antiBan');
  console.log('[WA] Starting Auto-Warmer System (Trust Score Builder)...');
  
  const warmerTopics = [
    "مرحباً، كيف حالك اليوم؟",
    "هل يمكنك إرسال التقرير الأخير؟",
    "شكراً لك، سأتحقق من ذلك.",
    "متى سيكون الاجتماع القادم؟",
    "تمام، فهمت.",
    "هل تم تحديث النظام؟",
    "سأتواصل معك لاحقاً.",
    "يعطيك العافية."
  ];

  setInterval(async () => {
    // We need at least 2 connected sessions
    const activeSessions = Array.from(sessions.values()).filter(sock => !!(sock.user || sock.authState?.creds?.me));
    if (activeSessions.length >= 2) {
      // Pick 2 random distinct sessions
      const shuffled = activeSessions.sort(() => 0.5 - Math.random());
      const senderSock = shuffled[0];
      const receiverSock = shuffled[1];
      
      try {
        const senderJid = senderSock.user.id;
        const receiverJid = receiverSock.user.id.split(':')[0] + '@s.whatsapp.net';
        
        const randomMsg = warmerTopics[Math.floor(Math.random() * warmerTopics.length)];
        
        console.log(`[AUTO-WARMER] Heating up numbers: ${senderJid.split('@')[0]} -> ${receiverJid.split('@')[0]}`);
        
        await simulateHumanTyping(senderSock, receiverJid, randomMsg);
        const result = await senderSock.sendMessage(receiverJid, { text: randomMsg });
        
        // Let the receiver simulate reading it after a few seconds
        setTimeout(() => {
          simulateRead(receiverSock, receiverJid, result.key.id).catch(() => {});
        }, 5000 + Math.random() * 5000);
        
      } catch (e) {
        console.warn('[AUTO-WARMER] Error during simulated chat:', e.message);
      }
    }
  }, 15 * 60 * 1000 + Math.random() * 15 * 60 * 1000); // Every 15-30 minutes
}

runHeartbeatTask().catch(e => console.error('[HEARTBEAT ERROR]', e));
runAutoWarmerTask().catch(e => console.error('[WARMER ERROR]', e));
