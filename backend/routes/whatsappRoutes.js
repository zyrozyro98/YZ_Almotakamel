const express = require('express');
const router = express.Router();
const whatsappService = require('../services/whatsappService');
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

  let qrSent = false;

  try {
    // Create a promise that resolves when either QR is generated OR session is confirmed connected
    const sessionPromise = new Promise(async (resolve, reject) => {
      let resolved = false;

      const sock = await whatsappService.initializeSession(employeeId, (qrString) => {
        if (!resolved) {
          resolved = true;
          resolve({ status: 'qr_generated', qr: qrString });
        }
      });

      // Check if already connected immediately
      const status = whatsappService.getConnectionStatus(employeeId);
      if (status.isConnected && !resolved) {
          resolved = true;
          resolve({ status: 'connected' });
      }

      // Timeout as fallback - Increased to 15s for stability
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve({ status: 'timeout', message: 'The server is taking longer than usual. Please try refreshing status.' });
        }
      }, 15000);
    });

    const result = await sessionPromise;
    res.status(200).json(result);

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
    const sock = whatsappService.getSession(employeeId);
    // Format number to Jid
    const jid = `${phoneNumber.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
    
    await sock.sendMessage(jid, { text: message });
    res.status(200).json({ status: 'sent', to: jid });
  } catch (error) {
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
    const jid = `${phoneNumber.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
    const imageBuffer = Buffer.from(base64Image.split(',')[1] || base64Image, 'base64');
    
    await sock.sendMessage(jid, { 
       image: imageBuffer, 
       caption: caption || '' 
    });
    res.status(200).json({ status: 'sent', to: jid });
  } catch (error) {
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
    const jid = `${phoneNumber.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
    const audioBuffer = Buffer.from(base64Audio.split(',')[1] || base64Audio, 'base64');
    
    await sock.sendMessage(jid, { 
       audio: audioBuffer, 
       mimetype: 'audio/mp4', // Common for WA
       ptt: true // Push to talk style
    });
    res.status(200).json({ status: 'sent', to: jid });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
