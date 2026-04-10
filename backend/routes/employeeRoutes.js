const express = require('express');
const router = express.Router();
const { admin, db, auth } = require('../firebaseAdmin');

/**
 * Create a new employee in Firebase Auth and Firestore.
 */
router.post('/create', async (req, res) => {
  console.log('[API] Processing employee creation request for:', req.body.email);
  const { name, email, password, phone, role } = req.body;

  if (auth.isMock) {
    return res.status(503).json({ error: 'عذراً، يجب رفع ملف serviceAccountKey.json في مجلد backend لتتمكن من إنشاء حسابات موظفين حقيقية.' });
  }

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'الاسم والبريد وكلمة المرور مطلوبة.' });
  }

  try {
    // 1. Create User in Firebase Auth
    const userRecord = await auth.createUser({
      email: email,
      password: password,
      displayName: name,
      phoneNumber: phone ? (phone.startsWith('+') ? phone : `+966${phone.replace(/^0/, '')}`) : undefined,
    });

    // 2. Add extra details to Firestore
    await db.collection('employees').doc(userRecord.uid).set({
      uid: userRecord.uid,
      name,
      email,
      phone: phone || '',
      role: role || 'employee',
      status: 'active',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(201).json({ 
      message: 'تم إنشاء الموظف بنجاح', 
      uid: userRecord.uid 
    });

  } catch (error) {
    console.error('[EMPLOYEE CREATE ERROR]', error);
    let errorMessage = 'فشل إنشاء الموظف';
    if (error.code === 'auth/email-already-exists') errorMessage = 'البريد الإلكتروني مسجل مسبقاً لموظف آخر.';
    if (error.code === 'auth/invalid-phone-number') errorMessage = 'رقم الهاتف غير صحيح (يجب أن يبدأ بـ 05 ويتكون من 10 أرقام).';
    if (error.code === 'auth/weak-password') errorMessage = 'كلمة المرور ضعيفة جداً.';
    
    res.status(400).json({ error: errorMessage, details: error.message });
  }
});

/**
 * Update employee (Firestore only for now, Auth if email changed)
 */
router.post('/update/:id', async (req, res) => {
  const { name, email, phone, role, status } = req.body;
  const uid = req.params.id;

  try {
    // Update Firestore
    await db.collection('employees').doc(uid).update({
      name,
      email,
      phone,
      role,
      status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Optionally update Auth display name
    await auth.updateUser(uid, {
        displayName: name,
        email: email
    });

    res.status(200).json({ message: 'تم التحديث بنجاح' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
