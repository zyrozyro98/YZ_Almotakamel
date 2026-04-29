/**
 * Anti-Ban and Human Simulation Utilities (Advanced)
 * Version 2.0 - Multi-Algorithm Evade System
 */

const BROWSERS = [
  ['Ubuntu', 'Chrome', '114.0.5735.199'],
  ['Windows', 'Chrome', '115.0.0.0'],
  ['Mac OS', 'Safari', '16.5'],
  ['Linux', 'Firefox', '114.0'],
  ['Windows', 'Edge', '114.0.1823.67'],
  ['Android', 'Chrome', '114.0.5735.196'],
  ['iPhone', 'Safari', '16.5']
];

/**
 * Returns a random browser configuration for Baileys
 */
function getRandomBrowser() {
  return BROWSERS[Math.floor(Math.random() * BROWSERS.length)];
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
  if (!text) return text;
  const invisibleChars = ['\u200B', '\u200C', '\u200D', '\uFEFF'];
  
  // Inject at least 2 random invisible characters at random positions
  let result = text;
  for (let i = 0; i < 2; i++) {
    const char = invisibleChars[Math.floor(Math.random() * invisibleChars.length)];
    const pos = Math.floor(Math.random() * result.length);
    result = result.slice(0, pos) + char + result.slice(pos);
  }
  
  // Occasionally add a random number of spaces at the end
  if (Math.random() > 0.3) {
    result += " ".repeat(Math.floor(Math.random() * 3));
  }
  
  return result;
}

/**
 * Simulates a realistic human typing flow with presence updates
 */
async function simulateHumanTyping(sock, jid, text = '') {
  try {
    // 1. Initial delay before starting to type (Thinking)
    await new Promise(r => setTimeout(r, 500 + Math.random() * 1000));
    
    // 2. Composing state
    await sock.sendPresenceUpdate('composing', jid);
    const delay = getTypingDelay(text);
    
    // Split delay into segments to handle "burst" typing
    const segments = 3;
    for (let i = 0; i < segments; i++) {
        await new Promise(r => setTimeout(r, delay / segments));
        // Small chance of "pausing" to think during typing
        if (Math.random() > 0.8) await new Promise(r => setTimeout(r, 1000 + Math.random() * 1500));
    }
    
    // 3. Pause state before sending
    await sock.sendPresenceUpdate('paused', jid);
    await new Promise(r => setTimeout(r, 300 + Math.random() * 700));
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
  if (jid.includes('@g.us') || jid.includes('@newsletter')) return true;
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
    const quality = 78 + Math.floor(Math.random() * 7);

    return await pipeline
      .jpeg({ quality, force: false, progressive: true })
      .png({ quality: quality + 10, force: false })
      .toBuffer();
  } catch (e) {
    console.warn('[ANTIBAN] Advanced image randomization failed:', e.message);
    return buffer;
  }
}

/**
 * Frequency Guard: Tracks sending frequency to prevent rapid-fire detection
 */
const sentCounts = new Map(); // empId -> { count, startTime }
function checkFrequency(empId, limit = 100, timeframe = 3600000) {
    const now = Date.now();
    const stats = sentCounts.get(empId) || { count: 0, startTime: now };
    
    if (now - stats.startTime > timeframe) {
        sentCounts.set(empId, { count: 1, startTime: now });
        return true;
    }
    
    if (stats.count >= limit) return false;
    
    stats.count++;
    sentCounts.set(empId, stats);
    return true;
}

module.exports = {
  getRandomBrowser,
  getTypingDelay,
  parseSpintax,
  addInvisibleJitter,
  simulateHumanTyping,
  simulateRead,
  verifyJid,
  randomizeImage,
  checkFrequency
};
