const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

let db = null;
let rtdb = null;
let auth = null;

// Helper to create safe mocks if everything fails
const createMock = (name) => {
  const handler = {
    get(target, prop) {
      if (typeof prop === 'string') {
        if (prop === 'isMock') return true;
        return (...args) => {
          console.warn(`[FIREBASE MOCK] ${name}.${prop}() called. Data will not be synced.`);
          if (prop === 'get') return Promise.resolve({ size: 0, docs: [], exists: false, val: () => null, data: () => ({}) });
          if (prop === 'add' || prop === 'push') return Promise.resolve({ id: 'mock-id', key: 'mock-key' });
          if (prop === 'onSnapshot' || prop === 'on') return () => {}; 
          return new Proxy(() => {}, handler);
        };
      }
      return target[prop];
    }
  };
  return new Proxy(() => {}, handler);
};

try {
  if (admin.apps.length === 0) {
    const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
    
    if (fs.existsSync(serviceAccountPath)) {
      console.log('[FIREBASE] Found serviceAccountKey.json. Initializing with full credentials.');
      
      // Set environment variable as an absolute fallback
      process.env.GOOGLE_APPLICATION_CREDENTIALS = serviceAccountPath;

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccountPath),
        databaseURL: process.env.FIREBASE_DATABASE_URL || 'https://yz-almotakamel-default-rtdb.firebaseio.com'
      });
    } else {
      console.warn('[FIREBASE] serviceAccountKey.json NOT found. Initializing with project ID only.');
      admin.initializeApp({
        projectId: process.env.FIREBASE_PROJECT_ID || 'yz-almotakamel',
        databaseURL: process.env.FIREBASE_DATABASE_URL || 'https://yz-almotakamel-default-rtdb.firebaseio.com'
      });
    }
  }

  try {
      db = admin.firestore();
      console.log('[FIREBASE] Firestore initialized.');
  } catch (e) {
      console.error('[FIREBASE] Firestore Init failed (credentials issue?):', e.message);
      db = createMock('Firestore');
  }

  try {
      rtdb = admin.database();
      console.log('[FIREBASE] RTDB initialized.');
  } catch (e) {
      console.error('[FIREBASE] RTDB Init failed:', e.message);
      rtdb = createMock('RTDB');
  }

  try {
      auth = admin.auth();
      console.log('[FIREBASE] Auth initialized.');
  } catch (e) {
      console.error('[FIREBASE] Auth Init failed:', e.message);
      auth = createMock('Auth');
  }

} catch (error) {
  console.error('[FIREBASE ERROR] Root Initialization failed:', error.message);
  db = createMock('Firestore');
  rtdb = createMock('RTDB');
  auth = createMock('Auth');
}

module.exports = { admin, db, rtdb, auth };
