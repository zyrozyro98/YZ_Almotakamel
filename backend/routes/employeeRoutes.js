const express = require('express');
const router = express.Router();
const { admin, db, rtdb, auth } = require('../firebaseAdmin');

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

    // 1.5. Set Custom Claims for instant role recognition in frontend
    try {
      await auth.setCustomUserClaims(userRecord.uid, { role: role || 'employee' });
      console.log(`[API] Custom claims set for ${userRecord.uid}: ${role}`);
    } catch (claimErr) {
      console.error('[API] Failed to set custom claims:', claimErr.message);
    }

    // 2. FAST PATH: Save role to Realtime Database (Quota-free & Reliable)
    // We do this FIRST because it's guaranteed to work even if Firestore is at quota
    try {
      const rtdbPath = `employee_roles/${userRecord.uid}`;
      console.log(`[API] Attempting RTDB write to path: ${rtdbPath}`);
      await rtdb.ref(rtdbPath).set({
        role: role || 'employee',
        name: name,
        status: 'active',
        email: email,
        assignedUniversity: assignedUniversity || 'الكل',
        assignedMajor: assignedMajor || 'الكل',
        updatedAt: Date.now(),
        createdAt: new Date().toISOString()
      });
      console.log(`[API] SUCCESS: RTDB record created at ${rtdbPath} for ${email}`);
    } catch (rtdbErr) {
      console.error(`[API ERROR] RTDB Write FAILED for ${email}:`, rtdbErr.message);
    }

    // 3. SLOW PATH: Add/Update details in Firestore (Source of truth)
    // We run this, but we don't let it hang the whole request if it's slow
    const firestoreWrite = async () => {
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
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        console.log(`[API] Firestore document created for ${userRecord.uid}`);
      } catch (fsErr) {
        console.error('[API] Firestore Write failed (likely quota):', fsErr.message);
      }
    };

    // We execute Firestore write but don't wait forever for it if quota is hit
    // This prevents the "Processing..." hang
    firestoreWrite();

    res.status(201).json({
      message: 'تم إنشاء الموظف بنجاح وتفعيل صلاحياته عبر النظام السريع',
      uid: userRecord.uid
    });

  } catch (error) {
    console.error('[EMPLOYEE CREATE ERROR]', error);
    let errorMessage = 'فشل إنشاء الموظف';
    if (error.code === 'auth/email-already-exists') errorMessage = 'البريد الإلكتروني مسجل مسبقاً لموظف آخر.';
    if (error.code === 'auth/invalid-phone-number') errorMessage = 'رقم الهاتف غير صحيح (يجب أن يبدأ بـ 05 ويتكون من 10 أرقام).';
    if (error.code === 'auth/weak-password') errorMessage = 'كلمة المرور ضعيفة جداً.';
    if (error.code === 'auth/phone-number-already-exists') errorMessage = 'رقم الهاتف مسجل مسبقاً لموظف آخر.';

    res.status(400).json({ error: errorMessage, details: error.message });
  }
});

/**
 * Update employee (Firestore only for now, Auth if email changed)
 */
router.post('/update/:id', async (req, res) => {
  const { name, email, phone, role, status, assignedUniversity, assignedMajor } = req.body;
  const uid = req.params.id;

  try {
    // 1. Update Custom Claims if role changed
    if (role) {
      await auth.setCustomUserClaims(uid, { role });
    }

    // 2. FAST PATH: Update RTDB (Source of Truth for UI)
    const updateData = {
      name,
      email,
      phone,
      role,
      status,
      assignedUniversity: assignedUniversity || 'الكل',
      assignedMajor: assignedMajor || 'الكل',
      updatedAt: Date.now()
    };

    await rtdb.ref(`employee_roles/${uid}`).update(updateData);
    console.log(`[API] RTDB update success for ${uid}`);

    // 3. SLOW PATH: Firestore (Background - don't await if quota might be hit)
    db.collection('employees').doc(uid).set(updateData, { merge: true })
      .then(() => console.log(`[API] Firestore sync success for ${uid}`))
      .catch(err => console.warn(`[API] Firestore sync failed (likely quota):`, err.message));

    res.json({ message: 'تم تحديث بيانات الموظف بنجاح' });
  } catch (error) {
    console.error('[EMPLOYEE UPDATE ERROR]', error);
    res.status(500).json({ error: 'حدث خطأ أثناء تحديث البيانات' });
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
