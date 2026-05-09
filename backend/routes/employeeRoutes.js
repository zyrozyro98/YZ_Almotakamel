const express = require('express');
const router = express.Router();
const { admin, db, auth } = require('../firebaseAdmin');

/**
 * Create a new employee in Firebase Auth and Firestore.
 */
router.post('/create', async (req, res) => {
  console.log('[API] Processing employee creation request for:', req.body.email);
  const { name, email, password, phone, role, assignedUniversity, assignedMajor } = req.body;

  if (auth.isMock) {
    return res.status(503).json({ error: 'عذراً، يجب رفع ملف serviceAccountKey.json في مجلد backend لتتمكن من إنشاء حسابات موظفين حقيقية.' });
  }

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'الاسم والبريد وكلمة المرور مطلوبة.' });
  }

  try {
    let userRecord;
    const formattedPhone = phone ? (phone.startsWith('+') ? phone : `+966${phone.replace(/^0/, '')}`) : undefined;
    
    try {
      // 1. Try to Create User in Firebase Auth
      userRecord = await auth.createUser({
        email: email,
        password: password,
        displayName: name,
        phoneNumber: formattedPhone,
      });
    } catch (authError) {
      // If user already exists in Auth, try to fetch them instead of failing
      if (authError.code === 'auth/email-already-exists') {
        console.log('[API] User already exists in Auth, fetching record...');
        userRecord = await auth.getUserByEmail(email);
      } 
      // If phone number is invalid (TOO_SHORT, etc) or already exists, try creating without it
      else if (authError.code === 'auth/invalid-phone-number' || authError.code === 'auth/phone-number-already-exists') {
        console.warn('[API] Phone number issue, retrying without phone in Auth:', authError.message);
        try {
          userRecord = await auth.createUser({
            email: email,
            password: password,
            displayName: name,
          });
        } catch (retryError) {
           // If email already exists here too
           if (retryError.code === 'auth/email-already-exists') {
             userRecord = await auth.getUserByEmail(email);
           } else {
             throw retryError;
           }
        }
      }
      else {
        throw authError; // Rethrow if it's another error
      }
    }

    // --- FINAL SYNC STEP (FORCED) ---
    // This part runs regardless of whether the user was just created or already existed
    console.log(`[API] Forcing data sync for UID: ${userRecord.uid}, Role: ${role}`);

    // 1. FAST PATH: Realtime Database (Instant login support)
    try {
      await rtdb.ref(`employee_roles/${userRecord.uid}`).set({
        role: role || 'employee',
        name: name,
        email: email,
        status: 'active',
        updatedAt: Date.now()
      });
      console.log(`[API] RTDB Sync Successful for ${userRecord.uid}`);
    } catch (rtdbErr) {
      console.error('[API] RTDB Sync Failed:', rtdbErr.message);
    }

    // 2. SLOW PATH: Firestore (Source of Truth)
    const firestoreSync = async () => {
      try {
        await db.collection('employees').doc(userRecord.uid).set({
          uid: userRecord.uid,
          name,
          email,
          phone: phone || '',
          role: role || 'employee',
          type: role || 'employee',
          status: 'active',
          assignedUniversity: assignedUniversity || '',
          assignedMajor: assignedMajor || '',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: admin.firestore.FieldValue.serverTimestamp() // fallback
        }, { merge: true });
        console.log(`[API] Firestore Sync Successful for ${userRecord.uid}`);
      } catch (fsErr) {
        console.error('[API] Firestore Sync Failed (Quota?):', fsErr.message);
      }
    };

    // Execute Firestore sync (background)
    firestoreSync();

    res.status(201).json({ 
      message: 'تم إنشاء الموظف بنجاح وتأمين صلاحياته في النظام السريع', 
      uid: userRecord.uid 
    });

  } catch (error) {
    console.error('[EMPLOYEE CREATE FATAL ERROR]', error);
    res.status(500).json({ error: 'خطأ داخلي في الخادم: ' + error.message });
  }
});

/**
 * Update employee (Firestore only for now, Auth if email changed)
 */
router.post('/update/:id', async (req, res) => {
  const { name, email, phone, role, status, assignedUniversity, assignedMajor } = req.body;
  const uid = req.params.id;

  try {
    // Update Firestore
    await db.collection('employees').doc(uid).update({
      name,
      email,
      phone,
      role,
      type: role, // Sync type with role
      status,
      assignedUniversity: assignedUniversity || '',
      assignedMajor: assignedMajor || '',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Optionally update Auth display name
    await auth.updateUser(uid, {
        displayName: name,
        email: email
    });

    // Update RTDB backup as well
    await rtdb.ref(`employee_roles/${uid}`).update({
      role,
      name,
      status
    });

    res.status(200).json({ message: 'تم التحديث بنجاح' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Delete employee from Auth and Firestore
 */
router.delete('/delete/:id', async (req, res) => {
  const uid = req.params.id;
  try {
    // 1. Delete from Firebase Auth
    try {
      await auth.deleteUser(uid);
    } catch (e) {
      console.warn('[DELETE WARNING] User not found in Auth or already deleted:', e.message);
    }

    // 2. Delete from Firestore
    await db.collection('employees').doc(uid).delete();

    res.status(200).json({ message: 'تم حذف الموظف بنجاح' });
  } catch (error) {
    console.error('[DELETE ERROR]', error);
    res.status(500).json({ error: 'فشل حذف الموظف من النظام.' });
  }
});

module.exports = router;
