const express = require('express');
const router = express.Router();
const { db, rtdb } = require('../firebaseAdmin');

// Add Single Student
router.post('/add', async (req, res) => {
  try {
    const studentData = req.body;
    
    // 1. FAST PATH: Write to RTDB (active_students)
    const newStudentRef = rtdb.ref('active_students').push();
    const studentId = newStudentRef.key;
    
    const finalData = {
      ...studentData,
      id: studentId,
      createdAt: Date.now(),
      mainStatus: 'جديد',
      subStatus: 'لم يتم التواصل',
      syncSource: 'api'
    };

    await newStudentRef.set(finalData);
    console.log(`[API] Student added to RTDB: ${studentId}`);

    // 2. SLOW PATH: Sync to Firestore in background
    db.collection('students').doc(studentId).set({
      ...finalData,
      createdAt: new Date() // Firestore expects Date object or serverTimestamp
    })
    .then(() => console.log(`[API] Student synced to Firestore: ${studentId}`))
    .catch(err => console.warn(`[API] Firestore student sync failed (quota):`, err.message));

    res.json({ message: 'تم إضافة الطالب بنجاح عبر المسار السريع', id: studentId });
  } catch (error) {
    console.error('[STUDENT ADD ERROR]', error);
    res.status(500).json({ error: 'حدث خطأ أثناء إضافة الطالب' });
  }
});

// Bulk Add Students
router.post('/bulk-add', async (req, res) => {
  try {
    const { students } = req.body;
    if (!students || !Array.isArray(students)) return res.status(400).json({ error: 'بيانات غير صالحة' });

    console.log(`[API] Processing bulk add for ${students.length} students...`);
    
    const rtdbBatch = {};
    const studentIds = [];

    students.forEach(s => {
      const newRef = rtdb.ref('active_students').push();
      const id = newRef.key;
      studentIds.push(id);
      rtdbBatch[id] = {
        ...s,
        id,
        createdAt: Date.now(),
        mainStatus: 'جديد',
        subStatus: 'لم يتم التواصل',
        syncSource: 'bulk_api'
      };
    });

    // 1. FAST PATH: Update RTDB in one go
    await rtdb.ref('active_students').update(rtdbBatch);
    console.log(`[API] Bulk RTDB success for ${students.length} students`);

    // 2. SLOW PATH: Firestore (Background)
    // We don't await this to keep the API fast
    Promise.all(Object.keys(rtdbBatch).map(id => {
      return db.collection('students').doc(id).set({
        ...rtdbBatch[id],
        createdAt: new Date()
      });
    })).catch(err => console.warn('[API] Bulk Firestore sync partially failed:', err.message));

    res.json({ message: `تم إضافة ${students.length} طالب بنجاح`, count: students.length });
  } catch (error) {
    console.error('[BULK ADD ERROR]', error);
    res.status(500).json({ error: 'حدث خطأ أثناء الإضافة الجماعية' });
  }
});

// Update Student Status / Data (Fast Path)
router.post('/update-status/:id', async (req, res) => {
  try {
    const studentId = req.params.id;
    const updateData = req.body;

    // 1. FAST PATH: Update RTDB
    await rtdb.ref(`active_students/${studentId}`).update({
      ...updateData,
      updatedAt: Date.now()
    });
    console.log(`[API] Student status updated in RTDB: ${studentId}`);

    // 2. SLOW PATH: Firestore (Background)
    db.collection('students').doc(studentId).update({
      ...updateData,
      updatedAt: new Date()
    })
    .then(() => console.log(`[API] Student status synced to Firestore: ${studentId}`))
    .catch(err => console.warn(`[API] Firestore status sync failed:`, err.message));

    res.json({ message: 'تم تحديث حالة الطالب بنجاح' });
  } catch (error) {
    console.error('[STATUS UPDATE ERROR]', error);
    res.status(500).json({ error: 'حدث خطأ أثناء تحديث حالة الطالب' });
  }
});

// Toggle System Lock
router.post('/system/toggle-lock', async (req, res) => {
  const { locked } = req.body;
  
  if (typeof locked !== 'boolean') {
    return res.status(400).json({ error: 'Invalid locked status' });
  }

  try {
    // 1. FAST PATH: Update RTDB immediately
    // Using a promise to ensure we know it finished
    await rtdb.ref('system_settings/solverSystemLocked').set(locked);
    console.log(`[API SUCCESS] System lock status pushed to RTDB: ${locked}`);

    // 2. BACKWARD SYNC: Update Firestore (Non-blocking)
    db.collection('system_settings').doc('global').set({ 
      solverSystemLocked: locked,
      updatedAt: new Date()
    }, { merge: true }).catch(e => console.warn('[API] Firestore lock sync failed:', e.message));

    res.status(200).json({ message: `System ${locked ? 'locked' : 'opened'} successfully` });
  } catch (error) {
    console.error('[API FATAL ERROR] Toggle Lock Failed:', error);
    res.status(500).json({ error: 'Failed to update system lock status: ' + error.message });
  }
});

module.exports = router;
