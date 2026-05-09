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
      console.warn('[DISTRIBUTION] No employees found in Firestore.');
      return null;
    }

    const employeeIds = employeesSnap.docs.map(doc => doc.id).filter(id => id !== 'emp1');
    if (employeeIds.length === 0) {
      console.warn('[DISTRIBUTION] No valid employees (excluding emp1) found.');
      return null;
    }

    // 2. Optimization: Single query for all active loads
    const ordersSnap = await db.collection('orders')
      .where('mainStatus', 'in', ['جديد', 'انتظار'])
      .get();

    const loads = {};
    employeeIds.forEach(id => loads[id] = 0);
    
    ordersSnap.docs.forEach(doc => {
      const assignedTo = doc.data().assignedTo;
      if (assignedTo && loads[assignedTo] !== undefined) {
        loads[assignedTo]++;
      }
    });

    // 3. Find the one with the minimum load
    let bestEmp = employeeIds[0];
    let minLoad = loads[bestEmp];

    for (const [empId, load] of Object.entries(loads)) {
      if (load < minLoad) {
        minLoad = load;
        bestEmp = empId;
      }
    }

    console.log(`[DISTRIBUTION] Optimized assignment to ${bestEmp}. Current load: ${minLoad}`);
    return bestEmp;
  } catch (error) {
    console.error('[DISTRIBUTION ERROR]', error.message);
    return null; // Safe fallback
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

        if (!assignedEmp) {
          console.warn(`[DISTRIBUTION] Could not find a valid employee to assign student ${student.name}`);
          return;
        }

        // Update the document to lock assignment
        await db.collection('students').doc(docId).update({
          assignedTo: assignedEmp,
          assignmentTime: new Date().toISOString()
        });

        // FAST PATH: Sync to RTDB for solver visibility
        await rtdb.ref(`active_students/${docId}`).set({
          ...student,
          id: docId,
          assignedTo: assignedEmp,
          assignmentTime: new Date().toISOString(),
          updatedAt: Date.now()
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

/**
 * One-time sync of active students to RTDB on startup.
 * Helps solvers see current tasks even if Firestore hits quota later.
 */
async function syncActiveStudentsToRtdb() {
  console.log('[SYNC] Starting active students sync to RTDB...');
  try {
    const studentsSnap = await db.collection('students')
      .where('mainStatus', 'in', ['جديد', 'انتظار', 'جاري الحل'])
      .get();
    
    if (studentsSnap.empty) {
      console.log('[SYNC] No active students to sync.');
      return;
    }

    const batch = {};
    studentsSnap.docs.forEach(doc => {
      batch[doc.id] = {
        ...doc.data(),
        id: doc.id,
        syncSource: 'startup'
      };
    });

    await rtdb.ref('active_students').update(batch);
    console.log(`[SYNC] Successfully synced ${studentsSnap.size} students to RTDB.`);
  } catch (err) {
    console.error('[SYNC ERROR] Failed to sync students:', err.message);
  }
}

module.exports = {
  initDistributionListener,
  syncActiveStudentsToRtdb
};
