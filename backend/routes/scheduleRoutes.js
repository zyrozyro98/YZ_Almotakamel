const express = require('express');
const router = express.Router();
const scheduleService = require('../services/scheduleService');
const whatsappService = require('../services/whatsappService');
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

        // DEEP ERROR FIX: Upload shared media ONCE to avoid Firestore 'Base64 Bloat'
        let finalSharedMedia = sharedMedia;
        if (sharedMedia && sharedMedia.length > 500 && sharedMedia.includes('base64')) {
            console.log('[SCHEDULE] Optimizing shared media for bulk send...');
            const buffer = Buffer.from(sharedMedia.split(',')[1], 'base64');
            finalSharedMedia = await whatsappService.uploadToStorage(buffer, `bulk_${Date.now()}.jpg`, 'image/jpeg');
        }

        for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
            const chunk = messages.slice(i, i + CHUNK_SIZE);
            const batch = db.batch();
            
            // Process chunk with support for unique images (e.g. Attendance Folder)
            const processedChunk = await Promise.all(chunk.map(async (msg) => {
                const finalMsg = {
                    ...msg,
                    status: 'pending',
                    createdAt: Date.now(),
                    retryCount: 0
                };

                // Case A: Shared Media (One for all)
                if (finalSharedMedia && !finalMsg.base64Image) {
                    finalMsg.base64Image = finalSharedMedia; 
                    finalMsg.type = sharedType || 'image';
                    finalMsg.isOptimized = true;
                } 
                // Case B: Unique Media (Attendance Folder - Each image is different)
                else if (finalMsg.base64Image && finalMsg.base64Image.length > 500 && finalMsg.base64Image.includes('base64')) {
                    try {
                        const buffer = Buffer.from(finalMsg.base64Image.split(',')[1], 'base64');
                        const fileName = `unique_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
                        const url = await whatsappService.uploadToStorage(buffer, fileName, 'image/jpeg');
                        finalMsg.base64Image = url;
                        finalMsg.isOptimized = true;
                    } catch (uploadErr) {
                        console.error('[SCHEDULE] Individual upload failed:', uploadErr.message);
                        // Fallback: keep base64 if upload fails, though risky
                    }
                }

                return finalMsg;
            }));

            processedChunk.forEach(finalMsg => {
                const docRef = db.collection('scheduled_messages').doc();
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

// Cancel all pending messages (Optimized)
router.post('/cancel-all', async (req, res) => {
    try {
        const snapshot = await db.collection('scheduled_messages')
            .where('status', '==', 'pending')
            .get();
        
        if (snapshot.empty) {
            return res.json({ success: true, count: 0 });
        }

        const CHUNK_SIZE = 450;
        const docs = snapshot.docs;
        let totalDeleted = 0;

        for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
            const chunk = docs.slice(i, i + CHUNK_SIZE);
            const batch = db.batch();
            chunk.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            totalDeleted += chunk.length;
        }

        res.json({ success: true, count: totalDeleted });
    } catch (error) {
        console.error('[SCHEDULE CANCEL ALL ERROR]', error.message);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
