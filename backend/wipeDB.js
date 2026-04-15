const { rtdb, db } = require('./firebaseAdmin');

async function wipe() {
  try {
    console.log("🧹 جاري مسح قاعدة بيانات المحادثات والإشعارات...");
    await rtdb.ref('chats').remove();
    await rtdb.ref('notifications').remove();
    await rtdb.ref('lid_mappings').remove();
    
    console.log("🗑️ جاري مسح سجلات الطلاب...");
    const snap = await db.collection('students').get();
    const batch = db.batch();
    snap.forEach(doc => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    console.log("✅ تمت عملية المسح والتصفير بنجاح!");
    console.log("💡 الآن يمكنك إجراء اختبار نظيف بالكامل. واجهة المستخدم ستكون فارغة تماماً.");
    process.exit(0);
  } catch (err) {
    console.error("❌ حدث خطأ أثناء المسح:", err);
    process.exit(1);
  }
}

wipe();
