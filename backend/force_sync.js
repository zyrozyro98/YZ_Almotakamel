const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://yz-almotakamel-default-rtdb.firebaseio.com"
    });
}

const rtdb = admin.database();

async function forceMap() {
    const targetUid = "NTn4lFxwqTgbzj4kLwe8vIK36wO2";
    const employeeId = "z4";
    
    console.log(`Force mapping ${employeeId} to ${targetUid}...`);
    try {
        // 1. Set the mapping
        await rtdb.ref(`mappings/${employeeId}`).set({ uid: targetUid });
        
        // 2. Send a test notification to VERIFY visibility
        await rtdb.ref(`v3_notifications/${targetUid}`).push({
            title: 'تم تفعيل التزامن V3 ✅',
            body: 'إذا كنت ترى هذا الإشعار، فالمشكلة حُلت تماماً والدردشة ستظهر الآن.',
            timestamp: new Date().toISOString(),
            read: false
        });
        
        console.log('Mapping Success! Check your dashboard now.');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

forceMap();
