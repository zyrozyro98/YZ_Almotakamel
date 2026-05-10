const { rtdb } = require('./firebaseAdmin');

async function testLock() {
  console.log('Testing RTDB Lock Write...');
  try {
    const testVal = true;
    await rtdb.ref('system_settings/solverSystemLocked').set(testVal);
    console.log('SUCCESS: Value set to true');
    
    const snap = await rtdb.ref('system_settings/solverSystemLocked').once('value');
    console.log('Verification Read:', snap.val());
    
    if (snap.val() === testVal) {
      console.log('VERIFIED: RTDB contains the correct value.');
    } else {
      console.log('FAILED: Value read does not match value written.');
    }
    
    process.exit(0);
  } catch (e) {
    console.error('ERROR during RTDB write:', e);
    process.exit(1);
  }
}

testLock();
