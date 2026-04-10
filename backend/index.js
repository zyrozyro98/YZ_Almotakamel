require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// Ensure sessions directory exists for Baileys Multi-Device state
const sessionsDir = path.join(__dirname, 'sessions');
if (!fs.existsSync(sessionsDir)) {
  fs.mkdirSync(sessionsDir, { recursive: true });
  console.log('[SYSTEM] Created sessions directory');
}

// Ensure Firebase is initialized on startup
require('./firebaseAdmin');
const distributionService = require('./services/distributionService');
const whatsappService = require('./services/whatsappService');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Basic Routes
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'success', message: 'YZ_Almotakamel Backend is running!' });
});

// Feature routes
app.use('/api/whatsapp', require('./routes/whatsappRoutes'));
app.use('/api/employees', require('./routes/employeeRoutes'));
app.use('/api/orders', require('./routes/orderRoutes'));

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
  
  // Start the automated distribution service
  if (distributionService && typeof distributionService.initDistributionListener === 'function') {
    distributionService.initDistributionListener();
  }

  // --- AUTO-BOOT SESSIONS ---
  // Scan for saved credentials and re-init sessions automatically
  const sessionsParentDir = path.join(__dirname, 'sessions');
  if (fs.existsSync(sessionsParentDir)) {
    const files = fs.readdirSync(sessionsParentDir);
    for (const file of files) {
      if (file.startsWith('session-')) {
        const employeeId = file.replace('session-', '');
        console.log(`[AUTO-BOOT] Restoring session for: ${employeeId}`);
        try {
          // Initialize without a QR callback since they should already be connected
          await whatsappService.initializeSession(employeeId);
        } catch (err) {
          console.error(`[AUTO-BOOT] Failed to restore ${employeeId}:`, err.message);
        }
      }
    }
  }
});

