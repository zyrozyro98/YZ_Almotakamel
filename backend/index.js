const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { db, rtdb } = require('./firebaseAdmin');
const whatsappService = require('./services/whatsappService');
const scheduleService = require('./services/scheduleService');
const distributionService = require('./services/distributionService');
const http = require('http');

// Global Crash Guard for Baileys/Node.js crypto errors (AES/GCM)
process.on('uncaughtException', (err) => {
  console.error('[GLOBAL CRASH GUARD] Caught exception:', err);
  if (err.message && (err.message.includes('Unsupported state') || err.message.includes('authenticate data'))) {
    console.warn('[GLOBAL CRASH GUARD] Preventing process exit from Baileys AES error.');
    return; 
  }
  // For fatal errors, we allow the crash so Render restarts the process
  if (err.name === 'SyntaxError' || err.name === 'ReferenceError') {
     process.exit(1);
  }
});

// Ensure sessions directory exists for Baileys Multi-Device state
const sessionsDir = process.env.WA_SESSION_PATH ? 
  (path.isAbsolute(process.env.WA_SESSION_PATH) ? process.env.WA_SESSION_PATH : path.join(__dirname, process.env.WA_SESSION_PATH)) : 
  path.join(__dirname, 'sessions');

if (!fs.existsSync(sessionsDir)) {
  fs.mkdirSync(sessionsDir, { recursive: true });
  console.log('[SYSTEM] Created NEW sessions directory at:', sessionsDir);
} else {
  const files = fs.readdirSync(sessionsDir);
  console.log(`[DISK CHECK] Sessions directory found at ${sessionsDir}. Contains ${files.length} items. Persistence is ACTIVE.`);
}

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('[SYSTEM] Created uploads directory');
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// Routes
const employeeRoutes = require('./routes/employeeRoutes');
const whatsappRoutes = require('./routes/whatsappRoutes');
const orderRoutes = require('./routes/orderRoutes');
const scheduleRoutes = require('./routes/scheduleRoutes');
const studentRoutes = require('./routes/studentRoutes');

// Serve static files from the 'uploads' directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/employees', employeeRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api/students', studentRoutes);

// Maintenance & Auto-Init Sessions
async function maintenance() {
  try {
    const waStatusRef = rtdb.ref('wa_status');
    const snap = await waStatusRef.once('value');
    if (snap.exists()) {
      const statuses = snap.val();
      for (const empId in statuses) {
        if (statuses[empId].status === 'connecting' || statuses[empId].status === 'qr_ready') {
          await waStatusRef.child(empId).update({ status: 'disconnected', isConnected: false, qr: null });
        }
      }
    }

    // AUTO-INIT: Try to restore all active sessions from Firestore
    console.log('[SYSTEM] Attempting to auto-restore active WhatsApp sessions...');
    const employeesSnap = await db.collection('employees').get();
    for (const doc of employeesSnap.docs) {
       const empId = doc.id;
       // We call initialize without onQrGenerated to let it restore in background
       whatsappService.initializeSession(empId).catch(e => {
         console.warn(`[SYSTEM] Auto-init failed for ${empId}:`, e.message);
       });
    }

  } catch (e) {
    console.error('[MAINTENANCE ERROR]', e);
  }
}

const PORT = process.env.PORT || 10000;
const server = http.createServer(app);

server.listen(PORT, '0.0.0.0', async () => {
  console.log(`[SERVER] Running on http://localhost:${PORT}`);
  
  await maintenance();
  
  // Start distribution service
  distributionService.initDistributionListener();
  
  // SYNC: Populate RTDB with active students for quota-proof dashboard
  distributionService.syncActiveStudentsToRtdb();
  
  // Start schedule service
  scheduleService.init();

  // --- AUTO-BOOT SESSIONS ---
  // Detect active sessions from Firestore and re-init sessions automatically
  try {
    const sessionsSnap = await db.collection('whatsapp_sessions').get();
    const potentialSessions = sessionsSnap.docs.map(doc => doc.id);
    console.log(`[AUTO-BOOT] Found ${potentialSessions.length} potential sessions in Firestore.`);

    let delay = 0;
    for (const employeeId of potentialSessions) {
      setTimeout(() => {
        console.log(`[AUTO-BOOT] Restoring session for: ${employeeId}`);
        whatsappService.initializeSession(employeeId).catch(err => {
          console.error(`[AUTO-BOOT ERROR] Failed for ${employeeId}:`, err.message);
        });
      }, delay);
      delay += 10000; // Increased to 10 seconds to prevent memory spikes
    }
  } catch (e) {
    console.error('[AUTO-BOOT] Failed to scan sessions:', e.message);
  }

  // Anti-sleep mechanism (Ping itself)
  const appUrl = process.env.BACKEND_URL || `http://localhost:${PORT}`;
  setInterval(() => {
    fetch(appUrl)
      .then(res => console.log(`[ANTI-SLEEP] Heartbeat sent. Status: ${res.status}`))
      .catch(e => console.error(`[ANTI-SLEEP ERROR] Heartbeat failed: ${e.message}`));
  }, 600000); // 10 minutes
});

app.get('/', (req, res) => res.send('YZ Almotakamel Backend is Running.'));
