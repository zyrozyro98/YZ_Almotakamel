const { db, rtdb } = require('../firebaseAdmin');

/**
 * Smart Distribution Service
 * Automatically assigns new incoming leads/orders to the employee with the lowest active load.
 */

// Simulated pool of active customer service employees.
// In production, this would be fetched from Firestore 'users' collection where role='employee' and status='online'
const ACTIVE_EMPLOYEES = ['emp1', 'emp2', 'emp3'];

async function getEmployeeLoads() {
  const loads = {};
  for (const emp of ACTIVE_EMPLOYEES) {
    // Check how many active 'new' or 'waiting' orders are assigned to this employee
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
  
  // Find employee with the minimum load
  let bestEmp = ACTIVE_EMPLOYEES[0];
  let minLoad = loads[bestEmp];

  for (const [emp, load] of Object.entries(loads)) {
    if (load < minLoad) {
      minLoad = load;
      bestEmp = emp;
    }
  }

  console.log(`[DISTRIBUTION] Assigned to ${bestEmp}. Current load: ${minLoad}`);
  return bestEmp;
}

/**
 * Initializes listeners on Firestore to intercept new unassigned orders/students
 * and distribute them automatically.
 */
function initDistributionListener() {
  console.log('[DISTRIBUTION] Started listening for new unassigned requests...');

  // Listening to the 'students' collection (which acts as a new request/lead)
  db.collection('students').where('status', '==', 'قيد المراجعة').onSnapshot(async (snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      if (change.type === 'added') {
        const student = change.doc.data();
        const docId = change.doc.id;

        // Skip if already assigned
        if (student.assignedTo) return;

        // Perform Smart Distribution
        const assignedEmp = await findBestEmployee();

        // Update the document to lock assignment
        await db.collection('students').doc(docId).update({
          assignedTo: assignedEmp,
          assignmentTime: new Date().toISOString()
        });

        // Notify the employee via Realtime DB (so the bell icon in UI can ping)
        await rtdb.ref(`notifications/${assignedEmp}`).push({
          title: 'طلب جديد',
          body: `تم تعيين طلب الطالب ${student.name} إليك.`,
          timestamp: new Date().toISOString(),
          read: false,
          studentId: docId
        });

        console.log(`[DISTRIBUTION] Student ${student.name} assigned to ${assignedEmp}`);
      }
    });
  });
}

module.exports = {
  initDistributionListener
};
