const { rtdb } = require('../firebaseAdmin');
const { useFirestoreAuthState } = require('../utils/firebaseAuthState');
const makeWASocket = require('@whiskeysockets/baileys').default;
const pino = require('pino');

async function debug() {
  const employeeId = 'rMx9rcK1ALhjZZ6fmQpsLqIeDcx1';
  console.log(`[DEBUG] Initializing Auth State for ${employeeId}...`);
  const { state, saveCreds } = await useFirestoreAuthState(employeeId);
  
  console.log(`[DEBUG] Connecting to WhatsApp...`);
  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'debug' }), // Set level to debug to see all packets!
    printQRInTerminal: false
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    console.log(`[DEBUG] Connection Update: connection=${connection}, lastDisconnect=${lastDisconnect?.error?.message}`);
    
    if (connection === 'open') {
      console.log(`[DEBUG] Socket is fully OPEN!`);
      const targetPhone = '966541926435';
      const targetJid = `${targetPhone}@s.whatsapp.net`;
      
      console.log(`[DEBUG] Querying onWhatsApp for ${targetJid}...`);
      try {
        const [exists] = await sock.onWhatsApp(targetJid);
        console.log(`[DEBUG] onWhatsApp result:`, exists);
      } catch (err) {
        console.error(`[DEBUG] onWhatsApp query failed:`, err.message);
      }

      console.log(`[DEBUG] Attempting to send text message to ${targetJid}...`);
      try {
        const result = await sock.sendMessage(targetJid, { text: 'Hello from Antigravity Debugger (Test)' });
        console.log(`[DEBUG] Send successful! Result ID:`, result.key.id);
      } catch (err) {
        console.error(`[DEBUG] Send failed with error:`, err.message, err.stack);
      }

      setTimeout(() => {
        console.log("[DEBUG] Done. Exiting...");
        process.exit(0);
      }, 10000);
    }

    if (connection === 'close') {
      console.log(`[DEBUG] Connection closed.`);
    }
  });
}

debug().catch(err => {
  console.error('[DEBUG ERROR]', err);
  process.exit(1);
});
