/**
 * UNIFIED NUMBER UTILITY
 * This logic is used to extract the "Pure Local Number" 
 * for Yemen, Saudi Arabia, and Sudan, while protecting technical IDs (LIDs).
 */

const getPureNumber = (raw) => {
  if (!raw) return "";
  
  // Handle various formats: +967..., 966..., 05..., 9677...:1@s.whatsapp.net
  let d = String(raw).split(':')[0].split('@')[0].replace(/[^0-9]/g, '');
  
  // --- DEEP SMART EXTRACTION ---
  // If we have a long ID (LID), search for a valid country-coded phone inside it.
  if (d.length > 13) {
    // Search for 12-digit patterns: 967..., 966..., 249...
    const countryPatterns = [
      { code: '967', start: '7', len: 12 }, // Yemen
      { code: '966', start: '5', len: 12 }, // Saudi
      { code: '249', start: '9', len: 12 }, // Sudan
      { code: '249', start: '1', len: 12 }  // Sudan alt
    ];

    for (const p of countryPatterns) {
      const idx = d.indexOf(p.code);
      if (idx !== -1) {
        const slice = d.slice(idx, idx + p.len);
        // Validate if it matches the mobile start digit and length
        if (slice.startsWith(p.code + p.start) && slice.length === p.len) {
          d = slice;
          break;
        }
      }
    }
  }

  // If still too long or no match, keep as is
  if (d.length > 13) return d;

  // Standard Cleaning
  d = d.replace(/^0+/, ''); 
  if (d.startsWith('966')) d = d.slice(3);
  else if (d.startsWith('967')) d = d.slice(3);
  else if (d.startsWith('249')) d = d.slice(3);
  
  return d.replace(/^0+/, '');
};

module.exports = { getPureNumber };
