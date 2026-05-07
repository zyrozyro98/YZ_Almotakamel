/**
 * UNIFIED NUMBER UTILITY
 * This logic is used to extract the "Pure Local Number" 
 * for Yemen, Saudi Arabia, and Sudan, while protecting technical IDs (LIDs).
 */

const getPureNumber = (raw) => {
  if (!raw) return "";
  
  // Extract the numeric part before any @ or :
  let d = String(raw).split(':')[0].split('@')[0].replace(/[^0-9a-zA-Z]/g, '');
  
  // Smart Normalization for standard formats (Ignore LIDs which have letters)
  if (!/[a-zA-Z]/.test(d)) {
    // Saudi 05 -> 9665
    if (/^05\d{8}$/.test(d)) d = '966' + d.substring(1);
    // Yemeni 07 -> 9677
    else if (/^07\d{8}$/.test(d)) d = '967' + d.substring(1);
    // Saudi 5... -> 9665
    else if (/^5\d{8}$/.test(d)) d = '966' + d;
    // Yemeni 7... -> 9677
    else if (/^7\d{8}$/.test(d)) d = '967' + d;
  }
  
  return d;
};

module.exports = { getPureNumber };
