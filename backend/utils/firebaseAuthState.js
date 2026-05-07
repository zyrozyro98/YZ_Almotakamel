const { db } = require('../firebaseAdmin');
const { BufferJSON, Curve, generateRegistrationId } = require('@whiskeysockets/baileys');
const crypto = require('crypto');

/**
 * Custom Baileys Auth State using Firestore with BASE64 Encoding
 * This is the most robust version for ephemeral environments.
 */
const useFirestoreAuthState = async (employeeId) => {
    const collectionPath = `whatsapp_sessions/${employeeId}/state`;

    const writeData = async (data, id) => {
        try {
            const safeId = Buffer.from(id).toString('hex');
            // Convert to Base64 String to ensure Firestore compatibility
            const base64Data = JSON.stringify(data, BufferJSON.replacer);
            await db.collection(collectionPath).doc(safeId).set({ payload: base64Data });
        } catch (e) {
            console.error(`[FIREBASE AUTH] Write error for ${id}:`, e.message);
        }
    };

    const readData = async (id) => {
        try {
            const safeId = Buffer.from(id).toString('hex');
            const doc = await db.collection(collectionPath).doc(safeId).get();
            if (doc.exists) {
                const { payload } = doc.data();
                return JSON.parse(payload, BufferJSON.reviver);
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

    const initCreds = () => {
        const noiseKey = Curve.generateKeyPair();
        const signedIdentityKey = Curve.generateKeyPair();
        return {
            registrationId: generateRegistrationId(),
            advSecretKey: crypto.randomBytes(32).toString('base64'),
            nextPreKeyId: 1,
            firstUnuploadedPreKeyId: 1,
            serverHasPreKeys: false,
            noiseKey: noiseKey,
            signedIdentityKey: signedIdentityKey,
            signedPreKey: {
                keyPair: Curve.generateKeyPair(),
                signature: Buffer.alloc(0),
                keyId: 1
            },
            accountSettings: {
                unarchiveChats: false
            }
        };
    };

    // Load initial creds
    const savedCreds = await readData('creds');
    const creds = savedCreds || initCreds();

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
            const snapshot = await db.collection(collectionPath).get();
            const batch = db.batch();
            snapshot.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
        }
    };
};

module.exports = { useFirestoreAuthState };
