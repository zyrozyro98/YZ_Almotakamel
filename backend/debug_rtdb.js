const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://yz-almotakamel-default-rtdb.firebaseio.com"
});

const rtdb = admin.database();

async function checkRTDB() {
  try {
    const mappings = await rtdb.ref('jid_mappings').once('value');
    console.log("=== JID MAPPINGS ===");
    console.log(JSON.stringify(mappings.val(), null, 2));

    const ee6Chats = await rtdb.ref('chats/ee6Gl14EGKShuOjCMix93puGg5w1').once('value');
    console.log("=== ee6 CHATS ===");
    if (ee6Chats.val()) {
        Object.keys(ee6Chats.val()).forEach(chatId => {
            console.log(`Chat: ${chatId}`);
            console.log(`  phone: ${ee6Chats.val()[chatId].phone}`);
            console.log(`  fullJid: ${ee6Chats.val()[chatId].fullJid}`);
        });
    }

    const t9ZChats = await rtdb.ref('chats/t9Z58ANeMUbzwsXNe6YlztooJg23').once('value');
    console.log("=== t9Z CHATS ===");
    if (t9ZChats.val()) {
        Object.keys(t9ZChats.val()).forEach(chatId => {
            console.log(`Chat: ${chatId}`);
            console.log(`  phone: ${t9ZChats.val()[chatId].phone}`);
            console.log(`  fullJid: ${t9ZChats.val()[chatId].fullJid}`);
        });
    }

    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}

checkRTDB();
