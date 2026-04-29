/**
 * Anti-Ban and Human Simulation Utilities
 */

const BROWSERS = [
  ['Ubuntu', 'Chrome', '114.0.5735.199'],
  ['Windows', 'Chrome', '115.0.0.0'],
  ['Mac OS', 'Safari', '16.5'],
  ['Linux', 'Firefox', '114.0'],
  ['Windows', 'Edge', '114.0.1823.67']
];

/**
 * Returns a random browser configuration for Baileys
 */
function getRandomBrowser() {
  return BROWSERS[Math.floor(Math.random() * BROWSERS.length)];
}

/**
 * Calculates a human-like delay based on message length
 * @param {string} text 
 * @returns {number} Delay in milliseconds
 */
function getTypingDelay(text = '') {
  const baseDelay = 1500;
  const perCharDelay = Math.random() * 20 + 30; // 30-50ms per character
  const jitter = Math.random() * 1000;
  const total = baseDelay + (text.length * perCharDelay) + jitter;
  return Math.min(total, 8000); // Cap at 8 seconds
}

/**
 * Simple Spintax implementation: {Hi|Hello|Hey} there!
 * @param {string} text 
 */
function parseSpintax(text) {
  if (!text) return text;
  return text.replace(/{([^{}]+)}/g, (match, options) => {
    const choices = options.split('|');
    return choices[Math.floor(Math.random() * choices.length)];
  });
}

/**
 * Adds an invisible character at a random position to change message hash
 * @param {string} text 
 */
function addInvisibleJitter(text) {
  if (!text || text.length < 5) return text;
  const zeroWidthSpace = '\u200B';
  const pos = Math.floor(Math.random() * text.length);
  return text.slice(0, pos) + zeroWidthSpace + text.slice(pos);
}

/**
 * Simulates the human flow of sending a message:
 * 1. Presence: Composing
 * 2. Delay: Thinking/Typing
 * 3. Presence: Paused
 * @param {import('@whiskeysockets/baileys').WASocket} sock 
 * @param {string} jid 
 * @param {string} text 
 */
async function simulateHumanTyping(sock, jid, text = '') {
  try {
    await sock.sendPresenceUpdate('composing', jid);
    const delay = getTypingDelay(text);
    await new Promise(r => setTimeout(r, delay));
    await sock.sendPresenceUpdate('paused', jid);
  } catch (e) {
    console.warn('[ANTIBAN] Presence update failed:', e.message);
  }
}

/**
 * Checks if a number is on WhatsApp before sending
 * @param {import('@whiskeysockets/baileys').WASocket} sock 
 * @param {string} jid 
 */
async function verifyJid(sock, jid) {
  if (jid.includes('@g.us') || jid.includes('@newsletter')) return true;
  try {
    const [result] = await sock.onWhatsApp(jid);
    return !!(result && result.exists);
  } catch (e) {
    console.warn('[ANTIBAN] JID verification failed:', e.message);
    return true; // Fallback to true if check fails to avoid blocking legitimate sends
  }
}

/**
 * Randomizes an image buffer slightly to ensure a unique binary hash (MD5/SHA)
 * This is crucial for avoiding bans when sending the same image to many people.
 * @param {Buffer} buffer 
 * @returns {Promise<Buffer>}
 */
async function randomizeImage(buffer) {
  try {
    const sharp = require('sharp');
    // Apply a tiny, invisible change: 
    // 1. Random quality between 75-80
    // 2. Add 1px of padding or slight crop
    const quality = 75 + Math.floor(Math.random() * 6);
    
    // We alternate between adding a 1px border or doing nothing
    const shouldAddBorder = Math.random() > 0.5;
    
    let pipeline = sharp(buffer);
    
    if (shouldAddBorder) {
      pipeline = pipeline.extend({
        top: 0, bottom: 1, left: 0, right: 0,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      });
    }

    return await pipeline
      .jpeg({ quality, force: false })
      .png({ quality: quality + 10, force: false })
      .toBuffer();
  } catch (e) {
    console.warn('[ANTIBAN] Image randomization failed, using original:', e.message);
    return buffer;
  }
}

module.exports = {
  getRandomBrowser,
  getTypingDelay,
  parseSpintax,
  addInvisibleJitter,
  simulateHumanTyping,
  verifyJid,
  randomizeImage
};
