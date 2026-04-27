const { db, rtdb } = require('../firebaseAdmin');
const whatsappService = require('./whatsappService');
const { getPureNumber } = require('../utils/numberUtils');

class ScheduleService {
  constructor() {
    this.checkInterval = null;
  }

  init() {
    console.log('[SCHEDULE] Initializing Schedule Service...');
    this.startChecking();
  }

  startChecking() {
    // Check every minute
    this.checkInterval = setInterval(() => this.checkScheduledMessages(), 60000);
    // Add a small delay on startup to ensure sessions have a chance to auto-boot
    setTimeout(() => this.checkScheduledMessages(), 10000);
  }

  async checkScheduledMessages() {
    const now = Date.now();
    console.log(`[SCHEDULE] Checking messages due at ${new Date(now).toLocaleString()}`);

    try {
      // 1. Fetch pending messages
      const pendingSnapshot = await db.collection('scheduled_messages')
        .where('status', '==', 'pending')
        .where('scheduledAt', '<=', now)
        .limit(20)
        .get();

      // 2. Fetch failed messages for retry (max 3 retries)
      const retrySnapshot = await db.collection('scheduled_messages')
        .where('status', '==', 'failed')
        .where('retryCount', '<', 3)
        .where('scheduledAt', '<=', now - 300000) // Wait 5 mins between retries
        .limit(5)
        .get();

      const allDocs = [...pendingSnapshot.docs, ...retrySnapshot.docs];

      if (allDocs.length === 0) {
        console.log('[SCHEDULE] No messages due for sending or retry.');
        return;
      }

      console.log(`[SCHEDULE] Found ${allDocs.length} messages to process (${pendingSnapshot.size} new, ${retrySnapshot.size} retries).`);

      for (const doc of allDocs) {
        const data = doc.data();
        await this.sendScheduledMessage(doc.id, data);
      }
    } catch (error) {
      console.error('[SCHEDULE ERROR] Failed to check messages:', error.message);
    }
  }

  async sendScheduledMessage(id, data) {
    const { employeeId, phoneNumber, message, fullJid, senderName, senderId, base64Image, type } = data;
    
    try {
      // Mark as sending
      await db.collection('scheduled_messages').doc(id).update({ status: 'sending' });

      // Try to find a connected session
      let activeEmpId = employeeId;
      let sock = null;

      try {
        sock = whatsappService.getSession(activeEmpId);
      } catch (e) {
        // Fallback to auto-routing if the assigned employee is offline
        console.log(`[SCHEDULE] Assigned employee ${activeEmpId} offline, attempting auto-routing...`);
        const waStatusSnap = await rtdb.ref('wa_status').once('value');
        if (waStatusSnap.exists()) {
          const statuses = waStatusSnap.val();
          for (const key in statuses) {
            if (statuses[key].isConnected) {
              activeEmpId = key;
              sock = whatsappService.getSession(activeEmpId);
              break;
            }
          }
        }
      }

      if (!sock || !sock.user) {
        throw new Error(`No connected WhatsApp sessions available for scheduling.`);
      }

      // Resolve target JID
      let targetJid = fullJid;
      if (!targetJid) {
        let finalPhone = getPureNumber(phoneNumber);
        if (finalPhone.startsWith('5')) finalPhone = '966' + finalPhone;
        else if (finalPhone.startsWith('7')) finalPhone = '967' + finalPhone;
        targetJid = `${finalPhone}@s.whatsapp.net`;
      }

      console.log(`[SCHEDULE] Sending message ${id} via ${activeEmpId} to ${targetJid}`);

      // --- HUMAN SIMULATION ---
      await sock.sendPresenceUpdate('composing', targetJid);
      await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));
      await sock.sendPresenceUpdate('paused', targetJid);

      let result;
      if (type === 'image' && base64Image) {
        const buffer = Buffer.from(base64Image.split(',')[1], 'base64');
        result = await sock.sendMessage(targetJid, { image: buffer, caption: message || "" });
      } else {
        result = await sock.sendMessage(targetJid, { text: message });
      }

      // Record in RTDB
      const chatId = getPureNumber(phoneNumber || targetJid);
      const msgData = {
        id: result.key.id,
        text: message || (type === 'image' ? '📷 صورة' : ''),
        type: type || 'text',
        time: Date.now(),
        sender: "me",
        senderName: senderName || "جدولة تلقائية",
        senderId: senderId || "scheduler"
      };

      await rtdb.ref(`chats/${activeEmpId}/${chatId}/messages/${result.key.id}`).update(msgData).catch(() => {});
      await rtdb.ref(`chats/${activeEmpId}/${chatId}`).update({
        lastMessage: msgData.text,
        timestamp: Date.now(),
        phone: chatId,
        fullJid: targetJid,
        lastSender: "me"
      }).catch(() => {});

      // Mark as sent
      await db.collection('scheduled_messages').doc(id).update({
        status: 'sent',
        sentAt: Date.now(),
        actualEmployeeId: activeEmpId
      });

      console.log(`[SCHEDULE] Successfully sent message ${id}`);
    } catch (error) {
      console.error(`[SCHEDULE ERROR] Failed to send ${id}:`, error.message);
      await db.collection('scheduled_messages').doc(id).update({
        status: 'failed',
        error: error.message,
        retryCount: (data.retryCount || 0) + 1
      });
    }
  }

  async scheduleMessage(msgData) {
    const docRef = await db.collection('scheduled_messages').add({
      ...msgData,
      status: 'pending',
      createdAt: Date.now(),
      retryCount: 0
    });
    return docRef.id;
  }
}

module.exports = new ScheduleService();
