const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://yz-almotakamel-default-rtdb.firebaseio.com"
  });
}

const db = admin.firestore();
const rtdb = admin.database();

async function check() {
  const emps = await db.collection('employees').get();
  console.log('--- EMPLOYEES ---');
  emps.forEach(doc => {
    console.log(`${doc.id}: ${doc.data().name} (${doc.data().role})`);
  });

  const waStatus = await rtdb.ref('wa_status').once('value');
  console.log('--- WA STATUS ---');
  console.log(JSON.stringify(waStatus.val(), null, 2));
}

check();
