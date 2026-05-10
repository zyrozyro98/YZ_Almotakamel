const { rtdb } = require('../firebaseAdmin');
const { BufferJSON, Curve, generateRegistrationId } = require('@whiskeysockets/baileys');
const crypto = require('crypto');

/**
 * Optimized Baileys Auth State using Realtime Database (RTDB)
 * Provides 100% resilience against Firestore quota limits.
 */
const useFirestoreAuthState = async (employeeId) => {
    const rootPath = `wa_sessions/${employeeId}`;

    const writeData = async (data, id) => {
        try {
            const safeId = Buffer.from(id).toString('hex');
            // RTDB is better with JSON directly, but we use BufferJSON for binary safety
            const serialized = JSON.parse(JSON.stringify(data, BufferJSON.replacer));
            await rtdb.ref(`${rootPath}/${safeId}`).set(serialized);
        } catch (e) {
            console.error(`[RTDB AUTH] Write error for ${id}:`, e.message);
        }
    };

    const readData = async (id) => {
        try {
            const safeId = Buffer.from(id).toString('hex');
            const snap = await rtdb.ref(`${rootPath}/${safeId}`).once('value');
            if (snap.exists()) {
                const payload = snap.val();
                return JSON.parse(JSON.stringify(payload), BufferJSON.reviver);
            }
            return null;
        } catch (e) {
            console.error(`[RTDB AUTH] Read error for ${id}:`, e.message);
            return null;
        }
    };

    const removeData = async (id) => {
        try {
            const safeId = Buffer.from(id).toString('hex');
            await rtdb.ref(`${rootPath}/${safeId}`).remove();
        } catch (e) {
            console.error(`[RTDB AUTH] Remove error for ${id}:`, e.message);
        }
    };

    const initCreds = () => {
        const noiseKey = Curve.generateKeyPair();
        const signedIdentityKey = Curve.generateKeyPair();
        const signedPreKey = Curve.generateKeyPair();
        
        return {
            registrationId: generateRegistrationId(),
            advSecretKey: crypto.randomBytes(32).toString('base64'),
            nextPreKeyId: 1,
            firstUnuploadedPreKeyId: 1,
            serverHasPreKeys: false,
            noiseKey: {
                public: Buffer.from(noiseKey.public),
                private: Buffer.from(noiseKey.private)
            },
            signedIdentityKey: {
                public: Buffer.from(signedIdentityKey.public),
                private: Buffer.from(signedIdentityKey.private)
            },
            signedPreKey: {
                keyPair: {
                    public: Buffer.from(signedPreKey.public),
                    private: Buffer.from(signedPreKey.private)
                },
                signature: Buffer.alloc(64),
                keyId: 1
            },
            accountSettings: {
                unarchiveChats: false
            }
        };
    };

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
            await rtdb.ref(rootPath).remove();
        }
    };
};

module.exports = { useFirestoreAuthState };
