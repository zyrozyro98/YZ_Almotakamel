import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { collection, onSnapshot, doc, getDoc, getDocs, addDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { ExternalLink, Copy, Check, Lock, Shield, ImagePlus, Send, AlertTriangle, User, RefreshCw, X } from 'lucide-react';

export default function SolverDashboard() {
  const [solverData, setSolverData] = useState(null);
  const [isLocked, setIsLocked] = useState(false);
  const [students, setStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [copiedField, setCopiedField] = useState('');
  const [assignedUnivPlatformUrl, setAssignedUnivPlatformUrl] = useState('');
  
  const [submissionData, setSubmissionData] = useState({
    proofImage: '',
    notes: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check lock status
    const unsubLock = onSnapshot(doc(db, 'system_settings', 'global'), (doc) => {
      if (doc.exists()) {
        setIsLocked(doc.data().solverSystemLocked === true);
      }
    });

    const unsubAuth = auth.onAuthStateChanged(async user => {
      if (user) {
        try {
          const empDoc = await getDoc(doc(db, 'employees', user.uid));
          if (empDoc.exists() && empDoc.data().role === 'solver') {
            const data = empDoc.data();
            setSolverData({ id: user.uid, ...data });
            
            // Fetch students matching university and major
            if (data.assignedUniversity || data.assignedMajor) {
               // Fetch university platformUrl
               getDocs(collection(db, 'universities')).then(snap => {
                 snap.forEach(u => {
                   if (u.data().name === data.assignedUniversity && u.data().platformUrl) {
                     setAssignedUnivPlatformUrl(u.data().platformUrl);
                   }
                 });
               }).catch(e => console.error(e));

               // We fetch all and filter client side for simplicity, or use query if index exists
               const unsubStudents = onSnapshot(collection(db, 'students'), (snap) => {
                 const matched = [];
                 snap.forEach(s => {
                   const sData = s.data();
                   const matchUniv = !data.assignedUniversity || data.assignedUniversity === 'الكل' || sData.university === data.assignedUniversity;
                   const matchMajor = !data.assignedMajor || data.assignedMajor === 'الكل' || sData.major === data.assignedMajor;
                   if (matchUniv && matchMajor) {
                     // Optionally check if already solved, but for now show all matched
                     matched.push({ id: s.id, ...sData });
                   }
                 });
                 setStudents(matched);
               });
               setLoading(false);
               return () => unsubStudents();
            } else {
               setLoading(false);
            }
          }
        } catch (e) {
          console.error(e);
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    });

    return () => { unsubLock(); unsubAuth(); };
  }, []);

  const handleCopy = (text, field) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(''), 2000);
  };

  const clearClipboard = () => {
    navigator.clipboard.writeText('').catch(() => {}); // Attempt to clear clipboard securely
  };

  const openStudentPanel = (student) => {
    clearClipboard();
    setSelectedStudent(student);
    setSubmissionData({ proofImage: '', notes: '' });
  };

  const closeStudentPanel = () => {
    clearClipboard();
    setSelectedStudent(null);
    setSubmissionData({ proofImage: '', notes: '' });
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert('حجم الصورة يجب أن لا يتجاوز 2 ميجابايت.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setSubmissionData({ ...submissionData, proofImage: reader.result });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!submissionData.proofImage) {
      alert('الرجاء إرفاق صورة إثبات النتيجة أولاً.');
      return;
    }

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'solver_submissions'), {
        studentId: selectedStudent.id,
        studentName: selectedStudent.name,
        solverId: solverData.id,
        solverName: solverData.name,
        university: selectedStudent.university,
        major: selectedStudent.major,
        proofImage: submissionData.proofImage,
        notes: submissionData.notes,
        timestamp: serverTimestamp(),
        status: 'completed'
      });

      // Update student status optionally
      await updateDoc(doc(db, 'students', selectedStudent.id), {
        solverStatus: 'completed',
        solvedBy: solverData.name
      });

      alert('تم إرسال النتيجة بنجاح للرقابة.');
      closeStudentPanel();
    } catch (err) {
      console.error(err);
      alert('حدث خطأ أثناء الإرسال.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#fff' }}>
        <RefreshCw size={40} className="animate-spin" />
      </div>
    );
  }

  if (!solverData) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '40px', borderRadius: '24px', maxWidth: '500px', margin: '0 auto', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
          <AlertTriangle size={60} color="var(--danger)" style={{ marginBottom: '20px' }} />
          <h2 style={{ color: '#fff', marginBottom: '10px' }}>عذراً، غير مصرح لك بالدخول</h2>
          <p style={{ color: 'rgba(255,255,255,0.6)' }}>هذه الصفحة مخصصة لحلالي الاختبارات فقط.</p>
        </div>
      </div>
    );
  }

  if (isLocked) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ background: 'rgba(0, 0, 0, 0.4)', padding: '50px', borderRadius: '24px', maxWidth: '500px', margin: '0 auto', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
          <Lock size={80} color="var(--brand-primary)" style={{ marginBottom: '20px', filter: 'drop-shadow(0 0 20px var(--brand-primary))' }} />
          <h2 style={{ color: '#fff', marginBottom: '15px', fontSize: '1.8rem' }}>النظام مقفل حالياً</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', lineHeight: '1.6' }}>
            تم إيقاف العمل في المنصة من قبل الإدارة.
            لا يمكنك الوصول إلى بيانات الطلاب أو إجراء أي عمليات في الوقت الحالي.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up">
      <div className="flex justify-between items-center" style={{ marginBottom: '2rem' }}>
        <div>
          <h1>لوحة مهام الحل</h1>
          <p style={{ color: 'var(--text-secondary)' }}>الجامعة: {solverData.assignedUniversity || 'غير محدد'} | التخصص: {solverData.assignedMajor || 'غير محدد'}</p>
        </div>
        <div style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', padding: '10px 20px', borderRadius: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Shield size={18} /> النظام نشط
        </div>
      </div>

      {!selectedStudent ? (
        <div className="grid grid-cols-3 sm-grid-cols-1 gap-6">
          {students.filter(s => s.solverStatus !== 'completed').length === 0 ? (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '4rem', background: 'rgba(255,255,255,0.02)', borderRadius: '20px' }}>
              <Check size={50} style={{ opacity: 0.3, marginBottom: '1rem', color: 'var(--brand-primary)' }} />
              <h3 style={{ color: '#fff' }}>لا توجد مهام حالياً</h3>
              <p style={{ color: 'var(--text-secondary)' }}>تم إنجاز كافة الطلاب أو لم يتم تعيين طلاب جدد بعد.</p>
            </div>
          ) : (
            students.filter(s => s.solverStatus !== 'completed').map(student => (
              <div key={student.id} className="glass-panel hover-glow" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '45px', height: '45px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand-primary)' }}>
                    <User size={24} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{student.name}</h3>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>دفعة: {student.batch || 'غير محدد'}</p>
                  </div>
                </div>
                <button className="btn-primary" style={{ width: '100%', padding: '12px', marginTop: 'auto' }} onClick={() => openStudentPanel(student)}>
                  بدء الحل
                </button>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="glass-panel" style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto', position: 'relative' }}>
          <button 
            onClick={closeStudentPanel}
            style={{ position: 'absolute', top: '20px', left: '20px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', border: 'none', padding: '8px', borderRadius: '50%', cursor: 'pointer' }}
          >
            <X size={20} />
          </button>
          
          <h2 style={{ marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid var(--glass-border)' }}>مهام الطالب: {selectedStudent.name}</h2>
          
          <div className="grid grid-cols-2 sm-grid-cols-1 gap-6" style={{ marginBottom: '2rem' }}>
            <div className="flex-col gap-3">
              <label className="input-label" style={{ color: 'var(--text-secondary)' }}>اسم المستخدم</label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input type="text" className="input-base" readOnly value={selectedStudent.username || 'غير متوفر'} style={{ opacity: 0.8 }} />
                <button 
                  className="btn-secondary" 
                  onClick={() => handleCopy(selectedStudent.username, 'username')}
                  style={{ width: '50px', background: copiedField === 'username' ? 'rgba(16, 185, 129, 0.2)' : '' }}
                >
                  {copiedField === 'username' ? <Check size={18} color="#10b981" /> : <Copy size={18} />}
                </button>
              </div>
            </div>

            <div className="flex-col gap-3">
              <label className="input-label" style={{ color: 'var(--text-secondary)' }}>كلمة المرور</label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input type="text" className="input-base" readOnly value={selectedStudent.password || 'غير متوفر'} style={{ opacity: 0.8 }} />
                <button 
                  className="btn-secondary" 
                  onClick={() => handleCopy(selectedStudent.password, 'password')}
                  style={{ width: '50px', background: copiedField === 'password' ? 'rgba(16, 185, 129, 0.2)' : '' }}
                >
                  {copiedField === 'password' ? <Check size={18} color="#10b981" /> : <Copy size={18} />}
                </button>
              </div>
            </div>
          </div>

          <div style={{ marginBottom: '2.5rem', textAlign: 'center' }}>
            <button 
              className="btn-primary" 
              style={{ width: '100%', padding: '15px', fontSize: '1.1rem', gap: '10px' }}
              onClick={() => {
                const finalUrl = selectedStudent.platformUrl || assignedUnivPlatformUrl;
                if (finalUrl) {
                  window.open(finalUrl, '_blank');
                } else {
                  alert('لا يوجد رابط منصة تعليمية مسجل لهذا الطالب ولا للجامعة.');
                }
              }}
            >
              <ExternalLink size={20} /> الانتقال للمنصة التعليمية
            </button>
          </div>

          <div style={{ padding: '2rem', background: 'rgba(0,0,0,0.2)', borderRadius: '15px', border: '1px solid var(--glass-border)' }}>
            <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Shield size={20} color="var(--brand-primary)" /> إرسال النتيجة للإدارة
            </h3>
            
            <form onSubmit={handleSubmit} className="flex-col gap-5">
              <div className="flex-col gap-2">
                <label className="input-label">صورة إثبات الحل (إلزامي)</label>
                <div style={{ position: 'relative' }}>
                  <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} id="proof-upload" />
                  <label htmlFor="proof-upload" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '2rem', background: 'rgba(255,255,255,0.02)', border: '2px dashed var(--glass-border)', borderRadius: '12px', cursor: 'pointer', transition: 'all 0.3s ease' }}>
                    {submissionData.proofImage ? (
                      <>
                        <img src={submissionData.proofImage} alt="Preview" style={{ maxHeight: '150px', borderRadius: '8px' }} />
                        <span style={{ color: 'var(--brand-primary)', fontSize: '0.9rem', fontWeight: 600 }}>تغيير الصورة</span>
                      </>
                    ) : (
                      <>
                        <ImagePlus size={40} color="var(--text-secondary)" />
                        <span style={{ color: 'var(--text-secondary)' }}>اضغط هنا لاختيار صورة النتيجة</span>
                      </>
                    )}
                  </label>
                </div>
              </div>

              <div className="flex-col gap-2">
                <label className="input-label">تفاصيل إضافية أو ملاحظات للإدارة (اختياري)</label>
                <textarea 
                  className="input-base" 
                  rows="3" 
                  placeholder="اكتب أي تفاصيل أخرى ترغب في إضافتها للإدارة..."
                  value={submissionData.notes}
                  onChange={e => setSubmissionData({...submissionData, notes: e.target.value})}
                ></textarea>
              </div>

              <button type="submit" className="btn-primary" disabled={isSubmitting} style={{ marginTop: '1rem', padding: '15px', background: 'linear-gradient(45deg, #10b981, #059669)' }}>
                {isSubmitting ? 'جاري الإرسال...' : <><Send size={18} /> تأكيد وإرسال للإدارة</>}
              </button>
            </form>
          </div>

        </div>
      )}
    </div>
  );
}
