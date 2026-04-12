const { db, rtdb } = require('../firebaseAdmin');
const mappingService = require('./mappingService');

/**
 * Smart Distribution Service
 */

const ACTIVE_EMPLOYEES = ['z4', 'emp1', 'emp2', 'emp3'];

async function getEmployeeLoads() {
  const loads = {};
  for (const emp of ACTIVE_EMPLOYEES) {
    const snapshot = await db.collection('orders')
      .where('assignedTo', '==', emp)
      .where('mainStatus', 'in', ['جديد', 'انتظار'])
      .get();
    loads[emp] = snapshot.size;
  }
  return loads;
}

async function findBestEmployee() {
  const loads = await getEmployeeLoads();
  let bestEmp = ACTIVE_EMPLOYEES[0];
  let minLoad = loads[bestEmp];
  for (const [emp, load] of Object.entries(loads)) {
    if (load < minLoad) {
      minLoad = load;
      bestEmp = emp;
    }
  }
  return bestEmp;
}

function initDistributionListener() {
  console.log('[DISTRIBUTION] Started listening for new unassigned requests...');

  db.collection('students').where('status', '==', 'قيد المراجعة').onSnapshot(async (snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      if (change.type === 'added') {
        const student = change.doc.data();
        const docId = change.doc.id;
        if (student.assignedTo) return;

        const assignedEmp = await findBestEmployee();
        await db.collection('students').doc(docId).update({
          assignedTo: assignedEmp,
          assignmentTime: new Date().toISOString()
        });

        // V3 NOTIFICATION SYSTEM (UID BASED)
        const targetUid = await mappingService.getUidForEmployee(assignedEmp);
        if (targetUid) {
          await rtdb.ref(`v3_notifications/${targetUid}`).push({
            title: 'طلب جديد 🎉',
            body: `تم تعيين طلب الطالب ${student.name} إليك بنجاح.`,
            timestamp: new Date().toISOString(),
            read: false,
            studentId: docId
          });
          console.log(`[DISTRIBUTION] Notified UID: ${targetUid} (for ${assignedEmp})`);
        } else {
          console.log(`[DISTRIBUTION] Warning: No UID mapping for ${assignedEmp}. Check if employee has logged in.`);
        }
      }
    });
  });
}

module.exports = { initDistributionListener };
