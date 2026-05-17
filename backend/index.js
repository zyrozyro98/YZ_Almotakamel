require('dotenv').config();
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

    // AUTO-INIT: Try to restore ONLY active sessions to save massive RAM (Prevent OOM)
    console.log('[SYSTEM] Attempting to auto-restore active WhatsApp sessions...');
    
    const waSessionsSnap = await rtdb.ref('wa_sessions').once('value');
    let initializedCount = 0;
    
    if (waSessionsSnap.exists()) {
      const sessionsMap = waSessionsSnap.val();
      const credsHex = Buffer.from('creds').toString('hex'); // 6372656473

      for (const empId in sessionsMap) {
        // LIMITATION: Do not restore more than 4 active sessions automatically on Render Free (512MB limit)
        // Additional sessions can be manually started from the dashboard as needed.
        if (initializedCount >= 4) {
          console.log(`[SYSTEM] Restored maximum allowed sessions (4) for 512MB RAM constraint. Skipping remaining sessions.`);
          break;
        }

        if (sessionsMap[empId] && sessionsMap[empId][credsHex]) {
          try {
            const credsStr = sessionsMap[empId][credsHex];
            const credsObj = JSON.parse(credsStr);
            
            // CRITICAL FIX: Only auto-restore sessions that are ACTUALLY authenticated (have 'me' object).
            // This prevents starting empty, unscanned sessions which would leak memory and trigger timeouts.
            if (credsObj && credsObj.me) {
              // DYNAMIC RAM SAFEGUARD: Check actual RSS memory usage of Node process
              const rssMB = Math.round(process.memoryUsage().rss / 1024 / 1024);
              if (rssMB > 320) {
                console.warn(`[SYSTEM] RAM Alert: Current process memory is ${rssMB}MB RSS. Halting auto-restore to avoid OOM crash.`);
                break;
              }

              console.log(`[SYSTEM] Auto-restoring linked session for employee: ${empId} (${credsObj.me.id || credsObj.me.name || 'Active'})`);
              whatsappService.initializeSession(empId).catch(() => {});
              
              // Stagger by 8 seconds on startup to allow GC to settle and sockets to initialize safely
              await new Promise(r => setTimeout(r, 8000));
              initializedCount++;
            }
          } catch (e) {
            console.error(`[SYSTEM] Error parsing creds for ${empId}:`, e.message);
          }
        }
      }
    }
    console.log(`[SYSTEM] Auto-initialized ${initializedCount} active sessions with valid credentials.`);

  } catch (e) {
    console.error('[MAINTENANCE ERROR]', e);
  }
}

const PORT = process.env.PORT || 10000;
const server = http.createServer(app);

server.listen(PORT, '0.0.0.0', async () => {
  console.log(`[SERVER] Running on http://localhost:${PORT}`);
  
  await maintenance();
  
  // Sync core data to RTDB (Quota-proof Cache)
  await distributionService.syncEmployeesToRtdb();
  await distributionService.syncActiveStudentsToRtdb();

  // Start background services
  distributionService.initDistributionListener();
  scheduleService.init();

  console.log('[SYSTEM] Backend initialization complete.');

  // Anti-sleep mechanism (Ping itself)
  const appUrl = process.env.BACKEND_URL || `http://localhost:${PORT}`;
  setInterval(() => {
    fetch(appUrl)
      .then(res => console.log(`[ANTI-SLEEP] Heartbeat sent. Status: ${res.status}`))
      .catch(e => console.error(`[ANTI-SLEEP ERROR] Heartbeat failed: ${e.message}`));
  }, 600000); // 10 minutes
});

app.get('/', (req, res) => res.send('YZ Almotakamel Backend is Running.'));
app.get('/api/health', (req, res) => res.status(200).json({ status: 'ok' }));
