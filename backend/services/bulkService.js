const { db, rtdb } = require('../firebaseAdmin');
const whatsappService = require('./whatsappService');
const { 
    simulateHumanTyping, 
    verifyJid, 
    parseSpintax, 
    addInvisibleJitter, 
    randomizeImage, 
    checkFrequency, 
    simulateRead 
} = require('../utils/antiBan');
const { getPureNumber } = require('../utils/numberUtils');

class BulkService {
    constructor() {
        this.jobs = new Map(); // employeeId -> { isRunning, isPaused, currentIndex, queue, ... }
    }

    async startJob(employeeId, jobData) {
        const { queue, messageTemplate, mode, manualFile, senderId, autoIncludedAccounts, autoMessagesPerSwitch, isSafeMode } = jobData;
        
        const job = {
            employeeId,
            isRunning: true,
            isPaused: false,
            currentIndex: 0,
            queue,
            messageTemplate,
            mode,
            manualFile, // base64 if manual
            senderId,
            autoIncludedAccounts,
            autoMessagesPerSwitch,
            isSafeMode,
            stats: { total: queue.length, sent: 0, failed: 0, pending: queue.length },
            startTime: Date.now()
        };

        this.jobs.set(employeeId, job);
        this.updateRtdbStatus(employeeId);
        
        // Start the processing loop in the background
        this.processQueue(employeeId).catch(err => {
            console.error(`[BULK ERROR] Job for ${employeeId} failed:`, err.message);
        });

        return { success: true };
    }

    async pauseJob(employeeId) {
        const job = this.jobs.get(employeeId);
        if (job) {
            job.isPaused = true;
            this.updateRtdbStatus(employeeId);
            return { success: true };
        }
        return { success: false, error: 'Job not found' };
    }

    async resumeJob(employeeId) {
        const job = this.jobs.get(employeeId);
        if (job && job.isPaused) {
            job.isPaused = false;
            this.updateRtdbStatus(employeeId);
            this.processQueue(employeeId);
            return { success: true };
        }
        return { success: false, error: 'Job not found or not paused' };
    }

    async stopJob(employeeId) {
        if (this.jobs.has(employeeId)) {
            this.jobs.delete(employeeId);
            await rtdb.ref(`bulk_jobs/${employeeId}`).remove();
            return { success: true };
        }
        return { success: false };
    }

    async updateRtdbStatus(employeeId) {
        const job = this.jobs.get(employeeId);
        if (!job) return;

        await rtdb.ref(`bulk_jobs/${employeeId}`).update({
            isRunning: job.isRunning,
            isPaused: job.isPaused,
            currentIndex: job.currentIndex,
            stats: job.stats,
            lastUpdate: Date.now()
        });
    }

    async addLog(employeeId, log) {
        const logId = Date.now();
        await rtdb.ref(`bulk_jobs/${employeeId}/logs/${logId}`).set({
            ...log,
            time: new Date().toLocaleTimeString('ar-SA')
        });
    }

