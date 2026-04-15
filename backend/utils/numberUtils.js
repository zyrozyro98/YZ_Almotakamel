/**
 * UNIFIED NUMBER UTILITY
 * This logic is used to extract the "Pure Local Number" 
 * for Yemen, Saudi Arabia, and Sudan, while protecting technical IDs (LIDs).
 */

const getPureNumber = (raw) => {
  if (!raw) return "";
  
  // Handle various formats: +967..., 966..., 05..., 9677...:1@s.whatsapp.net
  let d = String(raw).split(':')[0].split('@')[0].replace(/[^0-9]/g, '');
  
  // Strict Safety: If it's a very long numeric ID (14+), it's a technical LID.
  // DO NOT attempt to extract numbers from it, as it leads to false 
  // positives (e.g. slicing parts of the LID thinking it's a country code).
  if (d.length > 13) return d;

  // Standard Pure Number Cleaning for actual phone numbers
  d = d.replace(/^0+/, ''); 
  if (d.startsWith('966')) d = d.slice(3);
  else if (d.startsWith('967')) d = d.slice(3);
  else if (d.startsWith('249')) d = d.slice(3);
  
  return d.replace(/^0+/, '');
};

module.exports = { getPureNumber };
