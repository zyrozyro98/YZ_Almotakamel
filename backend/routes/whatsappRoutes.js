const express = require('express');
const router = express.Router();
const whatsappService = require('../services/whatsappService');
const { db, rtdb } = require('../firebaseAdmin');
const { getPureNumber } = require('../utils/numberUtils');
const { simulateHumanTyping, verifyJid, parseSpintax, addInvisibleJitter, randomizeImage } = require('../utils/antiBan');

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
    await whatsappService.logout(employeeId);
    whatsappService.initializeSession(employeeId).catch(err => console.error(`[WA-${employeeId}] Init failed:`, err.message));
    res.status(200).json({ status: 'initializing', message: 'Session started.' });
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
    if (!sock || !sock.user) {
      return res.status(401).json({ error: `جلسة الواتساب (${employeeId}) غير متصلة.` });
    }

    // 1. Resolve Target JID using unified logic
    let targetJid = await getTargetJid(employeeId, phoneNumber, fullJid);


    console.log(`[WA] Sending message to JID: ${targetJid}`);

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

    const result = await sock.sendMessage(targetJid, { text: finalMessage }, sendOptions);

    // Record the sender info in RTDB immediately for the monitoring feed
    if (senderId || senderName) {
      const chatId = getPureNumber(targetJid);
      const updateData = {
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

    const updates = {};
    for (const doc of employeesSnap.docs) {
      const emp = doc.data();
      const status = whatsappService.getConnectionStatus(doc.id);
      statuses.push({
        id: doc.id,
        name: emp.name,
        ...status
      });

      // Prepare batch update for self-healing
      updates[`${doc.id}/isConnected`] = status.isConnected;
      updates[`${doc.id}/lastUpdate`] = Date.now();
    }

    // Apply self-healing batch
    if (Object.keys(updates).length > 0) {
      await rtdb.ref('wa_status').update(updates).catch(() => { });
    }

    res.json(statuses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper function to resolve target JID (Shared with text send)
async function getTargetJid(employeeId, phoneNumber, targetJid = null) {
  const cleanPhone = getPureNumber(phoneNumber);
  const sock = whatsappService.getSession(employeeId);

  // 1. Try to fetch verified JID from Firestore
  if (!targetJid) {
    try {
      const studentSnap = await db.collection('students').where('phone', '==', cleanPhone).get();
      if (!studentSnap.empty) {
        targetJid = studentSnap.docs[0].data().fullJid;
      }
    } catch (e) { }
  }

  // 2. Proactive Discovery (The Master Key)
  // If we only have a phone number, ask WA if they have a specialized LID for it
  if (!targetJid || targetJid.includes('@s.whatsapp.net')) {
    try {
      const results = await sock.onWhatsApp(phoneNumber);
      if (results && results.length > 0 && results[0].exists) {
        const waJid = results[0].jid;
        // If WA returned a LID, we MUST use it and CACHE it for the receiver
        if (waJid.includes('@lid')) {
          targetJid = waJid;
          const lid = waJid.split('@')[0].split(':')[0];
          await rtdb.ref(`jid_mappings/${employeeId}/${lid}`).set(cleanPhone).catch(() => { });
          console.log(`[WA] Proactive JID Discovery: ${cleanPhone} -> ${lid}`);
        } else {
          targetJid = waJid;
        }
      }
    } catch (e) { }
  }

  // 3. Fallback to standard formatting
  if (!targetJid) {
    let finalPhone = cleanPhone;
    if (finalPhone.startsWith('5')) finalPhone = '966' + finalPhone;
    else if (finalPhone.startsWith('7')) finalPhone = '967' + finalPhone;
    targetJid = `${finalPhone}@s.whatsapp.net`;
  }
  return targetJid;
}

// Helper for Smart Auto-Routing (Excludes emp1)
async function getAutoEmployeeId(chatId) {
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

    // 2. Try to find who this student chatted with before
    const chatsSnap = await rtdb.ref('chats').once('value');
    if (chatsSnap.exists()) {
      const allChats = chatsSnap.val();
      let bestEmp = null;
      let latestTime = 0;

      for (const empKey in allChats) {
        if (allChats[empKey][chatId]) {
          const t = allChats[empKey][chatId].timestamp || 0;
          if (t > latestTime && connectedEmps.includes(empKey)) {
            latestTime = t;
            bestEmp = empKey;
          }
        }
      }
      if (bestEmp) return bestEmp;
    }

    // 3. Fallback: Return the first connected employee
    return connectedEmps[0];
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
      employeeId = await getAutoEmployeeId(chatId);
    }

    // Enforce default fallback if somehow undefined
    if (!employeeId) {
      // If auto failed or no employee specified, we don't have a valid session
      return res.status(400).json({ error: 'لم يتم العثور على موظف متصل للإرسال التلقائي.' });
    }

    const sock = whatsappService.getSession(employeeId);
    if (!sock || !sock.user) return res.status(401).json({ error: `جلسة الواتساب (${employeeId}) غير متصلة.` });

    let targetJid = await getTargetJid(employeeId, phoneNumber, fullJid);
    let buffer = Buffer.from(base64Image.split(',')[1], 'base64');
    
    // Apply Binary Jitter (Anti-Ban)
    buffer = await randomizeImage(buffer);

    // 1. Verify JID (Safety check)
    const exists = await verifyJid(sock, targetJid);
    if (!exists) {
      return res.status(404).json({ error: 'الرقم غير مسجل في الواتساب.' });
    }

    // 2. Prepare Content (Spintax & Jitter)
    const finalCaption = addInvisibleJitter(parseSpintax(caption || ''));

    // 3. Human Simulation
    await simulateHumanTyping(sock, targetJid, finalCaption);

    const result = await sock.sendMessage(targetJid, { image: buffer, caption: finalCaption });

    // FORCE SAVE TO PHONE FOLDER (regardless of LID delivery)
    const finalChatId = getPureNumber(phoneNumber);

    const msgData = {
      text: caption || "📷 صورة",
      type: "image",
      mediaData: base64Image,
      time: Date.now(),
      sender: "me",
      id: result.key.id,
      senderName: senderName || "نظام",
      senderId: senderId || "system"
    };

    await rtdb.ref(`chats/${employeeId}/${finalChatId}/messages/${result.key.id}`).update(msgData).catch(() => { });

    await rtdb.ref(`chats/${employeeId}/${finalChatId}`).update({
      lastMessage: caption || "📷 صورة",
      timestamp: Date.now(),
      phone: finalChatId,
      fullJid: targetJid,
      lastSender: "me"
    }).catch(() => { });

    res.status(200).json({ status: 'sent', to: targetJid });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Send Document
router.post('/send-document', async (req, res) => {
  let { employeeId, phoneNumber, base64File, fileName, caption, fullJid, senderName, senderId } = req.body;
  if (employeeId === 'auto') {
    employeeId = await getAutoEmployeeId(getPureNumber(phoneNumber));
  }

  if (!employeeId) {
    return res.status(400).json({ error: 'لم يتم العثور على موظف متصل للإرسال التلقائي.' });
  }

  try {
    const sock = whatsappService.getSession(employeeId);
    if (!sock || !sock.user) return res.status(401).json({ error: `جلسة الواتساب (${employeeId}) غير متصلة.` });

    const targetJid = await getTargetJid(employeeId, phoneNumber, fullJid);

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

    const result = await sock.sendMessage(targetJid, {
      document: buffer,
      mimetype: mime,
      fileName: fileName || "file",
      caption: finalCaption
    });

    const chatId = getPureNumber(phoneNumber);

    const msgData = {
      text: caption || "📎 ملف الدورة",
      type: "document",
      mediaData: base64File,
      time: Date.now(),
      sender: "me",
      id: result.key.id,
      senderName: senderName || "نظام",
      senderId: senderId || "system"
    };

    await rtdb.ref(`chats/${employeeId}/${chatId}/messages/${result.key.id}`).update(msgData).catch(() => { });

    await rtdb.ref(`chats/${employeeId}/${chatId}`).update({
      lastMessage: caption || "📎 ملف",
      timestamp: Date.now(),
      phone: chatId,
      fullJid: targetJid,
      lastSender: "me"
    }).catch(() => { });

    res.status(200).json({ status: 'sent', to: targetJid });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 3. Send Video
router.post('/send-video', async (req, res) => {
  let { employeeId, phoneNumber, fullJid, base64Video, caption, senderName, senderId } = req.body;
  if (!employeeId || (!phoneNumber && !fullJid) || !base64Video) return res.status(400).json({ error: 'Missing data' });

  if (employeeId === 'auto') {
    employeeId = await getAutoEmployeeId(getPureNumber(phoneNumber || fullJid));
  }

  if (!employeeId) {
    return res.status(400).json({ error: 'لم يتم العثور على موظف متصل للإرسال التلقائي.' });
  }

  try {
    const sock = whatsappService.getSession(employeeId);
    if (!sock) return res.status(404).json({ error: `Session ${employeeId} not found` });

    const targetJid = fullJid || `${phoneNumber}@s.whatsapp.net`;

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

    const result = await sock.sendMessage(targetJid, {
      video: buffer,
      caption: finalCaption,
      mimetype: 'video/mp4' // Standard for WhatsApp
    });

    const chatId = targetJid.split('@')[0].slice(-9);

    const msgData = {
      text: caption || "🎥 مقطع فيديو",
      type: "video",
      mediaData: base64Video,
      time: Date.now(),
      sender: "me",
      id: result.key.id,
      senderName: senderName || "نظام",
      senderId: senderId || "system"
    };

    await rtdb.ref(`chats/${employeeId}/${chatId}/messages/${result.key.id}`).update(msgData).catch(() => { });

    await rtdb.ref(`chats/${employeeId}/${chatId}`).update({
      lastMessage: caption || "🎥 فيديو",
      timestamp: Date.now(),
      phone: chatId,
      fullJid: targetJid,
      lastSender: "me"
    }).catch(() => { });

    res.json({ success: true });
  } catch (err) {
    console.error("Send Video Error:", err);
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
    res.json({ success: true });
  } catch (error) {
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
    for (const [rawOldKey, chatData] of Object.entries(allChats)) {
      // Normalize oldKey to handle cases like "number@lid" or "number:1"
      const oldKey = rawOldKey.split(':')[0].split('@')[0];
      const newKey = jidToCanonical[chatData.fullJid] ||
        phoneToCanonical[getPureNumber(oldKey)] ||
        getPureNumber(oldKey);

      // If the actual folder name in DB is different from its pure version
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

    res.json({ success: true, transformed: count });
  } catch (error) {
    console.error("[WA] Cleanup major failure:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
