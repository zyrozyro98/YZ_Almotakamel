const express = require('express');
const router = express.Router();
const whatsappService = require('../services/whatsappService');
const { rtdb } = require('../firebaseAdmin');

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
    let targetJid = fullJid;
    let cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
    const chatId = cleanPhone.slice(-9);

    if (!targetJid) {
      // Try to find verified JID from RTDB
      try {
        const snap = await rtdb.ref(`chat_list/${employeeId}/${chatId}`).once('value');
        targetJid = snap.val()?.fullJid;
      } catch(e) {}
    }

    if (!targetJid) {
      // Still no JID? Use Guessing logic with safety
      let finalPhone = cleanPhone;
      
      // If phone already has international code (966 or 967), don't touch it
      if (!finalPhone.startsWith('966') && !finalPhone.startsWith('967')) {
        if (finalPhone.startsWith('05') && finalPhone.length === 10) {
          finalPhone = '966' + finalPhone.slice(1);
        } else if (finalPhone.startsWith('5') && finalPhone.length === 9) {
          finalPhone = '966' + finalPhone;
        } else if (finalPhone.startsWith('7') && finalPhone.length === 9) {
          finalPhone = '967' + finalPhone;
        }
      }
      targetJid = `${finalPhone}@s.whatsapp.net`;
    }

    console.log(`[WA] Sending message to JID: ${targetJid}`);
    const result = await sock.sendMessage(targetJid, { text: message });

    // Record the sender info in RTDB immediately for the monitoring feed
    if (senderId || senderName) {
      const chatId = targetJid.split('@')[0].slice(-9);
      await rtdb.ref(`messages/${employeeId}/${chatId}/${result.key.id}`).update({
        senderName: senderName || 'نظام',
        senderId: senderId || 'system'
      }).catch(e => console.error('Failed to update sender info:', e.message));
      
      // Also update last message in list
      await rtdb.ref(`chat_list/${employeeId}/${chatId}`).update({
        lastMessage: message.substring(0, 100),
        timestamp: Date.now(),
        lastSender: 'me'
      }).catch(() => {});

      // UNIFIED GLOBAL FEED
      await rtdb.ref(`unified_messages/${chatId}/${result.key.id}`).update({
        text: message, id: result.key.id, time: Date.now(), sender: 'me', employeeId
      });
      await rtdb.ref(`unified_chat_list/${chatId}`).update({
        lastMessage: message.substring(0, 100), timestamp: Date.now(), lastSender: 'me', lastEmployeeId: employeeId
      });
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
  let cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
  const chatId = cleanPhone.slice(-9);

  if (!targetJid) {
    try {
      const snap = await rtdb.ref(`chat_list/${employeeId}/${chatId}`).once('value');
      targetJid = snap.val()?.fullJid;
    } catch(e) {}
  }

  if (!targetJid) {
    let finalPhone = cleanPhone;
    
    // Aggressively format phone to WhatsApp canonical format
    if (finalPhone.startsWith('00')) finalPhone = finalPhone.slice(2);
    else if (finalPhone.startsWith('+')) finalPhone = finalPhone.slice(1);
    
    // After stripping international prefixes, evaluate SA and YE local prefixes
    if (!finalPhone.startsWith('966') && !finalPhone.startsWith('967')) {
      // Strip leading zero for local parsing
      if (finalPhone.startsWith('0')) finalPhone = finalPhone.slice(1);
      
      if (finalPhone.startsWith('5') && finalPhone.length === 9) finalPhone = '966' + finalPhone;
      else if (finalPhone.startsWith('7') && finalPhone.length === 9) finalPhone = '967' + finalPhone;
    }
    
    targetJid = `${finalPhone}@s.whatsapp.net`;
  }
  return targetJid;
}

