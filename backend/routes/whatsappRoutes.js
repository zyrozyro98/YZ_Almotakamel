const express = require('express');
const router = express.Router();
const whatsappService = require('../services/whatsappService');
const { rtdb } = require('../firebaseAdmin');
const qrcode = require('qrcode-terminal'); // Only for terminal test, the real logic sends base64 to FE

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
    // CRITICAL: Always logout/clear old session before starting a new one for QR
    await whatsappService.logout(employeeId);

    // Start session in background
    whatsappService.initializeSession(employeeId).catch(err => {
      console.error(`[WA-${employeeId}] Async init failed:`, err.message);
    });

    res.status(200).json({ status: 'initializing', message: 'Session initialization started. Watch RTDB for status.' });

  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
});

// Send message via specific employee session
router.post('/send', async (req, res) => {
  const { employeeId, phoneNumber, message } = req.body;
  if (!employeeId || !phoneNumber || !message) {
    return res.status(400).json({ error: 'Missing required parameters.' });
  }

  try {
    console.log(`[HTTP] Request to SEND text from employee: ${employeeId} to: ${phoneNumber}`);
    
    // Check if session exists for this SPECIFIC employeeId
    const sock = whatsappService.getSession(employeeId);
    if (!sock || !sock.user) {
      console.error(`[WA ERROR] No ACTIVE/CONNECTED session for: ${employeeId}`);
      return res.status(401).json({ error: `حساب الواتساب الخاص بـ (${employeeId}) غير مربوط. يرجى الربط من الإعدادات.` });
    }

    // Normalize phone number (International format)
    let cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
    
    // Auto-Correct for Saudi/Yemen
    if (cleanPhone.startsWith('05') && cleanPhone.length === 10) {
      cleanPhone = '966' + cleanPhone.slice(1);
    } else if (cleanPhone.startsWith('5') && cleanPhone.length === 9) {
      cleanPhone = '966' + cleanPhone;
    } else if (cleanPhone.startsWith('7') && cleanPhone.length === 9) {
      cleanPhone = '967' + cleanPhone;
    }
    
    const jid = `${cleanPhone}@s.whatsapp.net`;
    const chatId = cleanPhone.slice(-9);

    const result = await sock.sendMessage(jid, { text: message });
    console.log(`[WA SUCCESS] Message sent via session: ${employeeId}`);
    
    // PERFORM DB UPDATE IN BACKGROUND - DON'T WAIT
    const chatId = cleanPhone;
    const messagePayload = {
      text: message,
      type: 'text',
      url: null,
      time: new Date().toISOString(),
      sender: 'me',
      remoteJid: jid,
      id: result?.key?.id || Date.now().toString()
    };

    (async () => {
      try {
        const chatRef = rtdb.ref(`chats/${employeeId}/${chatId}`);
        await chatRef.child('messages').push(messagePayload);
        await chatRef.update({
          lastMessage: message,
          timestamp: Date.now()
        });
      } catch (dbErr) {
        console.log('[WA] Background DB Save skipped/error:', dbErr.message);
      }
    })();

    return res.status(200).json({ status: 'sent', to: jid });
  } catch (error) {
    console.error(`[WA SEND FATAL ERROR] Employee: ${employeeId}, Error:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

// Check Status for Admin panel
router.get('/status/:employeeId', (req, res) => {
  try {
    const status = whatsappService.getConnectionStatus(req.params.employeeId);
    res.status(200).json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Single Photo Send Support
router.post('/send-image', async (req, res) => {
  const { employeeId, phoneNumber, base64Image, caption } = req.body;
  if (!employeeId || !phoneNumber || !base64Image) {
    return res.status(400).json({ error: 'Missing required parameters.' });
  }

  try {
    const sock = whatsappService.getSession(employeeId);
    
    // Normalize phone number (International format)
    let cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('05') && cleanPhone.length === 10) {
      cleanPhone = '966' + cleanPhone.slice(1);
    } else if (cleanPhone.startsWith('5') && cleanPhone.length === 9) {
      cleanPhone = '966' + cleanPhone;
    } else if (cleanPhone.startsWith('7') && cleanPhone.length === 9) {
      cleanPhone = '967' + cleanPhone;
    }

    const jid = `${cleanPhone}@s.whatsapp.net`;
    const imageBuffer = Buffer.from(base64Image.split(',')[1] || base64Image, 'base64');
    
    await sock.sendMessage(jid, { 
       image: imageBuffer, 
       caption: caption || '' 
    });
    res.status(200).json({ status: 'sent', to: jid });
  } catch (error) {
    console.error('[WA SEND-IMAGE ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

// Single Audio Send Support
router.post('/send-audio', async (req, res) => {
  const { employeeId, phoneNumber, base64Audio } = req.body;
  if (!employeeId || !phoneNumber || !base64Audio) {
    return res.status(400).json({ error: 'Missing required parameters.' });
  }

  try {
    const sock = whatsappService.getSession(employeeId);
    
    // Normalize phone number (International format)
    let cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('05') && cleanPhone.length === 10) {
      cleanPhone = '966' + cleanPhone.slice(1);
    } else if (cleanPhone.startsWith('5') && cleanPhone.length === 9) {
      cleanPhone = '966' + cleanPhone;
    } else if (cleanPhone.startsWith('7') && cleanPhone.length === 9) {
      cleanPhone = '967' + cleanPhone;
    }

    const jid = `${cleanPhone}@s.whatsapp.net`;
    const audioBuffer = Buffer.from(base64Audio.split(',')[1] || base64Audio, 'base64');
    
    await sock.sendMessage(jid, { 
       audio: audioBuffer, 
       mimetype: 'audio/mp4', // Common for WA
       ptt: true // Push to talk style
    });
    res.status(200).json({ status: 'sent', to: jid });
  } catch (error) {
    console.error('[WA SEND-AUDIO ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
