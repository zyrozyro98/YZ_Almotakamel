const { db, rtdb } = require('../firebaseAdmin');
const whatsappService = require('./whatsappService');
const { getPureNumber } = require('../utils/numberUtils');
const { simulateHumanTyping, verifyJid, parseSpintax, addInvisibleJitter, randomizeImage, checkFrequency, simulateRead } = require('../utils/antiBan');

class ScheduleService {
  constructor() {
    this.checkInterval = null;
    this.isProcessing = false;
  }

  init() {
    console.log('[SCHEDULE] Initializing Schedule Service...');
    this.startChecking();
  }

  startChecking() {
    // Check every minute
    if (this.checkInterval) clearInterval(this.checkInterval);
    this.checkInterval = setInterval(() => this.checkScheduledMessages(), 60000);
    
    // Initial run with small delay
    setTimeout(() => this.checkScheduledMessages(), 5000);
  }

  async checkScheduledMessages() {
    if (this.isProcessing) {
      console.log('[SCHEDULE] Already processing, skipping this tick.');
      return;
    }

    const now = Date.now();
    this.isProcessing = true;

    try {
      // 1. Fetch pending messages - increase limit to handle larger volume
      const pendingSnapshot = await db.collection('scheduled_messages')
        .where('status', '==', 'pending')
        .where('scheduledAt', '<=', now)
        .limit(100) // Increased from 20
        .get();

      // 2. Fetch failed messages for retry
      const retrySnapshot = await db.collection('scheduled_messages')
        .where('status', '==', 'failed')
        .where('retryCount', '<', 3)
        .where('scheduledAt', '<=', now - 300000)
        .limit(20)
        .get();

      const allDocs = [...pendingSnapshot.docs, ...retrySnapshot.docs];

      if (allDocs.length === 0) {
        this.isProcessing = false;
        return;
      }

      console.log(`[SCHEDULE] Processing ${allDocs.length} messages...`);

      // Group by employee to parallelize across different sessions
      const messagesByEmployee = {};
      allDocs.forEach(doc => {
        const data = doc.data();
        const empId = data.employeeId || 'auto';
        if (!messagesByEmployee[empId]) messagesByEmployee[empId] = [];
        messagesByEmployee[empId].push({ id: doc.id, data });
      });

      // Run workers for each employee in parallel
      const employeeIds = Object.keys(messagesByEmployee);
      await Promise.all(employeeIds.map(async (empId) => {
        for (const item of messagesByEmployee[empId]) {
          // Anti-Ban Frequency Guard (Limit to 80 messages per hour per account by default)
          const isAuto = empId === 'auto';
          const targetEmpId = isAuto ? 'system' : empId; // Use system if auto

          if (!checkFrequency(targetEmpId, 100)) {
            console.log(`[SCHEDULE] Account ${targetEmpId} hit frequency limit, skipping this message.`);
            continue;
          }

          await this.sendScheduledMessage(item.id, item.data);
          
          // Random Human-like Rest (Stochastic jitter)
          if (Math.random() > 0.95) {
            // 5% chance of a longer break (2-5 mins) to simulate human walking away
            const restTime = 120000 + Math.random() * 180000;
            console.log(`[SCHEDULE] ${targetEmpId} taking a long human-like break (${Math.round(restTime/1000)}s)...`);
            await new Promise(r => setTimeout(r, restTime));
          } else {
            // Standard Gap (6-15 seconds) - increased for safety
            await new Promise(r => setTimeout(r, 6000 + Math.random() * 9000));
          }
        }
      }));

    } catch (error) {
      console.error('[SCHEDULE ERROR] Failed to check messages:', error.message);
    } finally {
      this.isProcessing = false;
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

      const isValidSession = (id) => {
        try {
          const s = whatsappService.getSession(id);
          return s && s.user && whatsappService.isSessionActive(id);
        } catch (e) { return false; }
      };

      if (activeEmpId === 'auto' || !isValidSession(activeEmpId)) {
        console.log(`[SCHEDULE] Assigned employee ${activeEmpId} unavailable, attempting auto-routing...`);
        const waStatusSnap = await rtdb.ref('wa_status').once('value');
        if (waStatusSnap.exists()) {
          const statuses = waStatusSnap.val();
          for (const key in statuses) {
            if (statuses[key].isConnected && key !== 'emp1' && isValidSession(key)) {
              activeEmpId = key;
              sock = whatsappService.getSession(activeEmpId);
              break;
            }
          }
        }
      } else {
        sock = whatsappService.getSession(activeEmpId);
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
      
      // 1. Verify JID (Safety check)
      const exists = await verifyJid(sock, targetJid);
      if (!exists) {
        throw new Error(`Number ${targetJid} is not on WhatsApp.`);
      }

      // 2. Prepare Content (Spintax & Jitter)
      const finalMessage = addInvisibleJitter(parseSpintax(message || ''));

      // 3. Human Simulation (Typing delay)
      await simulateHumanTyping(sock, targetJid, finalMessage);

      let result;
      if (type === 'image' && base64Image) {
        let buffer = Buffer.from(base64Image.split(',')[1], 'base64');
        buffer = await randomizeImage(buffer);
        result = await sock.sendMessage(targetJid, { image: buffer, caption: finalMessage || "" });
        // Simulating that we "read" our own confirmation or previous context
        await simulateRead(sock, targetJid).catch(() => {});
      } else {
        result = await sock.sendMessage(targetJid, { text: finalMessage });
        await simulateRead(sock, targetJid).catch(() => {});
      }

      // 5. Record in RTDB
      const chatId = getPureNumber(phoneNumber || targetJid);
      
      // Resolve Name from Firestore to ensure the chat list looks good
      let resolvedName = null;
      try {
        const studentSnap = await db.collection('students').where('phone', '==', chatId).limit(1).get();
        if (!studentSnap.empty) {
          resolvedName = `${studentSnap.docs[0].data().name} (${chatId})`;
        }
      } catch (e) { }

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
        name: resolvedName || chatId,
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
