const { rtdb } = require('../firebaseAdmin');
const { collection, getDocs, query, where } = require('firebase-admin/firestore');

// Global cache for employeeId -> UID mapping to avoid excessive DB reads
const uidCache = {};

async function getUserIdFromEmployeeId(employeeId) {
  if (uidCache[employeeId]) return uidCache[employeeId];
  
  try {
    // We look into a new mapping table in RTDB that the frontend will populate
    const snap = await rtdb.ref(`mappings/${employeeId}`).once('value');
    if (snap.exists()) {
      uidCache[employeeId] = snap.val();
      return snap.val();
    }
    return null;
  } catch (err) {
    console.error('[MAPPING ERROR]', err);
    return null;
  }
}

// ... original logic ...
// I will apply this logic inside the relevant functions in the next step
