const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://yz-almotakamel-default-rtdb.firebaseio.com"
    });
}

const rtdb = admin.database();

async function dump() {
    console.log('--- RTDB DUMP ---');
    try {
        const snap = await rtdb.ref('chats').once('value');
        console.log('Current Chat Structure:');
        console.log(JSON.stringify(snap.val(), null, 2));
        
        const notifSnap = await rtdb.ref('notifications').once('value');
        console.log('Current Notifications:');
        console.log(JSON.stringify(notifSnap.val(), null, 2));
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

dump();
