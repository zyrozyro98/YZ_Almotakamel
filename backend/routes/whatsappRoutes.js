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
        const snap = await rtdb.ref(`chats/${employeeId}/${chatId}`).once('value');
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
      await rtdb.ref(`chats/${employeeId}/${chatId}/messages/${result.key.id}`).update({
        senderName: senderName || 'نظام',
        senderId: senderId || 'system'
      }).catch(e => console.error('Failed to update sender info:', e.message));
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
      const snap = await rtdb.ref(`chats/${employeeId}/${chatId}`).once('value');
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

    const result = await sock.sendMessage(targetJid, { image: buffer, caption: caption || "" });
    
    const chatId = targetJid.split('@')[0].slice(-9);

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

    await rtdb.ref(`chats/${employeeId}/${chatId}/messages/${result.key.id}`).update(msgData).catch(() => {});

    await rtdb.ref(`chats/${employeeId}/${chatId}`).update({
      lastMessage: caption || "📷 صورة",
      timestamp: Date.now(),
      phone: chatId,
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

// Admin Route: Get ALL session statuses
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
