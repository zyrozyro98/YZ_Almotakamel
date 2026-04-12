const express = require('express');
const router = express.Router();
const whatsappService = require('../services/whatsappService');
const { rtdb } = require('../firebaseAdmin');
const qrcode = require('qrcode-terminal'); 

// Initialize Session Route - Returns QR Code or Connected status
router.post('/logout', async (req, res) => {
  const { employeeId } = req.body;
  try {
    const result = await whatsappService.logout(employeeId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

router.post('/init', async (req, res) => {
  const { employeeId } = req.body;
  if (!employeeId) return res.status(400).json({ error: 'employeeId is required.' });

  try {
    await whatsappService.logout(employeeId);
    whatsappService.initializeSession(employeeId).catch(err => {
      console.error(`[WA-${employeeId}] Async init failed:`, err.message);
    });
    res.status(200).json({ status: 'initializing', message: 'Session initialization started.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/send', async (req, res) => {
  const { employeeId, phoneNumber, message } = req.body;
  if (!employeeId || !phoneNumber || !message) {
    return res.status(400).json({ error: 'Missing required parameters.' });
  }

  try {
    const sock = whatsappService.getSession(employeeId);
    if (!sock || !sock.user) {
      return res.status(401).json({ error: `حساب الواتساب الخاص بـ (${employeeId}) غير مربوط.` });
    }

    let cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('05') && cleanPhone.length === 10) cleanPhone = '966' + cleanPhone.slice(1);
    else if (cleanPhone.startsWith('5') && cleanPhone.length === 9) cleanPhone = '966' + cleanPhone;
    else if (cleanPhone.startsWith('7') && cleanPhone.length === 9) cleanPhone = '967' + cleanPhone;
    
    const jid = `${cleanPhone}@s.whatsapp.net`;
    const chatId = cleanPhone.slice(-9);

    const result = await sock.sendMessage(jid, { text: message });
    
    const messagePayload = {
      text: message, type: 'text', time: new Date().toISOString(), sender: 'me', remoteJid: jid, id: result?.key?.id || Date.now().toString()
    };

    (async () => {
      try {
        const chatRef = rtdb.ref(`v2_chats/${employeeId}/${chatId}`);
        await chatRef.child('messages').push(messagePayload);
        await chatRef.update({ lastMessage: message, timestamp: Date.now(), phone: chatId, name: 'أنا' });
      } catch (dbErr) { console.log('[WA] DB Save Error:', dbErr.message); }
    })();

    return res.status(200).json({ status: 'sent', to: jid });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/status/:employeeId', (req, res) => {
  try {
    const status = whatsappService.getConnectionStatus(req.params.employeeId);
    res.status(200).json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/send-image', async (req, res) => {
  const { employeeId, phoneNumber, base64Image, caption } = req.body;
  try {
    const sock = whatsappService.getSession(employeeId);
    let cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
    const jid = `${cleanPhone}@s.whatsapp.net`;
    const imageBuffer = Buffer.from(base64Image.split(',')[1] || base64Image, 'base64');
    await sock.sendMessage(jid, { image: imageBuffer, caption: caption || '' });
    res.status(200).json({ status: 'sent' });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

module.exports = router;
