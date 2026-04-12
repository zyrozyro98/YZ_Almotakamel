const { rtdb } = require('../firebaseAdmin');

async function getUidForEmployee(employeeId) {
    if (!employeeId) return null;
    try {
        const cleanEmpId = employeeId.toLowerCase().replace(/[^a-zA-Z0-9]/g, '');
        const snap = await rtdb.ref(`mappings/${cleanEmpId}`).once('value');
        if (snap.exists() && snap.val().uid) {
            return snap.val().uid;
        }
        return null;
    } catch (err) {
        console.error('[MAPPING ERROR]', err);
        return null;
    }
}

module.exports = { getUidForEmployee };
