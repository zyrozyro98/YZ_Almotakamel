/**
 * UNIFIED NUMBER UTILITY
 * This logic is used to extract the "Pure Local Number" 
 * for Yemen, Saudi Arabia, and Sudan, while protecting technical IDs (LIDs).
 */

const getPureNumber = (raw) => {
  if (!raw) return "";
  
  // Handle various formats: +967..., 966..., 05..., 9677...:1@s.whatsapp.net
  let d = String(raw).split(':')[0].split('@')[0].replace(/[^0-9]/g, '');
  
  // Sophisticated Extraction: If it's a long numeric LID (14+ digits)
  // Search for an embedded country code pattern (967, 966, 249)
  if (d.length > 13) {
    const patterns = ['966', '967', '249'];
    for (const p of patterns) {
      const idx = d.indexOf(p);
      if (idx !== -1) {
        // Extract from the pattern onwards
        const potential = d.slice(idx);
        // Only return if it looks like a valid length for that country
        if (potential.length >= 9 && potential.length <= 13) {
          d = potential;
          break;
        }
      }
    }
  }

  // If after extraction it's still too long, return as is (Safety)
  if (d.length > 13) return d;

  // Primary Cleaning
  d = d.replace(/^0+/, ''); 
  
  if (d.startsWith('966')) d = d.slice(3);
  else if (d.startsWith('967')) d = d.slice(3);
  else if (d.startsWith('249')) d = d.slice(3);
  
  // Secondary Cleaning (in case of 00967077...)
  return d.replace(/^0+/, '');
};

module.exports = { getPureNumber };