// Send Image
router.post('/send-image', async (req, res) => {
  const { employeeId, phoneNumber, base64Image, caption, fullJid, senderName, senderId } = req.body;
  try {
    const sock = whatsappService.getSession(employeeId);
    if (!sock || !sock.user) return res.status(401).json({ error: 'جلسة الواتساب غير متصلة.' });

    const targetJid = await getTargetJid(employeeId, phoneNumber, fullJid);
    const buffer = Buffer.from(base64Image.split(',')[1], 'base64');

    // Human-like Presence Simulation: Signal 'composing' (typing) before sending media
    await sock.sendPresenceUpdate('composing', targetJid).catch(() => {});
    await new Promise(res => setTimeout(res, 2000 + Math.random() * 2000));
    await sock.sendPresenceUpdate('paused', targetJid).catch(() => {});

    const result = await sock.sendMessage(targetJid, { image: buffer, caption: caption || "" });
    
    const chatId = targetJid.split('@')[0].slice(-9);

    const msgData = {
      text: caption || "📷 صورة",
      type: "image",
      hasMedia: true,
      time: Date.now(),
      sender: "me",
      id: result.key.id,
      senderName: senderName || "نظام",
      senderId: senderId || "system"
    };

    // Store media content separately
    await rtdb.ref(`media_content/${employeeId}/${result.key.id}`).set({ base64: base64Image, type: 'image' });

    await rtdb.ref(`messages/${employeeId}/${chatId}/${result.key.id}`).update(msgData).catch(() => {});

    await rtdb.ref(`chat_list/${employeeId}/${chatId}`).update({
      lastMessage: caption || "📷 صورة",
      timestamp: Date.now(),
      phone: chatId,
      fullJid: targetJid,
      lastSender: "me"
    }).catch(() => {});

    // UNIFIED GLOBAL FEED
    await rtdb.ref(`unified_messages/${chatId}/${result.key.id}`).update({ ...msgData, employeeId });
    await rtdb.ref(`unified_chat_list/${chatId}`).update({
      lastMessage: caption || "📷 صورة", timestamp: Date.now(), lastSender: "me", lastEmployeeId: employeeId
    });

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
      text: caption || "📎 ملف",
      type: "document",
      hasMedia: true,
      time: Date.now(),
      sender: "me",
      id: result.key.id,
      senderName: senderName || "نظام",
      senderId: senderId || "system"
    };

    // Store media content separately
    await rtdb.ref(`media_content/${employeeId}/${result.key.id}`).set({ 
       base64: base64File, type: 'document', fileName: fileName || 'file' 
    });

    await rtdb.ref(`messages/${employeeId}/${chatId}/${result.key.id}`).update(msgData).catch(() => {});

    await rtdb.ref(`chat_list/${employeeId}/${chatId}`).update({
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

        await rtdb.ref(`messages/${employeeId}/${chatId}/${result.key.id}`).update(msgData).catch(() => {});

        await rtdb.ref(`chat_list/${employeeId}/${chatId}`).update({
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

// Delete/Revoke Message
router.post('/delete', async (req, res) => {
  const { employeeId, phoneNumber, messageId, fromMe, fullJid } = req.body;
  
  if (!employeeId || !messageId || (!phoneNumber && !fullJid)) {
    return res.status(400).json({ error: 'Missing parameters for deletion.' });
  }

  try {
    const sock = whatsappService.getSession(employeeId);
    if (!sock || !sock.user) return res.status(401).json({ error: 'Session not connected' });

    const targetJid = fullJid || `${phoneNumber}@s.whatsapp.net`;
    
    // Revoke message on WhatsApp
    await sock.sendMessage(targetJid, { 
      delete: { 
        remoteJid: targetJid, 
        fromMe: fromMe === true || fromMe === 'true', 
        id: messageId 
      } 
    });

    // Mark as deleted in RTDB
    const cleanId = targetJid.split('@')[0].slice(-9);
    await rtdb.ref(`messages/${employeeId}/${cleanId}/${messageId}`).update({
      isDeleted: true,
      deletedAt: Date.now()
    });

    res.json({ success: true, message: 'Message revoked' });
  } catch (error) {
    console.error('[WA DELETE ERROR]', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET MEDIA CONTENT ON DEMAND
router.get('/get-media/:employeeId/:messageId', async (req, res) => {
  const { employeeId, messageId } = req.params;
  try {
    const snap = await rtdb.ref(`media_content/${employeeId}/${messageId}`).once('value');
    if (!snap.exists()) return res.status(404).json({ error: 'Media not found or expired' });
    res.json(snap.val());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/mark-read', async (req, res) => {
  const { employeeId, phoneNumber, fullJid } = req.body;
  const chatId = fullJid ? fullJid.split('@')[0].slice(-9) : phoneNumber.slice(-9);
  try {
    await rtdb.ref(`chat_list/${employeeId}/${chatId}`).update({ unreadCount: 0 });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/status-all', async (req, res) => {
  try {
    const sessionsPath = path.join(__dirname, '..', 'sessions');
    const files = fs.existsSync(sessionsPath) ? fs.readdirSync(sessionsPath) : [];
    const sessionsFound = files.filter(f => f.startsWith('session-')).map(f => f.replace('session-', ''));
    
    // Also check current active sessions in memory
    const activeSessions = [];
    for (const eid of sessionsFound) {
      activeSessions.push(whatsappService.getConnectionStatus(eid));
    }
    
    res.json(activeSessions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
