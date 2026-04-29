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
        const { messages, sharedMedia, sharedType } = req.body;
        if (!Array.isArray(messages)) return res.status(400).json({ error: 'Invalid data' });

        // Firestore batch limit is 500
        const CHUNK_SIZE = 450;
        let totalCreated = 0;

        for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
            const chunk = messages.slice(i, i + CHUNK_SIZE);
            const batch = db.batch();
            
            chunk.forEach(msg => {
                const docRef = db.collection('scheduled_messages').doc();
                const finalMsg = {
                    ...msg,
                    status: 'pending',
                    createdAt: Date.now(),
                    retryCount: 0
                };

                // If shared media is provided and this message doesn't have its own, use shared
                if (sharedMedia && !finalMsg.base64Image) {
                    finalMsg.base64Image = sharedMedia;
                    finalMsg.type = sharedType || 'image';
                }

                batch.set(docRef, finalMsg);
            });

            await batch.commit();
            totalCreated += chunk.length;
        }

        res.json({ success: true, count: totalCreated });
    } catch (error) {
        console.error('[SCHEDULE BULK ERROR]', error.message);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
