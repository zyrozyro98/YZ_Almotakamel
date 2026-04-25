const { db, rtdb } = require('../firebaseAdmin');

/**
 * Smart Distribution Service
 * Automatically assigns new incoming leads/orders to the employee with the lowest active load.
 */

async function findBestEmployee() {
  try {
    // 1. Fetch all real employees from Firestore
    const employeesSnap = await db.collection('employees').get();
    if (employeesSnap.empty) {
      console.warn('[DISTRIBUTION] No employees found in Firestore. Falling back to default emp1');
      return 'emp1';
    }

    const employeeIds = employeesSnap.docs.map(doc => doc.id);
    const loads = {};

    // 2. Calculate loads for each real employee
    for (const empId of employeeIds) {
      const snapshot = await db.collection('orders')
        .where('assignedTo', '==', empId)
        .where('mainStatus', 'in', ['جديد', 'انتظار'])
        .get();
      loads[empId] = snapshot.size;
    }

    // 3. Find the one with the minimum load
    let bestEmp = employeeIds[0];
    let minLoad = loads[bestEmp];

    for (const [empId, load] of Object.entries(loads)) {
      if (load < minLoad) {
        minLoad = load;
        bestEmp = empId;
      }
    }

    console.log(`[DISTRIBUTION] Assigned to ${bestEmp}. Current load: ${minLoad}`);
    return bestEmp;
  } catch (error) {
    console.error('[DISTRIBUTION ERROR]', error.message);
    return 'emp1'; // Safe fallback
  }
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
