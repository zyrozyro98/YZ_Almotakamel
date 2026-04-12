const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://yz-almotakamel-default-rtdb.firebaseio.com"
    });
}

const rtdb = admin.database();

async function sendTest() {
    console.log('Sending test notification to z4...');
    try {
        await rtdb.ref('notifications/z4').push({
            title: 'اختبار اتصال',
            body: 'إذا كنت ترى هذه الرسالة، فإن الربط سليم!',
            time: new Date().toISOString(),
            read: false
        });
        console.log('Success!');
        process.exit(0);
    } catch (err) {
        console.error('Failed:', err);
        process.exit(1);
    }
}

sendTest();
