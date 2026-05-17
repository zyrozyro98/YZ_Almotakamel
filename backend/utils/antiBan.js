/**
 * Anti-Ban and Human Simulation Utilities (Advanced)
 * Version 2.0 - Multi-Algorithm Evade System
 */

const BROWSERS = [
  ['Windows', 'Chrome', '122.0.6261.129'],
  ['Mac OS', 'Chrome', '122.0.6261.129'],
  ['Windows', 'Edge', '122.0.2365.92'],
  ['Mac OS', 'Safari', '17.3.1'],
  ['Linux', 'Firefox', '123.0']
];

/**
 * Returns a random browser configuration for Baileys
 */
function getRandomBrowser() {
  return BROWSERS[Math.floor(Math.random() * BROWSERS.length)];
}

/**
 * Returns a stable browser for a specific ID to ensure consistency
 */
function getStableBrowser(id) {
  const index = Math.abs(id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)) % BROWSERS.length;
  const base = BROWSERS[index];
  return [base[0], base[1], base[2]];
}

/**
 * Calculates a human-like delay based on message length and complexity
 */
function getTypingDelay(text = '') {
  const baseDelay = 2000;
  // Dynamic speed: slower for longer messages, with random "thought" pauses
  const perCharDelay = Math.random() * 25 + 35; 
  const thoughtPause = text.length > 50 ? (Math.random() * 2000) : 0;
  const jitter = Math.random() * 1500;
  
  const total = baseDelay + (text.length * perCharDelay) + thoughtPause + jitter;
  return Math.min(total, 12000); // Cap at 12 seconds for realism
}

/**
 * Advanced Spintax implementation: {Hi|Hello|Hey} there!
 */
function parseSpintax(text) {
  if (!text) return text;
  let currentText = text;
  while (/{([^{}]+)}/g.test(currentText)) {
    currentText = currentText.replace(/{([^{}]+)}/g, (match, options) => {
      const choices = options.split('|');
      return choices[Math.floor(Math.random() * choices.length)];
    });
  }
  return currentText;
}

/**
 * Multi-Layer Invisible Jitter
 * Uses a combination of Zero-Width Space, Zero-Width Joiner, and Right-to-Left marks
 * to ensure every message has a unique cryptographic hash without changing appearance.
 */
function addInvisibleJitter(text) {
  // Disabled: WhatsApp servers are silently dropping messages containing Zero-Width characters.
  return text;
}

/**
 * Simulates a realistic human typing flow with presence updates
 * Incorporates "Burst Typing" and "Proofreading Pauses"
 */
async function simulateHumanTyping(sock, jid, text = '') {
  try {
    if (!sock || !jid) return;

    // 1. Appear "Online" (Available) first - Real humans are online before they type
    await sock.sendPresenceUpdate('available', jid);
    const thinkingDelay = 1500 + Math.random() * 3000;
    await new Promise(r => setTimeout(r, thinkingDelay));
    
    // 2. Composing state
    await sock.sendPresenceUpdate('composing', jid);
    
    // 3. Burst Typing simulation
    const totalDelay = getTypingDelay(text);
    const words = text.split(' ');
    const numBursts = Math.max(1, Math.floor(words.length / 5)); 
    
    for (let i = 0; i < numBursts; i++) {
        await new Promise(r => setTimeout(r, (totalDelay * 0.7) / numBursts));
        
        if (Math.random() > 0.8) {
            await sock.sendPresenceUpdate('paused', jid);
            await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));
            await sock.sendPresenceUpdate('composing', jid);
        }
    }
    
    // 4. Final hesitation before hit send
    await sock.sendPresenceUpdate('paused', jid);
    await new Promise(r => setTimeout(r, 500 + Math.random() * 1000));
  } catch (e) {
    console.warn('[ANTIBAN] Presence update failed:', e.message);
  }
}

/**
 * Simulates marking a message as read (Important for looking like a real user)
 */
async function simulateRead(sock, jid, messageId) {
    try {
        if (!sock || !jid) return;
        await sock.readMessages([{ remoteJid: jid, id: messageId, fromMe: false }]);
    } catch (e) {}
}

/**
 * Checks if a number is on WhatsApp before sending
 */
async function verifyJid(sock, jid) {
  if (jid.includes('@g.us') || jid.includes('@newsletter') || jid.includes('@lid')) return true;
  try {
    const [result] = await sock.onWhatsApp(jid);
    return !!(result && result.exists);
  } catch (e) {
    console.warn('[ANTIBAN] JID verification failed:', e.message);
    return true; 
  }
}

/**
 * Advanced Image Randomization (Bypass Hash Detection)
 * Applies unnoticeable binary changes to the image buffer.
 */
