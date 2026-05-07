require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Ensure sessions directory exists for Baileys Multi-Device state
const sessionsDir = process.env.WA_SESSION_PATH || path.join(__dirname, 'sessions');
if (!fs.existsSync(sessionsDir)) {
  fs.mkdirSync(sessionsDir, { recursive: true });
  console.log('[SYSTEM] Created sessions directory');
}

// Ensure uploads directory exists on the persistent disk
const uploadsDir = path.join(sessionsDir, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('[SYSTEM] Created uploads directory');
}

// Ensure Firebase is initialized on startup
require('./firebaseAdmin');
const distributionService = require('./services/distributionService');
const whatsappService = require('./services/whatsappService');
const scheduleService = require('./services/scheduleService');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Static files for media
app.use('/uploads', express.static(uploadsDir));

// Basic Routes
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'success', message: 'YZ_Almotakamel Backend is running!' });
});

// Feature routes
app.use('/api/whatsapp', require('./routes/whatsappRoutes'));
app.use('/api/employees', require('./routes/employeeRoutes'));
app.use('/api/orders', require('./routes/orderRoutes'));
app.use('/api/schedule', require('./routes/scheduleRoutes'));

// Global error handler
app.use((err, req, res, next) => {
  console.error('[EXPRESS ERROR]', err.stack);
  res.status(500).json({ status: 'error', message: 'بحثنا عن خطأ في الخادم وقمنا بإرجاعه.' });
});

// Catch unhandled promise rejections to prevent server crash
process.on('unhandledRejection', (reason, promise) => {
  console.error('[RUNTIME] Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[RUNTIME] Uncaught Exception:', err);
});

app.listen(PORT, async () => {
  console.log(`[SERVER] Running on http://localhost:${PORT}`);

  // --- STARTUP STATUS RESET ---
  // Ensure we don't show stale "connected" statuses if the server restarted
  try {
    const { rtdb } = require('./firebaseAdmin');
    const waStatusRef = rtdb.ref('wa_status');
    const snap = await waStatusRef.once('value');
    if (snap.exists()) {
      const updates = {};
      Object.keys(snap.val()).forEach(key => {
        updates[`${key}/isConnected`] = false;
        updates[`${key}/status`] = 'restarting';
      });
      await waStatusRef.update(updates);
      console.log('[SYSTEM] Reset stale WhatsApp statuses');
    }
  } catch (err) {
    console.error('[SYSTEM] Failed to reset statuses:', err.message);
  }

  // Start the automated distribution service
  if (distributionService && typeof distributionService.initDistributionListener === 'function') {
    distributionService.initDistributionListener();
  }

  // Start the schedule service
  if (scheduleService && typeof scheduleService.init === 'function') {
    scheduleService.init();
  }

  // --- AUTO-BOOT SESSIONS ---
  // Scan for saved credentials and re-init sessions automatically
  const sessionsParentDir = process.env.WA_SESSION_PATH || path.join(__dirname, 'sessions');
  if (fs.existsSync(sessionsParentDir)) {
    const files = fs.readdirSync(sessionsParentDir);
    console.log(`[AUTO-BOOT] Found ${files.filter(f => f.startsWith('session-')).length} potential sessions.`);

    let delay = 0;
    for (const employeeId of potentialSessions) {
      setTimeout(() => {
        whatsappService.initializeSession(employeeId).catch(err => {
          console.error(`[AUTO-BOOT] Failed for ${employeeId}:`, err.message);
        });
      }, delay);
      delay += 5000; // 5 second gap between each session
    }
  }

  // --- AUTO-CLEANUP MEDIA (Maintenance) ---
  // Periodically check and delete files older than 30 days to save disk space
  setInterval(() => {
    console.log('[MAINTENANCE] Running media cleanup...');
    const now = Date.now();
    const expiry = 30 * 24 * 60 * 60 * 1000; // 30 Days

    const uploadsPath = path.join(sessionsParentDir, 'uploads');
    if (fs.existsSync(uploadsPath)) {
      fs.readdirSync(uploadsPath).forEach(file => {
        const filePath = path.join(uploadsPath, file);
        try {
          const stats = fs.statSync(filePath);
          if (now - stats.mtimeMs > expiry) {
            fs.unlinkSync(filePath);
            console.log(`[MAINTENANCE] Deleted old file: ${file}`);
          }
        } catch (e) { }
      });
    }
  }, 24 * 60 * 60 * 1000); // Run once every 24 hours

  // --- ANTI-SLEEP (Keep Alive) ---
  const backendUrl = process.env.BACKEND_URL || 'https://yz-almotakamel-backend.onrender.com';
  if (backendUrl) {
    console.log(`[ANTI-SLEEP] Active: Pinging ${backendUrl} every 10 mins.`);
    setInterval(() => {
      const protocol = backendUrl.startsWith('https') ? https : http;
      protocol.get(`${backendUrl}/api/health`, (res) => {
        console.log(`[ANTI-SLEEP] Heartbeat sent. Status: ${res.statusCode}`);
      }).on('error', (err) => {
        console.warn('[ANTI-SLEEP] Heartbeat failed:', err.message);
      });
    }, 10 * 60 * 1000);
  }
});

