/**
 * UNIFIED NUMBER UTILITY
 * This logic is used to extract the "Pure Local Number" 
 * for Yemen, Saudi Arabia, and Sudan, while protecting technical IDs (LIDs).
 */

const getPureNumber = (raw) => {
  if (!raw) return "";
  
  // Handle various formats: +967..., 966..., 05..., 9677...:1@s.whatsapp.net
  let d = String(raw).split(':')[0].split('@')[0].replace(/[^0-9]/g, '');
  
  // Advanced Extractions: If it's a long technical ID, try to find a phone number pattern
  if (d.length > 13) {
    const patterns = ['966', '967', '249'];
    for (const p of patterns) {
      const idx = d.indexOf(p);
      if (idx !== -1) {
        const potential = d.slice(idx);
        // Valid local phone length (9 to 13 digits with country code)
        if (potential.length >= 9 && potential.length <= 13) {
          d = potential;
          break;
        }
      }
    }
  }

  // Final check: If it's still > 13, it remains a LID
  if (d.length > 13) return d;

  // Standard Pure Number logic
  d = d.replace(/^0+/, ''); 
  if (d.startsWith('966')) d = d.slice(3);
  else if (d.startsWith('967')) d = d.slice(3);
  else if (d.startsWith('249')) d = d.slice(3);
  
  return d.replace(/^0+/, '');
};

module.exports = { getPureNumber };