async function randomizeImage(buffer) {
  try {
    const sharp = require('sharp');
    const metadata = await sharp(buffer).metadata();
    
    let pipeline = sharp(buffer);
    
    // 1. Apply unnoticeable rotation (0.01 to 0.05 degrees)
    const rotation = (Math.random() * 0.04) + 0.01;
    pipeline = pipeline.rotate(rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } });
    
    // 2. Tiny crop (1 pixel off from a random side)
    const side = ['top', 'left', 'right', 'bottom'][Math.floor(Math.random() * 4)];
    pipeline = pipeline.extract({
        left: side === 'left' ? 1 : 0,
        top: side === 'top' ? 1 : 0,
        width: metadata.width - (side === 'left' || side === 'right' ? 1 : 0),
        height: metadata.height - (side === 'top' || side === 'bottom' ? 1 : 0)
    });

    // 3. Unnoticeable brightness shift (+/- 0.5%)
    const brightness = 0.995 + (Math.random() * 0.01);
    pipeline = pipeline.modulate({ brightness });

    // 4. Randomize JPEG/PNG quality
    const quality = 75 + Math.floor(Math.random() * 10);

    // 5. SCRUB & RANDOMIZE METADATA (Deep Hash Change)
    return await pipeline
      .withMetadata({
        orientation: 1,
        exif: {
          IFD0: {
            Copyright: `WA-IMAGE-${Date.now()}`,
            Software: `WhatsApp/2.24.5.76`,
            DateTime: new Date().toISOString()
          }
        }
      })
      .jpeg({ quality, force: false, progressive: true, mozjpeg: true })
      .png({ quality: quality + 10, force: false })
      .toBuffer();
  } catch (e) {
    console.warn('[ANTIBAN] Advanced image randomization failed:', e.message);
    return buffer;
  }
}

/**
 * Persistent Frequency Guard with Dynamic Quota Scaling
 * Automatically lowers limits for new numbers based on firstConnectionTime
 */
async function checkFrequency(rtdb, empId, baseLimit = 100, timeframe = 3600000) {
    try {
        const now = Date.now();
        
        // 1. Fetch Account Age & Custom Overrides
        const statusSnap = await rtdb.ref(`wa_status/${empId}`).once('value');
        const statusData = statusSnap.val() || {};
        
        let dynamicLimit = baseLimit;
        let ageInDays = 0;
        
        const firstConnectionTime = statusData.firstConnectionTime || now;
        ageInDays = (now - firstConnectionTime) / (1000 * 60 * 60 * 24);
        
        // Dynamic Quota Scaling & Manual Custom Override
        if (statusData.customLimit !== undefined && statusData.customLimit !== null) {
            // Allows manual override per number from Firebase RTDB (e.g. set customLimit to 250 to bypass age check)
            dynamicLimit = Number(statusData.customLimit);
        } else {
            // Read general dynamic settings from database if available (or use defaults)
            const limitsSnap = await rtdb.ref('settings/anti_ban_limits').once('value');
            const customLimits = limitsSnap.val() || {};
            
            // You can increase these default values if you want a higher limit for new numbers
            const d1 = customLimits.day1 !== undefined ? Number(customLimits.day1) : 100; // was 15
            const d3 = customLimits.day3 !== undefined ? Number(customLimits.day3) : 200; // was 40
            const d7 = customLimits.day7 !== undefined ? Number(customLimits.day7) : 300; // was 80

            if (ageInDays < 1) {
                dynamicLimit = Math.min(baseLimit, d1); // Day 1
            } else if (ageInDays < 3) {
                dynamicLimit = Math.min(baseLimit, d3); // Day 1-3
            } else if (ageInDays < 7) {
                dynamicLimit = Math.min(baseLimit, d7); // Day 3-7
            }
        }
        
        const ref = rtdb.ref(`anti_ban_stats/${empId}`);
        const snap = await ref.once('value');
        const stats = snap.val() || { count: 0, startTime: now };
        
        if (now - stats.startTime > timeframe) {
            await ref.set({ count: 1, startTime: now });
            return true;
        }
        
        if (stats.count >= dynamicLimit) {
            console.log(`[ANTI-BAN] Account ${empId} hit dynamic limit (${dynamicLimit}) based on age (${Math.round(ageInDays)} days).`);
            return false;
        }
        
        await ref.update({ count: stats.count + 1 });
        return true;
    } catch (e) {
        return true; // Fail safe
    }
}

/**
 * Simulates a "Heartbeat" - Appearing online naturally without sending anything
 */
async function simulateHeartbeat(sock) {
    try {
        if (!sock || !sock.user) return;
        
        // 1. Go Online
        await sock.sendPresenceUpdate('available');
        
        // 2. Stay online for 15-45 seconds (Human scroll time)
        const duration = 15000 + Math.random() * 30000;
        await new Promise(r => setTimeout(r, duration));
        
        // 3. Go Offline
        await sock.sendPresenceUpdate('unavailable');
        
        console.log(`[ANTIBAN] Heartbeat simulated for ${sock.user.id.split(':')[0]}`);
    } catch (e) {}
}

module.exports = {
  getRandomBrowser,
  getStableBrowser,
  getTypingDelay,
  parseSpintax,
  addInvisibleJitter,
  simulateHumanTyping,
  simulateRead,
  verifyJid,
  randomizeImage,
  checkFrequency,
  simulateHeartbeat
};
