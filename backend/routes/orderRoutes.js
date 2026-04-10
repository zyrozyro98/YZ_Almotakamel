const express = require('express');
const router = express.Router();
const { db } = require('../firebaseAdmin');

// Create or Update Student from WhatsApp Order
router.post('/save-student', async (req, res) => {
  const { studentData } = req.body;
  
  if (!studentData || !studentData.phone) {
    return res.status(400).json({ error: 'Missing student phone or data.' });
  }

  try {
    const studentId = studentData.phone.replace(/[^0-9]/g, '');
    const studentRef = db.collection('students').doc(studentId);
    
    await studentRef.set({
      ...studentData,
      updatedAt: new Date().toISOString()
    }, { merge: true });

    res.status(200).json({ status: 'success', message: 'Student saved successfully.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update Order status
router.post('/update-order', async (req, res) => {
  const { orderId, status, details } = req.body;
  
  try {
    const orderRef = db.collection('orders').doc(orderId);
    await orderRef.update({
      status,
      ...details,
      updatedAt: new Date().toISOString()
    });
    res.status(200).json({ status: 'success' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
