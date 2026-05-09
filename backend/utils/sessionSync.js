const { db } = require('../firebaseAdmin');
const path = require('path');
const fs = require('fs');

/**
 * Cloud Sync Utility
 * Manages syncing local WhatsApp session files to/from Firestore
 */
const syncToCloud = async (employeeId, localPath) => {
    const collectionPath = `whatsapp_sessions/${employeeId}/files`;
    
    // Watch for file changes and upload to Firestore
    const uploadFile = async (filePath) => {
        try {
            if (!fs.existsSync(filePath)) return; 
            const fileName = path.basename(filePath);
            
            // CRITICAL: Only sync creds.json to avoid hitting Firestore free quota limits
            // Other files like app-state-sync or pre-keys are too many and not strictly necessary for persistence
            if (fileName !== 'creds.json') return;

            // Ensure parent document exists so auto-boot can find it
            await db.collection('whatsapp_sessions').doc(employeeId).set({ active: true }, { merge: true });

            const content = fs.readFileSync(filePath);
            const safeName = Buffer.from(fileName).toString('hex');
            
            await db.collection(collectionPath).doc(safeName).set({
                fileName,
                content: content.toString('base64'),
                updatedAt: new Date().toISOString()
            });
            console.log(`[SYNC] Saved critical session state (creds.json) for ${employeeId}`);
        } catch (e) {
            if (e.message && e.message.includes('Quota exceeded')) {
                console.error(`[SYNC FATAL] Firestore Quota Exceeded! Stopping sync for ${employeeId}`);
            } else {
                console.error(`[SYNC ERROR] Upload failed for ${employeeId}:`, e.message);
            }
        }
    };

    const downloadAll = async () => {
        try {
            if (!fs.existsSync(localPath)) fs.mkdirSync(localPath, { recursive: true });
            const snapshot = await db.collection(collectionPath).get();
            if (snapshot.empty) return false;

            for (const doc of snapshot.docs) {
                const { fileName, content } = doc.data();
                const filePath = path.join(localPath, fileName);
                fs.writeFileSync(filePath, Buffer.from(content, 'base64'));
            }
            console.log(`[SYNC] Restored ${snapshot.size} files for ${employeeId}`);
            return true;
        } catch (e) {
            console.error(`[SYNC ERROR] Restore failed for ${employeeId}:`, e.message);
            return false;
        }
    };

    const clearCloud = async () => {
        try {
            const snapshot = await db.collection(collectionPath).get();
            const batch = db.batch();
            snapshot.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            console.log(`[SYNC] Cloud storage cleared for ${employeeId}`);
        } catch (e) {
            console.error(`[SYNC ERROR] Clear failed:`, e.message);
        }
    };

    return { uploadFile, downloadAll, clearCloud };
};

module.exports = { syncToCloud };
