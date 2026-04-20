/**
 * UNIFIED NUMBER UTILITY
 * This logic is used to extract the "Pure Local Number" 
 * for Yemen, Saudi Arabia, and Sudan, while protecting technical IDs (LIDs).
 */

const getPureNumber = (raw) => {
  if (!raw) return "";
  
  // Extract the numeric part before any @ or :
  let d = String(raw).split(':')[0].split('@')[0].replace(/[^0-9a-zA-Z]/g, '');
  
  // If it's a numeric-only JID, we keep the full number (with country code).
  // If it's an LID (containing letters or very long), we keep it as is.
  // This aligns with the "JID system" which uses the full protocol identifier.
  
  return d;
};

module.exports = { getPureNumber };
