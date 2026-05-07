const { db } = require('../firebaseAdmin');
const { BufferJSON } = require('@whiskeysockets/baileys');

/**
 * Custom Baileys Auth State using Firestore for Persistence
 */
const useFirestoreAuthState = async (employeeId) => {
    const collectionPath = `whatsapp_sessions/${employeeId}/state`;

    const writeData = async (data, id) => {
        try {
            // Encode ID to be safe for Firestore (replace / with _)
            const safeId = Buffer.from(id).toString('hex');
            // Use BufferJSON to handle binary data correctly
            const jsonStr = JSON.stringify(data, BufferJSON.replacer);
            const docData = JSON.parse(jsonStr);
            await db.collection(collectionPath).doc(safeId).set(docData);
        } catch (e) {
            console.error(`[FIREBASE AUTH] Write error for ${id}:`, e.message);
        }
    };

    const readData = async (id) => {
        try {
            const safeId = Buffer.from(id).toString('hex');
            const doc = await db.collection(collectionPath).doc(safeId).get();
            if (doc.exists) {
                const jsonStr = JSON.stringify(doc.data());
                return JSON.parse(jsonStr, BufferJSON.reviver);
            }
            return null;
        } catch (e) {
            console.error(`[FIREBASE AUTH] Read error for ${id}:`, e.message);
            return null;
        }
    };

    const removeData = async (id) => {
        try {
            const safeId = Buffer.from(id).toString('hex');
            await db.collection(collectionPath).doc(safeId).delete();
        } catch (e) {
            console.error(`[FIREBASE AUTH] Remove error for ${id}:`, e.message);
        }
    };

    // Load initial creds
    const creds = await readData('creds') || {};

    return {
        state: {
            creds: creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    await Promise.all(
                        ids.map(async (id) => {
                            let value = await readData(`${type}-${id}`);
                            if (value) {
                                if (type === 'app-state-sync-key') {
                                    // Special handling for buffer-like structures if needed
                                }
                                data[id] = value;
                            }
                        })
                    );
                    return data;
                },
                set: async (data) => {
                    const tasks = [];
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            const name = `${category}-${id}`;
                            if (value) {
                                tasks.push(writeData(value, name));
                            } else {
                                tasks.push(removeData(name));
                            }
                        }
                    }
                    await Promise.all(tasks);
                }
            }
        },
        saveCreds: async () => {
            await writeData(creds, 'creds');
        },
        clearState: async () => {
            // Bulk delete all documents in the session collection
            const snapshot = await db.collection(collectionPath).get();
            const batch = db.batch();
            snapshot.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
        }
    };
};

module.exports = { useFirestoreAuthState };
