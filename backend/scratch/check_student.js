const { rtdb } = require('../firebaseAdmin');

async function check() {
  console.log("--- RTDB phone_to_jid ---");
  const rtdbSnap = await rtdb.ref('phone_to_jid').once('value');
  const val = rtdbSnap.val();
  console.log("Mappings for 966541926435 in phone_to_jid:");
  for (const emp in val) {
    if (val[emp] && val[emp]['966541926435']) {
      console.log(`Employee: ${emp} -> JID: ${val[emp]['966541926435']}`);
    }
  }

  console.log("--- RTDB jid_mappings ---");
  const jidMapSnap = await rtdb.ref('jid_mappings').once('value');
  console.log("Mappings for 966541926435 in jid_mappings:");
  const jidMaps = jidMapSnap.val();
  for (const emp in jidMaps) {
    if (jidMaps[emp]) {
      for (const lid in jidMaps[emp]) {
        if (jidMaps[emp][lid] === '966541926435') {
          console.log(`Employee: ${emp} -> LID: ${lid} mapped to 966541926435`);
        }
      }
    }
  }
  
  process.exit(0);
}

check().catch(err => {
  console.error(err);
  process.exit(1);
});