    async processQueue(employeeId) {
        const job = this.jobs.get(employeeId);
        if (!job) return;

        let currentAutoIndex = 0;
        let messagesSentOnCurrentAuto = 0;

        while (job.currentIndex < job.queue.length) {
            // Check if job was stopped or paused
            if (!this.jobs.has(employeeId)) return;
            if (job.isPaused) return;

            const item = job.queue[job.currentIndex];
            let targetNumber = job.mode === 'folder' ? item.targetNumber : item;
            let fileToUpload = job.mode === 'folder' ? item.base64Image : job.manualFile;

            if (!targetNumber || targetNumber.length < 9) {
                job.stats.failed++;
                job.stats.pending--;
                await this.addLog(employeeId, { type: 'error', num: targetNumber || 'مجهول', msg: 'رقم غير صالح' });
            } else {
                let finalSenderId = job.senderId;

                // Smart Auto-Routing
                if (job.senderId === 'auto') {
                    const activeSenders = job.autoIncludedAccounts.filter(id => whatsappService.isSessionActive(id));
                    if (activeSenders.length === 0) {
                        job.isRunning = false;
                        await this.addLog(employeeId, { type: 'error', num: 'System', msg: 'لا يوجد حسابات متصلة للإرسال التلقائي' });
                        this.updateRtdbStatus(employeeId);
                        return;
                    }
                    
                    finalSenderId = activeSenders[currentAutoIndex % activeSenders.length];
                }

                // Anti-Ban Frequency Guard
                if (!checkFrequency(finalSenderId, 100)) {
                    await this.addLog(employeeId, { type: 'warning', num: 'System', msg: `الحساب ${finalSenderId} تجاوز حد الإرسال الآمن. جاري الانتظار...` });
                    await new Promise(r => setTimeout(r, 60000)); // Wait 1 min
                    continue; // Retry same index
                }

                try {
                    const sock = whatsappService.getSession(finalSenderId);
                    
                    // --- ENHANCED TEMPLATE PARSING (Variables) ---
                    let finalMessage = job.messageTemplate;
                    const cleanPhone = getPureNumber(targetNumber);
                    
                    // Fetch student data for variables
                    const studentSnap = await db.collection('students').where('phone', '==', cleanPhone).get();
                    if (!studentSnap.empty) {
                        const student = studentSnap.docs[0].data();
                        finalMessage = finalMessage.replace(/{name}/g, student.name || 'عزيزي الطالب');
                        finalMessage = finalMessage.replace(/{university}/g, student.university || '');
                        finalMessage = finalMessage.replace(/{major}/g, student.major || student.specialization || '');
                    } else {
                        finalMessage = finalMessage.replace(/{name}/g, 'عزيزي الطالب');
                        finalMessage = finalMessage.replace(/{university}/g, '');
                        finalMessage = finalMessage.replace(/{major}/g, '');
                    }
                    
                    // Generic Variables & Spintax
                    const greetings = ['مرحباً', 'أهلاً بك', 'السلام عليكم', 'تحية طيبة'];
                    const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];
                    finalMessage = finalMessage.replace(/{greeting}/g, randomGreeting);
                    finalMessage = parseSpintax(finalMessage);
                    finalMessage = addInvisibleJitter(finalMessage);

                    const targetJid = `${targetNumber}@s.whatsapp.net`;

                    // Human Simulation
                    await simulateHumanTyping(sock, targetJid, finalMessage);

                    if (fileToUpload) {
                        const buffer = Buffer.from(fileToUpload.split(',')[1], 'base64');
                        const randomizedBuffer = await randomizeImage(buffer);
                        await sock.sendMessage(targetJid, { image: randomizedBuffer, caption: finalMessage });
                    } else {
                        await sock.sendMessage(targetJid, { text: finalMessage });
                    }

                    await simulateRead(sock, targetJid).catch(() => {});

                    job.stats.sent++;
                    job.stats.pending--;
                    await this.addLog(employeeId, { type: 'success', num: targetNumber, msg: 'تم الإرسال بنجاح' });

                    // Auto-switching
                    if (job.senderId === 'auto') {
                        messagesSentOnCurrentAuto++;
                        if (messagesSentOnCurrentAuto >= job.autoMessagesPerSwitch) {
                            messagesSentOnCurrentAuto = 0;
                            currentAutoIndex++;
                        }
                    }

                } catch (err) {
                    job.stats.failed++;
                    job.stats.pending--;
                    await this.addLog(employeeId, { type: 'error', num: targetNumber, msg: `فشل: ${err.message}` });
                }
            }

            job.currentIndex++;
            this.updateRtdbStatus(employeeId);

            // Anti-Ban Delays
            if (job.currentIndex < job.queue.length) {
                const delay = job.isSafeMode ? (20000 + Math.random() * 10000) : (5000 + Math.random() * 5000);
                await new Promise(r => setTimeout(r, delay));
            }
        }

        job.isRunning = false;
        this.updateRtdbStatus(employeeId);
        await this.addLog(employeeId, { type: 'info', num: 'System', msg: 'اكتملت المهمة الجماعية' });
    }
}

module.exports = new BulkService();
