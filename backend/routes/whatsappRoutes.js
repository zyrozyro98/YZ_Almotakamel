const express = require('express');
const router = express.Router();
const whatsappService = require('../services/whatsappService');
const { rtdb } = require('../firebaseAdmin');
const { getPureNumber } = require('../utils/numberUtils');

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
  const { employeeId, phoneNumber, message, fullJid, senderName, senderId } = req.body;
  
  if (!employeeId || !phoneNumber || !message) {
    return res.status(400).json({ error: 'Missing required parameters.' });
  }

  try {
    const sock = whatsappService.getSession(employeeId);
    if (!sock || !sock.user) {
      return res.status(401).json({ error: 'جلسة الواتساب غير متصلة.' });
    }

    // 1. Resolve Target JID
    const chatId = getPureNumber(phoneNumber);

    if (!targetJid) {
      // Try to find verified JID from RTDB
      try {
        const snap = await rtdb.ref(`chats/${employeeId}/${chatId}`).once('value');
        targetJid = snap.val()?.fullJid;
      } catch(e) {}
    }

    if (!targetJid) {
      // Still no JID? Use Guessing logic with safety
      let finalPhone = chatId;
      
      // If the clean number starts with 5 or 7 but doesn't have country code prefix
      if (finalPhone.startsWith('5')) finalPhone = '966' + finalPhone;
      else if (finalPhone.startsWith('7')) finalPhone = '967' + finalPhone;
      
      targetJid = `${finalPhone}@s.whatsapp.net`;
    }

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

    // --- HUMAN SIMULATION ---
    // 1. Send 'composing' status (Typing...)
    await sock.sendPresenceUpdate('composing', targetJid);
    // 2. Wait for a short "Thinking/Typing" duration (1.5 - 4 seconds)
    await new Promise(r => setTimeout(r, 1500 + Math.random() * 2500));
    // 3. Stop Composing
    await sock.sendPresenceUpdate('paused', targetJid);
    
    const result = await sock.sendMessage(targetJid, { text: message }, sendOptions);

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
router.get('/status/:employeeId', (req, res) => {
  try {
    const status = whatsappService.getConnectionStatus(req.params.employeeId);
    res.status(200).json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper function to resolve target JID (Shared with text send)
async function getTargetJid(employeeId, phoneNumber, fullJid) {
  let targetJid = fullJid;
  
  const getPure = (raw) => {
    let d = (raw || "").split(':')[0].split('@')[0].replace(/[^0-9]/g, '');
    d = d.replace(/^0+/, '');
    if (d.startsWith('966')) d = d.slice(3);
    else if (d.startsWith('967')) d = d.slice(3);
    else if (d.startsWith('249')) d = d.slice(3);
    return d.replace(/^0+/, '');
  };

  const cleanPhone = getPure(phoneNumber);

  // 1. Try to fetch verified JID from Firestore
  if (!targetJid) {
    try {
      const studentSnap = await db.collection('students').where('phone', '==', cleanPhone).get();
      if (!studentSnap.empty) {
        targetJid = studentSnap.docs[0].data().fullJid;
      }
    } catch (e) { console.error('Firestore JID lookup failed:', e.message); }
  }

  // 2. Fallback to RTDB
  if (!targetJid) {
    try {
      const snap = await rtdb.ref(`chats/${employeeId}/${cleanPhone}`).once('value');
      targetJid = snap.val()?.fullJid;
    } catch(e) {}
  }

  // 3. Fallback to formatting
  if (!targetJid) {
    let finalPhone = cleanPhone;
    if (finalPhone.startsWith('5')) finalPhone = '966' + finalPhone;
    else if (finalPhone.startsWith('7')) finalPhone = '967' + finalPhone;
    targetJid = `${finalPhone}@s.whatsapp.net`;
  }
  return targetJid;
}

// Send Image (with smart routing support)
router.post('/send-image', async (req, res) => {
  let { employeeId, phoneNumber, base64Image, caption, fullJid, senderName, senderId } = req.body;
  try {
    let cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
    const chatId = cleanPhone.slice(-9);

    // Auto-Routing: Find best employee session if requested
    if (employeeId === 'auto') {
      employeeId = 'emp1'; // fallback default
      try {
        const chatsSnap = await rtdb.ref('chats').once('value');
        if (chatsSnap.exists()) {
          const allChats = chatsSnap.val();
          let bestEmp = null;
          let latestTime = 0;
          let connectedEmps = []; // Track who is actually online

          // Find all connected sessions to use as fallback
          const waStatusSnap = await rtdb.ref('wa_status').once('value');
          if (waStatusSnap.exists()) {
            const statuses = waStatusSnap.val();
            for (const key in statuses) {
              if (statuses[key].isConnected) connectedEmps.push(key);
            }
          }

          // Search for the latest chat
          for (const empKey in allChats) {
            if (allChats[empKey][chatId]) {
              const t = allChats[empKey][chatId].timestamp || 0;
              // Only pick this employee if they are actually connected!
              if (t > latestTime && connectedEmps.includes(empKey)) {
                latestTime = t;
                bestEmp = empKey;
              }
            }
          }

          // If the most recent employee is disconnected (or no prior chat), smartly fallback to ANY connected employee
          if (bestEmp) {
            employeeId = bestEmp;
          } else if (connectedEmps.length > 0) {
             // Prefer goldenKey (Admin) or just the first connected if available
             employeeId = connectedEmps[0];
          } else {
             // Let it fail naturally if absolutely nobody is connected
             employeeId = 'emp1';
          }

        }
      } catch(e) { console.error('Auto validation failed', e); }
    }

    // Enforce default fallback if somehow undefined
    if (!employeeId) {
      employeeId = 'emp1';
    }

    const sock = whatsappService.getSession(employeeId);
    if (!sock || !sock.user) return res.status(401).json({ error: `جلسة الواتساب (${employeeId}) غير متصلة.` });

    let targetJid = await getTargetJid(employeeId, phoneNumber, fullJid);
    const buffer = Buffer.from(base64Image.split(',')[1], 'base64');

    // --- HUMAN SIMULATION ---
    // 1. Send 'composing' (or 'recording') status
    await sock.sendPresenceUpdate('composing', targetJid);
    // 2. Simulated Upload Delay
    await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000));
    
    const result = await sock.sendMessage(targetJid, { image: buffer, caption: caption || "" });
    await sock.sendPresenceUpdate('paused', targetJid);
    
    // Use the derived JID to determine final chatId
    const finalChatId = targetJid.split('@')[0].slice(-9);

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

    await rtdb.ref(`chats/${employeeId}/${finalChatId}/messages/${result.key.id}`).update(msgData).catch(() => {});

    await rtdb.ref(`chats/${employeeId}/${finalChatId}`).update({
      lastMessage: caption || "📷 صورة",
      timestamp: Date.now(),
      phone: finalChatId,
      fullJid: targetJid,
      lastSender: "me"
    }).catch(() => {});

    res.status(200).json({ status: 'sent', to: targetJid });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Send Document
router.post('/send-document', async (req, res) => {
  const { employeeId, phoneNumber, base64File, fileName, caption, fullJid, senderName, senderId } = req.body;
  try {
    const sock = whatsappService.getSession(employeeId);
    if (!sock || !sock.user) return res.status(401).json({ error: 'جلسة الواتساب غير متصلة.' });

    const targetJid = await getTargetJid(employeeId, phoneNumber, fullJid);
    const buffer = Buffer.from(base64File.split(',')[1], 'base64');
    const mime = base64File.split(';')[0].split(':')[1];

    const result = await sock.sendMessage(targetJid, { 
      document: buffer, 
      mimetype: mime, 
      fileName: fileName || "file",
      caption: caption || "" 
    });

    const chatId = targetJid.split('@')[0].slice(-9);

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

    await rtdb.ref(`chats/${employeeId}/${chatId}/messages/${result.key.id}`).update(msgData).catch(() => {});

    await rtdb.ref(`chats/${employeeId}/${chatId}`).update({
      lastMessage: caption || "📎 ملف",
      timestamp: Date.now(),
      phone: chatId,
      fullJid: targetJid,
      lastSender: "me"
    }).catch(() => {});

    res.status(200).json({ status: 'sent', to: targetJid });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 3. Send Video
router.post('/send-video', async (req, res) => {
    const { employeeId, phoneNumber, fullJid, base64Video, caption, senderName, senderId } = req.body;
    if (!employeeId || (!phoneNumber && !fullJid) || !base64Video) return res.status(400).json({ error: 'Missing data' });

    try {
        const sock = whatsappService.getSession(employeeId);
        if (!sock) return res.status(404).json({ error: 'Session not found' });

        const targetJid = fullJid || `${phoneNumber}@s.whatsapp.net`;
        const buffer = Buffer.from(base64Video.split(',')[1], 'base64');

        const result = await sock.sendMessage(targetJid, { 
            video: buffer, 
            caption: caption || '',
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

        await rtdb.ref(`chats/${employeeId}/${chatId}/messages/${result.key.id}`).update(msgData).catch(() => {});

        await rtdb.ref(`chats/${employeeId}/${chatId}`).update({
          lastMessage: caption || "🎥 فيديو",
          timestamp: Date.now(),
          phone: chatId,
          fullJid: targetJid,
          lastSender: "me"
        }).catch(() => {});

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
    const getPure = (raw) => {
      let d = (raw || "").split(':')[0].split('@')[0].replace(/[^0-9]/g, '');
      d = d.replace(/^0+/, '');
      if (d.startsWith('966')) d = d.slice(3);
      else if (d.startsWith('967')) d = d.slice(3);
      else if (d.startsWith('249')) d = d.slice(3);
      return d.replace(/^0+/, '');
    };
    
    const cleanId = getPure(phoneNumber);
    await rtdb.ref(`chats/${employeeId}/${cleanId}`).remove();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Cleanup & Merge Tool (Maintenance Only)
router.post('/cleanup-database', async (req, res) => {
  const { employeeId } = req.body;
  if (!employeeId) return res.status(400).json({ error: 'Missing employeeId' });

  try {
    const chatsRef = rtdb.ref(`chats/${employeeId}`);
    const snapshot = await chatsRef.once('value');
    const allChats = snapshot.val();
    if (!allChats) return res.json({ success: true, transformed: 0 });

    let count = 0;
    for (const [oldKey, chatData] of Object.entries(allChats)) {
      const newKey = getPureNumber(oldKey);
      
      if (oldKey !== newKey) {
        console.log(`[CLEANUP] Merging ${oldKey} -> ${newKey}`);
        const newRef = chatsRef.child(newKey);
        
        // Merge chat metadata
        await newRef.update({
          name: chatData.name || "",
          phone: newKey,
          fullJid: chatData.fullJid || "",
          lastMessage: chatData.lastMessage || "",
          timestamp: chatData.timestamp || 0
        });

        // Merge messages if any
        if (chatData.messages) {
          await newRef.child('messages').update(chatData.messages);
        }

        // Delete old entry
        await chatsRef.child(oldKey).remove();
        count++;
      }
    }

    res.json({ success: true, transformed: count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
