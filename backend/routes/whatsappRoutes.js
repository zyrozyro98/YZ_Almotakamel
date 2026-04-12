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
  const { employeeId, phoneNumber, message, fullJid } = req.body;
  
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

    // 2. Save to RTDB History
    const messagePayload = {
      text: message,
      time: Date.now(),
      sender: 'me',
      id: result?.key?.id || Date.now().toString()
    };

    const chatRef = rtdb.ref(`chats/${employeeId}/${chatId}`);
    await chatRef.child('messages').push(messagePayload);
    await chatRef.update({
      lastMessage: message,
      timestamp: Date.now()
    });

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

module.exports = router;
