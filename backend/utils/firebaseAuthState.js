const { rtdb } = require('../firebaseAdmin');
const { BufferJSON, initAuthCreds } = require('@whiskeysockets/baileys');

/**
 * Optimized Baileys Auth State using Realtime Database (RTDB)
 * Provides 100% resilience against Firestore quota limits.
 */
const useFirestoreAuthState = async (employeeId) => {
    const rootPath = `wa_sessions/${employeeId}`;

    const writeData = async (data, id) => {
        try {
            const safeId = Buffer.from(id).toString('hex');
            // RTDB doesn't allow keys with ".", "#", "$", "/", "[", or "]"
            // So we store the serialized JSON string directly instead of parsing it back to an object.
            const serializedStr = JSON.stringify(data, BufferJSON.replacer);
            await rtdb.ref(`${rootPath}/${safeId}`).set(serializedStr);
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
                if (typeof payload === 'string') {
                    return JSON.parse(payload, BufferJSON.reviver);
                }
                // Backward compatibility if it was saved as an object previously
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

    const savedCreds = await readData('creds');
    const creds = savedCreds || initAuthCreds();

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
