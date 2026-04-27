const express = require('express');
const router = express.Router();
const scheduleService = require('../services/scheduleService');
const { db } = require('../firebaseAdmin');

// Get all scheduled messages
router.get('/', async (req, res) => {
  try {
    const snapshot = await db.collection('scheduled_messages')
      .orderBy('scheduledAt', 'desc')
      .limit(100)
      .get();
    
    const messages = [];
    snapshot.forEach(doc => {
      messages.push({ id: doc.id, ...doc.data() });
    });
    
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Schedule a new message
router.post('/', async (req, res) => {
  try {
    const { 
      employeeId, 
      phoneNumber, 
      message, 
      scheduledAt, 
      fullJid, 
      senderName, 
      senderId, 
      base64Image, 
      type 
    } = req.body;

    if (!phoneNumber || !scheduledAt) {
      return res.status(400).json({ error: 'Missing phoneNumber or scheduledAt' });
    }

    const id = await scheduleService.scheduleMessage({
      employeeId: employeeId || 'auto',
      phoneNumber,
      message,
      scheduledAt: parseInt(scheduledAt),
      fullJid,
      senderName,
      senderId,
      base64Image,
      type: type || 'text'
    });

    res.json({ success: true, id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a scheduled message
router.delete('/:id', async (req, res) => {
  try {
    await db.collection('scheduled_messages').doc(req.params.id).delete();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bulk schedule (for group sender)
router.post('/bulk', async (req, res) => {
    try {
        const { messages } = req.body; // Array of message objects
        if (!Array.isArray(messages)) return res.status(400).json({ error: 'Invalid data' });

        const batch = db.batch();
        const ids = [];

        messages.forEach(msg => {
            const docRef = db.collection('scheduled_messages').doc();
            batch.set(docRef, {
                ...msg,
                status: 'pending',
                createdAt: Date.now(),
                retryCount: 0
            });
            ids.push(docRef.id);
        });

        await batch.commit();
        res.json({ success: true, count: ids.length });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
