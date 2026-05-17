const express = require('express');
const router = express.Router();
const whatsappService = require('../services/whatsappService');
const { db, rtdb } = require('../firebaseAdmin');
const { getPureNumber } = require('../utils/numberUtils');
const { simulateHumanTyping, verifyJid, parseSpintax, addInvisibleJitter, randomizeImage, checkFrequency, simulateRead } = require('../utils/antiBan');
const sharp = require('sharp');
const { PDFDocument } = require('pdf-lib');

// Logout
router.post('/logout', async (req, res) => {
  const { employeeId } = req.body;
  try {
    const result = await whatsappService.logout(employeeId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Init Session
router.post('/init', async (req, res) => {
  const { employeeId } = req.body;
  if (!employeeId) return res.status(400).json({ error: 'employeeId is required.' });
  try {
    // If the user manually clicked "New Connection", clear old corrupted data first
    const statusSnap = await rtdb.ref(`wa_status/${employeeId}`).once('value');
    const statusData = statusSnap.val();
    if (!statusData?.isConnected && statusData?.status !== 'online') {
      console.log(`[WA-${employeeId}] Manual init requested. Wiping old state to ensure fresh QR.`);
      await whatsappService.logout(employeeId).catch(() => { });
    }

    whatsappService.initializeSession(employeeId).catch(err => console.error(`[WA-${employeeId}] Init failed:`, err.message));
    res.status(200).json({ status: 'initializing', message: 'Session check/start triggered.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// THE REPAIRED SEND ROUTE
router.post('/send', async (req, res) => {
  let { employeeId, phoneNumber, message, fullJid, senderName, senderId } = req.body;

  if (!employeeId || !phoneNumber || !message) {
    return res.status(400).json({ error: 'Missing required parameters (employeeId, phoneNumber, message).' });
  }

  if (employeeId === 'auto') {
    employeeId = await getAutoEmployeeId(getPureNumber(phoneNumber));
  }

  if (!employeeId) {
    return res.status(400).json({ error: 'لم يتم العثور على موظف متصل للإرسال التلقائي.' });
  }

  try {
    const sock = whatsappService.getSession(employeeId);
    // Relaxed check: If sock exists in memory, Baileys will queue or throw a proper error
    const isConnected = sock && (sock.user || sock.authState?.creds?.me);

    if (!isConnected) {
      return res.status(401).json({ error: `جلسة الواتساب (${employeeId}) غير متصلة أو في حالة إعادة اتصال.` });
    }

    // 1. Resolve Target JID using unified PROACTIVE logic
    let targetJid = await whatsappService.getTargetJid(employeeId, phoneNumber, fullJid);

    console.log(`[API SEND] Routing text message from employee: ${employeeId} to JID: ${targetJid}`);

    let sendOptions = {};
    if (req.body.quotedMsg) {
      const q = req.body.quotedMsg;
      sendOptions.quoted = {
        key: {
          remoteJid: targetJid,
          fromMe: q.sender === 'me',
          id: q.id
        },
        message: { conversation: q.text }
      };
    }

    // 1. Verify JID (Safety check)
    const exists = await verifyJid(sock, targetJid);
    if (!exists) {
      return res.status(404).json({ error: 'الرقم غير مسجل في الواتساب.' });
    }

    // 2. Prepare Content (Spintax & Jitter)
    const finalMessage = addInvisibleJitter(parseSpintax(message || ''));

    // 3. Human Simulation (Typing delay)
    await simulateHumanTyping(sock, targetJid, finalMessage);

    // 4. Frequency Guard Check (Persistent)
    if (!await checkFrequency(rtdb, employeeId, 250)) {
      return res.status(429).json({ error: 'تم تجاوز حد الإرسال الآمن لهذا الحساب. يرجى الانتظار.' });
    }

    let result;
    const isPoll = !!req.body.isInteractivePoll;

    if (isPoll) {
      const pollName = "مرحباً، هل تفضل استلام التفاصيل الآن؟";
      const pollOptions = ["نعم ✅", "لاحقاً ⏳"];
      result = await sock.sendMessage(targetJid, {
        poll: {
          name: pollName,
          values: pollOptions,
          selectableCount: 1
        }
      });
      const crypto = require('crypto');
      const yesHash = crypto.createHash('sha256').update("نعم ✅").digest('hex');
      const pollRecord = {
        studentPhone: getPureNumber(phoneNumber),
        message: finalMessage,
        yesHash: yesHash,
        type: 'text',
        employeeId: employeeId,
        time: Date.now()
      };
      await rtdb.ref(`pending_polls/${employeeId}/${result.key.id}`).set(pollRecord);
    } else {
      try {
        result = await sock.sendMessage(targetJid, { text: finalMessage }, sendOptions);
      } catch (sendErr) {
        if (sendErr.message.includes('Connection Closed')) {
          console.warn(`[WA] Connection Closed during send, attempting one retry...`);
          // Small delay to allow potential reconnection
          await new Promise(r => setTimeout(r, 2000));
          result = await sock.sendMessage(targetJid, { text: finalMessage }, sendOptions);
        } else {
          throw sendErr;
        }
      }
    }
    await simulateRead(sock, targetJid).catch(() => { });

    // Record the sender info and FULL message in RTDB immediately for the UI
    if (senderId || senderName) {
      const chatId = getPureNumber(targetJid); // MUST match the WA JID to prevent fragmentation
      const updateData = {
        text: isPoll ? "📊 استطلاع: مرحباً، هل تفضل استلام التفاصيل الآن؟" : finalMessage,
        type: 'text',
        time: Date.now(),
        sender: 'me',
        id: result.key.id,
        senderName: senderName || 'نظام',
        senderId: senderId || 'system'
      };

      if (req.body.quotedMsg) {
        updateData.quoted = {
          id: req.body.quotedMsg.id,
          text: req.body.quotedMsg.text,
          sender: req.body.quotedMsg.sender
        };
      }

      await rtdb.ref(`chats/${employeeId}/${chatId}/messages/${result.key.id}`).update(updateData).catch(e => console.error('Failed to update sender info:', e.message));

      // Enforce 50-message limit
      whatsappService.enforceMessageLimit(employeeId, chatId).catch(() => { });

      // Update chat metadata to instantly reflect in the UI sidebar
      const metaData = {
        lastMessage: finalMessage.substring(0, 50),
        timestamp: Date.now(),
        phone: chatId,
        fullJid: targetJid,
        lastSender: 'me'
      };
      await rtdb.ref(`chats/${employeeId}/${chatId}`).update(metaData).catch(() => { });
      await rtdb.ref(`chats_meta/${employeeId}/${chatId}`).update(metaData).catch(() => { });
    }

    return res.status(200).json({ status: 'sent', to: targetJid });
  } catch (error) {
    console.error(`[WA SEND ERROR]`, error.message);
    res.status(500).json({ error: error.message });
  }
});

// Connection Status
router.get('/status/:employeeId', async (req, res) => {
  try {
    const employeeId = req.params.employeeId;
    const status = whatsappService.getConnectionStatus(employeeId);
    const sock = whatsappService.getSession(employeeId);

    const updatePayload = {
      isConnected: status.isConnected,
      lastUpdate: Date.now(),
      status: status.isConnected ? 'online' : (status.qr ? 'qr_ready' : 'disconnected')
    };

    if (status.isConnected && sock?.user?.id) {
      updatePayload.phoneNumber = sock.user.id.split(':')[0];
    }

    await rtdb.ref(`wa_status/${employeeId}`).update(updatePayload).catch(e => console.error('RTDB Sync failed:', e.message));

    res.status(200).json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get ALL Statuses (Admin only)
router.get('/status-all', async (req, res) => {
  try {
    const employeesSnap = await db.collection('employees').get();
    const statuses = [];

    for (const doc of employeesSnap.docs) {
      const emp = doc.data();
      // Read current state directly from RTDB instead of computing it to prevent false negatives
      const rtdbSnap = await rtdb.ref(`wa_status/${doc.id}`).once('value');
      const rtdbData = rtdbSnap.val() || {};

      statuses.push({
        id: doc.id,
        name: emp.name,
        isConnected: rtdbData.isConnected || false,
        status: rtdbData.status || 'disconnected',
        phoneNumber: rtdbData.phoneNumber || null,
        lastUpdate: rtdbData.lastUpdate || null
      });
    }

    res.json(statuses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Helper for Smart Auto-Routing (Excludes emp1) with Load Balancing
async function getAutoEmployeeId(chatId, msgType = 'text') {
  try {
    // 1. Get all connected employees first
    let connectedEmps = [];
    const waStatusSnap = await rtdb.ref('wa_status').once('value');

    if (waStatusSnap.exists()) {
      const statuses = waStatusSnap.val();
      for (const key in statuses) {
        // Exclude emp1 (admin/system) and verify connection/memory state
        if (statuses[key].isConnected && key !== 'emp1' && whatsappService.isSessionActive(key)) {
          connectedEmps.push(key);
        }
      }
    }

    if (connectedEmps.length === 0) {
      return null;
    }

    // 2. Fetch Anti-Ban Stats for Load Balancing
    const baseLimit = msgType === 'text' ? 250 : (msgType === 'media' ? 120 : 100);
    const statsSnap = await rtdb.ref('anti_ban_stats').once('value');
    const allStats = statsSnap.val() || {};
    const now = Date.now();

    // Filter and score connected employees
    let availableEmps = [];
    for (const emp of connectedEmps) {
        // Calculate Dynamic Limit based on Age
        const empStatus = waStatusSnap.val()[emp] || {};
        const firstConn = empStatus.firstConnectionTime || now;
        const ageInDays = (now - firstConn) / (1000 * 60 * 60 * 24);
        
        let dynamicLimit = baseLimit;
        if (ageInDays < 1) dynamicLimit = Math.min(baseLimit, 15);
        else if (ageInDays < 3) dynamicLimit = Math.min(baseLimit, 40);
        else if (ageInDays < 7) dynamicLimit = Math.min(baseLimit, 80);

        const stat = allStats[emp] || { count: 0, startTime: now };
        // Reset if older than 1 hour (3600000 ms)
        if (now - stat.startTime > 3600000) {
            stat.count = 0;
        }
        if (stat.count < dynamicLimit) {
            availableEmps.push({ id: emp, count: stat.count, limit: dynamicLimit });
        }
    }

    if (availableEmps.length === 0) {
        console.warn('[AUTO-ROUTING] All employees reached their safe limit! Need Cool-down.');
        return null; 
    }

    // 3. Try to find who this student chatted with before (Stickiness) - QUOTA OPTIMIZED
    let bestEmp = null;
    let latestTime = 0;

    // Only query the specific chatId from chats_meta instead of downloading the whole database!
    for (const empObj of availableEmps) {
        const empKey = empObj.id;
        try {
            const chatMetaSnap = await rtdb.ref(`chats_meta/${empKey}/${chatId}`).once('value');
            if (chatMetaSnap.exists()) {
                const t = chatMetaSnap.val().timestamp || 0;
                if (t > latestTime) {
                    latestTime = t;
                    bestEmp = empKey;
                }
            }
        } catch (e) {
            console.warn(`[QUOTA] Failed to fetch stickiness for ${empKey}:`, e.message);
        }
    }
    
    if (bestEmp) {
      console.log(`[AUTO-ROUTING] Sticky routing matched. Selected employee: ${bestEmp} for student: ${chatId}`);
      return bestEmp;
    }

    // 4. Load Balancing: Pick the employee with the lowest sent count relative to their limit
    // We sort by percentage of quota used: (count / limit)
    availableEmps.sort((a, b) => (a.count / a.limit) - (b.count / b.limit));
    const selectedEmp = availableEmps[0].id;
    console.log(`[AUTO-ROUTING] Load balancer selected employee: ${selectedEmp} (Count/Limit score) for student: ${chatId}`);
    return selectedEmp;
  } catch (e) {
    console.error('[AUTO-ROUTING ERROR]', e.message);
  }
  return null;
}


router.post('/send-image', async (req, res) => {
  let { employeeId, phoneNumber, base64Image, caption, fullJid, senderName, senderId } = req.body;
  try {
    const chatId = getPureNumber(phoneNumber);

    // Auto-Routing: Find best employee session if requested
    if (employeeId === 'auto') {
      employeeId = await getAutoEmployeeId(chatId, 'media');
    }

    // Enforce default fallback if somehow undefined
    if (!employeeId) {
      // If auto failed or no employee specified, we don't have a valid session
      return res.status(400).json({ error: 'لم يتم العثور على موظف متصل للإرسال التلقائي.' });
    }

    const sock = whatsappService.getSession(employeeId);
    const isConnected = sock && (sock.user || sock.authState?.creds?.me);

    if (!isConnected) {
      return res.status(401).json({ error: `جلسة الواتساب (${employeeId}) غير متصلة.` });
    }

    let targetJid = await whatsappService.getTargetJid(employeeId, phoneNumber, fullJid);
    console.log(`[API SEND-IMAGE] Routing image message from employee: ${employeeId} to JID: ${targetJid}`);
    let originalBuffer = Buffer.from(base64Image.split(',')[1], 'base64');
    let buffer = originalBuffer;

    // 1. Verify JID (Safety check)
    const exists = await verifyJid(sock, targetJid);
    if (!exists) {
      return res.status(404).json({ error: 'الرقم غير مسجل في الواتساب.' });
    }

    // 2. Prepare Content (Spintax & Jitter)
    const finalCaption = addInvisibleJitter(parseSpintax(caption || ''));

    // 3. Human Simulation
    await simulateHumanTyping(sock, targetJid, finalCaption);

    // 4. Frequency Guard Check (Persistent)
    if (!await checkFrequency(rtdb, employeeId, 120)) { // Lower limit for media
      return res.status(429).json({ error: 'تم تجاوز حد إرسال الوسائط لهذا الحساب. يرجى الانتظار.' });
    }

    let result;
    const isPoll = !!req.body.isInteractivePoll;
    let isPdf = false;
    let mimeType = 'image/jpeg';
    let ext = 'jpg';

    if (req.body.asDynamicPdf) {
      isPdf = true;
      mimeType = 'application/pdf';
      ext = 'pdf';
      // SOLUTION 4: Dynamic PDF Generation (Bypass Image Hashes)
      try {
        const pdfDoc = await PDFDocument.create();
        pdfDoc.setTitle(`Doc_${Date.now()}_${Math.random()}`); // Unique Hash
        pdfDoc.setAuthor(`System_${Math.random()}`);

        let imageObj;
        try {
            if (base64Image.includes('jpeg') || base64Image.includes('jpg') || base64Image.startsWith('/9j/')) {
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
      } catch (pdfErr) {
        console.error('[PDF ERROR]', pdfErr);
        // Fallback to normal image if PDF generation fails
        isPdf = false;
        mimeType = 'image/jpeg';
        ext = 'jpg';
        buffer = await randomizeImage(originalBuffer);
      }
    } else {
      // Apply Binary Jitter (Anti-Ban) for normal image
      buffer = await randomizeImage(originalBuffer);
    }

    // Upload to disk storage proactively
    const mediaUrl = await whatsappService.uploadToStorage(buffer, `sent_${Date.now()}.${ext}`, mimeType);

    if (isPoll) {
      const pollName = "مرحباً، هل تفضل استلام الصورة وتفاصيل الحضور الآن؟";
      const pollOptions = ["نعم، أرسلها الآن ✅", "لاحقاً ⏳"];
      result = await sock.sendMessage(targetJid, {
        poll: {
          name: pollName,
          values: pollOptions,
          selectableCount: 1
        }
      });
      const crypto = require('crypto');
      const yesHash = crypto.createHash('sha256').update("نعم، أرسلها الآن ✅").digest('hex');
      const pollRecord = {
        studentPhone: getPureNumber(phoneNumber),
        mediaUrl: mediaUrl,
        caption: finalCaption,
        yesHash: yesHash,
        type: isPdf ? 'document' : 'image',
        mimeType: mimeType,
        fileName: isPdf ? `Certificate_${getPureNumber(phoneNumber)}.pdf` : null,
        employeeId: employeeId,
        time: Date.now()
      };
      await rtdb.ref(`pending_polls/${employeeId}/${result.key.id}`).set(pollRecord);
    } else {
      if (isPdf) {
        result = await sock.sendMessage(targetJid, {
            document: buffer,
            mimetype: 'application/pdf',
            fileName: `Certificate_${getPureNumber(phoneNumber)}.pdf`,
            caption: finalCaption
        });
      } else {
        result = await sock.sendMessage(targetJid, { 
          image: buffer, 
          mimetype: 'image/jpeg', 
          caption: finalCaption 
        });
      }
    }

    await simulateRead(sock, targetJid).catch(() => { });

    // Save to the actual JID used for delivery (embracing LID)
    const finalChatId = getPureNumber(targetJid);

    const msgData = {
      text: isPoll ? "📊 استطلاع: مرحباً، هل تفضل استلام الصورة وتفاصيل الحضور الآن؟" : (caption || "📷 صورة"),
      type: isPoll ? "text" : (isPdf ? "document" : "image"),
      mediaData: isPoll ? null : (mediaUrl || "📷 (خطأ في رفع الصورة)"), 
      time: Date.now(),
      sender: "me",
      id: result.key.id,
      senderName: senderName || "نظام",
      senderId: senderId || "system"
    };

    await rtdb.ref(`chats/${employeeId}/${finalChatId}/messages/${result.key.id}`).update(msgData).catch(() => { });

    // Enforce 50-message limit
    whatsappService.enforceMessageLimit(employeeId, finalChatId).catch(() => { });

    const metaData = {
      lastMessage: isPoll ? "📊 استطلاع: مرحباً، هل تفضل استلام الصورة وتفاصيل الحضور الآن؟" : (caption || "📷 صورة"),
      timestamp: Date.now(),
      phone: finalChatId,
      fullJid: targetJid,
      lastSender: "me"
    };
    await rtdb.ref(`chats/${employeeId}/${finalChatId}`).update(metaData).catch(() => { });
    await rtdb.ref(`chats_meta/${employeeId}/${finalChatId}`).update(metaData).catch(() => { });

    res.status(200).json({ status: 'sent', to: targetJid });
  } catch (err) { 
    console.error("[WA SEND IMAGE ERROR]", err);
    res.status(500).json({ error: err.message }); 
  }
});

// SOLUTION 1: Interactive Polls
router.post('/send-poll', async (req, res) => {
  let { employeeId, phoneNumber, pollName, pollOptions, fullJid } = req.body;
  if (!employeeId || !phoneNumber || !pollName || !pollOptions) return res.status(400).json({ error: 'Missing parameters' });
  
  if (employeeId === 'auto') {
    employeeId = await getAutoEmployeeId(getPureNumber(phoneNumber), 'text');
  }
  if (!employeeId) return res.status(400).json({ error: 'لم يتم العثور على موظف متصل.' });

  try {
    const sock = whatsappService.getSession(employeeId);
    if (!sock) return res.status(401).json({ error: 'Session offline.' });

    let targetJid = await whatsappService.getTargetJid(employeeId, phoneNumber, fullJid);
    const exists = await verifyJid(sock, targetJid);
    if (!exists) return res.status(404).json({ error: 'Number not registered.' });

    await simulateHumanTyping(sock, targetJid, pollName);
    if (!await checkFrequency(rtdb, employeeId, 250)) return res.status(429).json({ error: 'Rate limit exceeded.' });

    const result = await sock.sendMessage(targetJid, {
        poll: {
            name: pollName,
            values: pollOptions,
            selectableCount: 1
        }
    });
    
    // Save minimal data for the UI
    const chatId = getPureNumber(targetJid);
    const msgData = {
      text: "📊 استبيان تفاعلي",
      type: "text",
      time: Date.now(),
      sender: "me",
      id: result.key.id
    };
    await rtdb.ref(`chats/${employeeId}/${chatId}/messages/${result.key.id}`).update(msgData).catch(() => { });

    res.status(200).json({ status: 'sent', to: targetJid });
  } catch (err) { 
    console.error("[WA SEND POLL ERROR]", err);
    res.status(500).json({ error: err.message }); 
  }
});

// Send Document
router.post('/send-document', async (req, res) => {
  let { employeeId, phoneNumber, base64File, fileName, caption, fullJid, senderName, senderId } = req.body;
  if (employeeId === 'auto') {
    employeeId = await getAutoEmployeeId(getPureNumber(phoneNumber), 'media');
  }

  if (!employeeId) {
    return res.status(400).json({ error: 'لم يتم العثور على موظف متصل للإرسال التلقائي.' });
  }

  try {
    const sock = whatsappService.getSession(employeeId);
    const isConnected = sock && (sock.user || sock.authState?.creds?.me) && sock.ws?.readyState === 1;

    if (!isConnected) {
      return res.status(401).json({ error: `جلسة الواتساب (${employeeId}) غير متصلة.` });
    }

    const targetJid = await whatsappService.getTargetJid(employeeId, phoneNumber, fullJid);

    // 1. Verify JID (Safety check)
    const exists = await verifyJid(sock, targetJid);
    if (!exists) {
      return res.status(404).json({ error: 'الرقم غير مسجل في الواتساب.' });
    }

    // 2. Prepare Content (Spintax & Jitter)
    const finalCaption = addInvisibleJitter(parseSpintax(caption || ''));

    // 3. Human Simulation
    await simulateHumanTyping(sock, targetJid, finalCaption);

    const buffer = Buffer.from(base64File.split(',')[1], 'base64');
    const mime = base64File.split(';')[0].split(':')[1];

    // 4. Frequency Guard
    if (!checkFrequency(rtdb, employeeId, 100)) {
      return res.status(429).json({ error: 'تم تجاوز حد إرسال الملفات.' });
    }

    const result = await sock.sendMessage(targetJid, {
      document: buffer,
      mimetype: mime,
      fileName: fileName || "file",
      caption: finalCaption
    });
    await simulateRead(sock, targetJid).catch(() => { });

    const chatId = getPureNumber(targetJid);

    // Optimize RTDB Storage: Store URL instead of huge base64
    const mediaUrl = await whatsappService.uploadToStorage(buffer, fileName || `doc_${Date.now()}`, mime);

    const msgData = {
      text: caption || fileName || "📎 ملف",
      type: "document",
      mediaData: mediaUrl || "📎 (تم إرسال ملف)",
      time: Date.now(),
      sender: "me",
      id: result.key.id,
      senderName: senderName || "نظام",
      senderId: senderId || "system"
    };

    await rtdb.ref(`chats/${employeeId}/${chatId}/messages/${result.key.id}`).update(msgData).catch(() => { });

    // Enforce 50-message limit
    whatsappService.enforceMessageLimit(employeeId, chatId).catch(() => { });

    const metaData = {
      lastMessage: caption || "📎 ملف",
      timestamp: Date.now(),
      phone: chatId,
      fullJid: targetJid,
      lastSender: "me"
    };
    await rtdb.ref(`chats/${employeeId}/${chatId}`).update(metaData).catch(() => { });
    await rtdb.ref(`chats_meta/${employeeId}/${chatId}`).update(metaData).catch(() => { });

    res.status(200).json({ status: 'sent', to: targetJid });
  } catch (err) { 
    console.error("[WA SEND DOCUMENT ERROR]", err);
    res.status(500).json({ error: err.message }); 
  }
});

// 3. Send Video
router.post('/send-video', async (req, res) => {
  let { employeeId, phoneNumber, fullJid, base64Video, caption, senderName, senderId } = req.body;
  if (!employeeId || (!phoneNumber && !fullJid) || !base64Video) return res.status(400).json({ error: 'Missing data' });

  if (employeeId === 'auto') {
    employeeId = await getAutoEmployeeId(getPureNumber(phoneNumber || fullJid), 'media');
  }

  if (!employeeId) {
    return res.status(400).json({ error: 'لم يتم العثور على موظف متصل للإرسال التلقائي.' });
  }

  try {
    const sock = whatsappService.getSession(employeeId);
    if (!sock) return res.status(404).json({ error: `Session ${employeeId} not found` });

    const targetJid = await whatsappService.getTargetJid(employeeId, phoneNumber, fullJid);

    // 1. Verify JID (Safety check)
    const exists = await verifyJid(sock, targetJid);
    if (!exists) {
      return res.status(404).json({ error: 'الرقم غير مسجل في الواتساب.' });
    }

    // 2. Prepare Content (Spintax & Jitter)
    const finalCaption = addInvisibleJitter(parseSpintax(caption || ''));

    // 3. Human Simulation
    await simulateHumanTyping(sock, targetJid, finalCaption);

    const buffer = Buffer.from(base64Video.split(',')[1], 'base64');

    // 4. Frequency Guard
    if (!checkFrequency(rtdb, employeeId, 80)) {
      return res.status(429).json({ error: 'تم تجاوز حد إرسال الفيديو.' });
    }

    const result = await sock.sendMessage(targetJid, {
      video: buffer,
      caption: finalCaption,
      mimetype: 'video/mp4' // Standard for WhatsApp
    });
    await simulateRead(sock, targetJid).catch(() => { });

    const chatId = getPureNumber(targetJid);

    // Optimize RTDB Storage: Store URL instead of huge base64
    const mediaUrl = await whatsappService.uploadToStorage(buffer, `video_${Date.now()}.mp4`, 'video/mp4');

    const msgData = {
      text: caption || "🎥 مقطع فيديو",
      type: "video",
      mediaData: mediaUrl || "🎥 (خطأ في رفع الفيديو)",
      time: Date.now(),
      sender: "me",
      id: result.key.id,
      senderName: senderName || "نظام",
      senderId: senderId || "system"
    };

    await rtdb.ref(`chats/${employeeId}/${chatId}/messages/${result.key.id}`).update(msgData).catch(() => { });

    // Enforce 50-message limit
    whatsappService.enforceMessageLimit(employeeId, chatId).catch(() => { });

    const metaData = {
      lastMessage: caption || "🎥 فيديو",
      timestamp: Date.now(),
      phone: chatId,
      fullJid: targetJid,
      lastSender: "me"
    };
    await rtdb.ref(`chats/${employeeId}/${chatId}`).update(metaData).catch(() => { });
    await rtdb.ref(`chats_meta/${employeeId}/${chatId}`).update(metaData).catch(() => { });

    res.json({ success: true });
  } catch (err) {
    console.error("[WA SEND VIDEO ERROR]", err);
    res.status(500).json({ error: err.message });
  }
});

// Send Sticker
router.post('/send-sticker', async (req, res) => {
  let { employeeId, phoneNumber, base64Image, fullJid, senderName, senderId } = req.body;
  try {
    const chatId = getPureNumber(phoneNumber);

    if (employeeId === 'auto') {
      employeeId = await getAutoEmployeeId(chatId, 'media');
    }

    if (!employeeId) {
      return res.status(400).json({ error: 'لم يتم العثور على موظف متصل للإرسال التلقائي.' });
    }

    const sock = whatsappService.getSession(employeeId);
    if (!sock || !sock.user) return res.status(401).json({ error: `جلسة الواتساب (${employeeId}) غير متصلة.` });

    let targetJid = await whatsappService.getTargetJid(employeeId, phoneNumber, fullJid);
    let buffer = Buffer.from(base64Image.split(',')[1], 'base64');

    // Convert to Sticker format (WebP, 512x512, transparent)
    const stickerBuffer = await sharp(buffer)
      .resize(512, 512, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .webp({ quality: 80 })
      .toBuffer();

    // 1. Verify JID (Safety check)
    const exists = await verifyJid(sock, targetJid);
    if (!exists) {
      return res.status(404).json({ error: 'الرقم غير مسجل في الواتساب.' });
    }

    // 4. Frequency Guard Check (Persistent)
    if (!await checkFrequency(rtdb, employeeId, 80)) {
      return res.status(429).json({ error: 'تم تجاوز حد إرسال الملصقات لهذا الحساب.' });
    }

    const result = await sock.sendMessage(targetJid, { sticker: stickerBuffer });
    await simulateRead(sock, targetJid).catch(() => { });

    const finalChatId = getPureNumber(targetJid);
    const msgData = {
      text: "🏷️ ملصق",
      type: "sticker",
      mediaData: `data:image/webp;base64,${stickerBuffer.toString('base64')}`,
      time: Date.now(),
      sender: "me",
      id: result.key.id,
      senderName: senderName || "نظام",
      senderId: senderId || "system"
    };

    await rtdb.ref(`chats/${employeeId}/${finalChatId}/messages/${result.key.id}`).update(msgData).catch(() => { });

    const metaData = {
      lastMessage: "🏷️ ملصق",
      timestamp: Date.now(),
      phone: finalChatId,
      fullJid: targetJid,
      lastSender: "me"
    };
    await rtdb.ref(`chats/${employeeId}/${finalChatId}`).update(metaData).catch(() => { });
    await rtdb.ref(`chats_meta/${employeeId}/${finalChatId}`).update(metaData).catch(() => { });

    res.status(200).json({ status: 'sent', to: targetJid });
  } catch (err) {
    console.error("Send Sticker Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Delete Message
router.post('/delete-message', async (req, res) => {
  const { employeeId, phoneNumber, messageId, fullJid, isMe } = req.body;
  if (!employeeId || !phoneNumber || !messageId) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  try {
    const cleanPhone = phoneNumber.replace(/[^0-9]/g, '').slice(-9);

    // 1. Mark as deleted in RTDB (this is what ensures Admin can see it and others can't)
    await rtdb.ref(`chats/${employeeId}/${cleanPhone}/messages/${messageId}`).update({
      isDeleted: true,
      deletedAt: Date.now()
    });

    // 2. Try to revoke on WhatsApp if it's our own message
    if (isMe) {
      try {
        const sock = whatsappService.getSession(employeeId);
        if (sock && sock.user) {
          const targetJid = fullJid || `${phoneNumber.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
          await sock.sendMessage(targetJid, {
            delete: {
              remoteJid: targetJid,
              fromMe: true,
              id: messageId
            }
          });
        }
      } catch (revokeErr) {
        console.error('[WA] Revoke failed:', revokeErr.message);
        // We don't fail the whole request because the RTDB update is the primary goal
      }
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete Full Chat (Admin Only)
router.post('/delete-chat', async (req, res) => {
  const { employeeId, phoneNumber } = req.body;
  if (!employeeId || !phoneNumber) return res.status(400).json({ error: 'Missing parameters' });

  try {
    const cleanId = getPureNumber(phoneNumber);
    await rtdb.ref(`chats/${employeeId}/${cleanId}`).remove();
    await rtdb.ref(`chats_meta/${employeeId}/${cleanId}`).remove();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Fast Chat Merge (LID to Phone)
router.post('/merge-chat', async (req, res) => {
  const { employeeId, lidIdentifier, phoneNumber, fullJid } = req.body;
  if (!employeeId || !lidIdentifier || !phoneNumber) return res.status(400).json({ error: 'Missing parameters' });

  try {
    const cleanPhone = getPureNumber(phoneNumber);
    const rawLid = getPureNumber(lidIdentifier); // e.g. 123456@lid -> 123456

    if (rawLid === cleanPhone) return res.json({ success: true, message: 'Same ID' });

    // 1. Save to global mappings
    await rtdb.ref(`jid_mappings/${employeeId}/${rawLid}`).set(cleanPhone);

    // 2. Move chat in RTDB
    const chatsRef = rtdb.ref(`chats/${employeeId}`);
    const oldSnap = await chatsRef.child(rawLid).once('value');

    if (oldSnap.exists()) {
      const oldData = oldSnap.val();
      const newRef = chatsRef.child(cleanPhone);
      const newSnap = await newRef.once('value');
      const newData = newSnap.exists() ? newSnap.val() : {};

      // Merge metadata
      const metaData = {
        name: newData.name || oldData.name || "مجهول",
        phone: cleanPhone,
        fullJid: fullJid || oldData.fullJid || newData.fullJid || "",
        lastMessage: oldData.lastMessage || newData.lastMessage || "",
        timestamp: Math.max(oldData.timestamp || 0, newData.timestamp || 0),
        lastSender: oldData.lastSender || newData.lastSender || 'them'
      };
      await newRef.update(metaData);
      await rtdb.ref(`chats_meta/${employeeId}/${cleanPhone}`).update(metaData);

      // Merge messages
      if (oldData.messages) {
        await newRef.child('messages').update(oldData.messages);
      }

      // Delete old chat
      await chatsRef.child(rawLid).remove();
    }

    res.json({ success: true });
  } catch (error) {
    console.error("[WA] Merge Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Cleanup & Merge Tool (Student-Aware Merge)
router.post('/cleanup-database', async (req, res) => {
  const { employeeId } = req.body;
  if (!employeeId) return res.status(400).json({ error: 'Missing employeeId' });

  try {
    // 1. Build an Identity Map from Firestore Students
    const studentSnap = await db.collection('students').get();
    const jidToCanonical = {}; // fullJid -> phone
    const phoneToCanonical = {}; // phone -> phone

    studentSnap.forEach(doc => {
      const s = doc.data();
      const purePhone = getPureNumber(s.phone);
      if (purePhone) {
        if (s.fullJid) jidToCanonical[s.fullJid] = purePhone;
        phoneToCanonical[purePhone] = purePhone;
      }
    });

    // 2. Process RTDB Chats
    const chatsRef = rtdb.ref(`chats/${employeeId}`);
    const snapshot = await chatsRef.once('value');
    const allChats = snapshot.val();
    if (!allChats) return res.json({ success: true, transformed: 0 });

    let count = 0;
    const bulkMetaUpdates = {};

    for (const [rawOldKey, chatData] of Object.entries(allChats)) {
      // Normalize oldKey to handle cases like "number@lid" or "number:1"
      const oldKey = rawOldKey.split(':')[0].split('@')[0];
      const newKey = jidToCanonical[chatData.fullJid] ||
        phoneToCanonical[getPureNumber(oldKey)] ||
        getPureNumber(oldKey);

      // 1. Prepare ALL chats for chats_meta
      bulkMetaUpdates[`chats_meta/${employeeId}/${newKey}`] = {
        name: chatData.name || "",
        phone: newKey,
        fullJid: chatData.fullJid || "",
        lastMessage: chatData.lastMessage || "",
        timestamp: chatData.timestamp || 0,
        lastSender: chatData.lastSender || 'them'
      };

      // 2. If the actual folder name in DB is different from its pure version
      if (rawOldKey !== newKey) {
        console.log(`[CLEANUP] Force Merging: ${rawOldKey} -> ${newKey}`);
        const newRef = chatsRef.child(newKey);

        // Merge chat metadata
        await newRef.update({
          name: chatData.name || "",
          phone: newKey,
          fullJid: chatData.fullJid || "", // Keep for bridge routing
          lastMessage: chatData.lastMessage || "",
          timestamp: chatData.timestamp || 0
        });

        // Merge all messages from the old folder structure
        if (chatData.messages) {
          await newRef.child('messages').update(chatData.messages);
        }

        // Obliterate the messy old record
        await chatsRef.child(rawOldKey).remove();
        count++;
      }
    }

    // Perform bulk update for meta (Fast)
    if (Object.keys(bulkMetaUpdates).length > 0) {
      await rtdb.ref().update(bulkMetaUpdates);
    }

    res.json({ success: true, transformed: count });
  } catch (error) {
    console.error("[WA] Cleanup major failure:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
