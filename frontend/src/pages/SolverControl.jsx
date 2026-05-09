import React, { useState, useEffect } from 'react';
import { db, rtdb } from '../firebase';
import { collection, onSnapshot, doc, updateDoc, query, orderBy, deleteDoc, getDocs, where } from 'firebase/firestore';
import { ref, onValue } from 'firebase/database';
import { ShieldCheck, Image as ImageIcon, Users, CheckCircle, Clock, Search, ExternalLink, X, RotateCcw, Trash2, RefreshCw, Settings, Save } from 'lucide-react';

export default function SolverControl() {
  const [activeTab, setActiveTab] = useState('submissions'); // 'submissions', 'unsolved', 'solved', 'automation'
  const [submissions, setSubmissions] = useState([]);
  const [students, setStudents] = useState([]);
  const [universities, setUniversities] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let fsSubmissions = [];
    let rtdbSubmissions = {};
    let fsStudents = [];
    let rtdbStatusUpdates = {};

    const mergeData = () => {
      // 1. Merge Submissions
      const mergedSubs = [...fsSubmissions];
      Object.keys(rtdbSubmissions).forEach(id => {
        if (!mergedSubs.find(s => s.id === id)) {
          mergedSubs.push({ id, ...rtdbSubmissions[id], source: 'rtdb' });
        }
      });
      setSubmissions(mergedSubs.sort((a, b) => (b.timestamp?.seconds || b.timestamp || 0) - (a.timestamp?.seconds || a.timestamp || 0)));

      // 2. Merge Students with RTDB Status Updates
      const mergedStudents = fsStudents.map(s => {
        if (rtdbStatusUpdates[s.id]) {
          return { ...s, ...rtdbStatusUpdates[s.id], source: 'rtdb-sync' };
        }
        return s;
      });
      setStudents(mergedStudents);
    };

    // --- Listeners ---
    
    // Firestore Submissions
    const qSubmissions = query(collection(db, 'solver_submissions'), orderBy('timestamp', 'desc'));
    const unsubSubmissions = onSnapshot(qSubmissions, (snap) => {
      fsSubmissions = snap.docs.map(s => ({ id: s.id, ...s.data() }));
      mergeData();
    });

    // RTDB Submissions
    const rtdbSubsRef = ref(rtdb, 'solver_submissions');
    const unsubRtdbSubs = onValue(rtdbSubsRef, (snap) => {
      if (snap.exists()) rtdbSubmissions = snap.val();
      else rtdbSubmissions = {};
      mergeData();
    });

    // Firestore Students (Filtered)
    const qStudents = query(collection(db, 'students'), where('mainStatus', 'in', ['مكتمل', 'انتظار', 'جديد']));
    const unsubStudents = onSnapshot(qStudents, (snap) => {
      fsStudents = snap.docs.map(s => ({ id: s.id, ...s.data() }));
      setLoading(false);
      mergeData();
    });

    // RTDB Status Updates
    const rtdbStatusRef = ref(rtdb, 'student_status_updates');
    const unsubRtdbStatus = onValue(rtdbStatusRef, (snap) => {
      if (snap.exists()) rtdbStatusUpdates = snap.val();
      else rtdbStatusUpdates = {};
      mergeData();
    });

    // Universities
    const unsubUniversities = onSnapshot(collection(db, 'universities'), (snap) => {
      setUniversities(snap.docs.map(u => ({ id: u.id, ...u.data() })));
    });

    return () => {
      unsubSubmissions();
      unsubRtdbSubs();
      unsubStudents();
      unsubRtdbStatus();
      unsubUniversities();
    };
  }, []);

  const unsolvedStudents = students.filter(s => s.mainStatus === 'مكتمل' && s.solverStatus !== 'completed');
  const solvedStudents = students.filter(s => s.solverStatus === 'completed');

  const filteredSubmissions = submissions.filter(s => 
    s.studentName?.includes(searchTerm) || s.solverName?.includes(searchTerm) || s.university?.includes(searchTerm)
  );
  
  const filteredUnsolved = unsolvedStudents.filter(s => 
    s.name?.includes(searchTerm) || s.university?.includes(searchTerm) || s.major?.includes(searchTerm)
  );

  const filteredSolved = solvedStudents.filter(s => 
    s.name?.includes(searchTerm) || s.university?.includes(searchTerm) || s.solvedBy?.includes(searchTerm)
  );

  const deleteSubmission = async (subId) => {
    if(window.confirm('هل أنت متأكد من حذف هذا الإثبات؟ لا يمكن التراجع.')) {
      try {
        await deleteDoc(doc(db, 'solver_submissions', subId));
      } catch (e) {
        console.error(e);
        alert('حدث خطأ أثناء الحذف');
      }
    }
  };

  const resetStudentSolverStatus = async (studentId, studentName) => {
    if(window.confirm(`هل أنت متأكد من إعادة الطالب (${studentName}) لقائمة "غير محلول"؟`)) {
      try {
        await updateDoc(doc(db, 'students', studentId), {
          solverStatus: 'pending',
          solvedBy: null,
          lockedById: null
        });
      } catch (e) {
        console.error(e);
        alert('حدث خطأ أثناء إعادة التعيين');
      }
    }
  };

  const handleUpdateUnivAutomation = async (univId, data) => {
    try {
      await updateDoc(doc(db, 'universities', univId), data);
      alert('تم حفظ إعدادات الأتمتة بنجاح.');
    } catch (e) {
      console.error(e);
      alert('حدث خطأ أثناء الحفظ');
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#fff' }}>
        <RefreshCw size={40} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up">
      {/* Header */}
      <div className="flex justify-between items-start responsive-flex" style={{ marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '10px', background: 'linear-gradient(to right, #fff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            <ShieldCheck size={32} color="var(--brand-primary)" /> الرقابة الإدارية للحلول
          </h1>
          <p style={{ color: 'var(--text-secondary)' }}>إدارة صور الإثباتات ومتابعة حالة حل الاختبارات للطلاب</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 sm-grid-cols-1 gap-4" style={{ marginBottom: '2.5rem' }}>
        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ width: '50px', height: '50px', borderRadius: '12px', background: 'rgba(59, 130, 246, 0.1)', color: 'var(--brand-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ImageIcon size={24} />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>إثباتات مرسلة</p>
            <h2 style={{ margin: 0, fontSize: '1.8rem' }}>{submissions.length}</h2>
          </div>
        </div>
        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ width: '50px', height: '50px', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Clock size={24} />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>طلاب (غير محلول)</p>
            <h2 style={{ margin: 0, fontSize: '1.8rem' }}>{unsolvedStudents.length}</h2>
          </div>
        </div>
        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ width: '50px', height: '50px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckCircle size={24} />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>طلاب (محلول)</p>
            <h2 style={{ margin: 0, fontSize: '1.8rem' }}>{solvedStudents.length}</h2>
          </div>
        </div>
      </div>

      {/* Search & Tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '15px' }}>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            className={activeTab === 'submissions' ? 'btn-primary' : 'btn-secondary'}
            style={{ padding: '10px 20px', borderRadius: '10px' }}
            onClick={() => setActiveTab('submissions')}
          >
            الصور والنتائج ({submissions.length})
          </button>
          <button
            className={activeTab === 'unsolved' ? 'btn-primary' : 'btn-secondary'}
            style={{ padding: '10px 20px', borderRadius: '10px', background: activeTab === 'unsolved' ? 'linear-gradient(135deg, var(--danger), #b91c1c)' : '' }}
            onClick={() => setActiveTab('unsolved')}
          >
            الطلاب (غير محلول) ({unsolvedStudents.length})
          </button>
          <button
            className={activeTab === 'solved' ? 'btn-primary' : 'btn-secondary'}
            style={{ padding: '10px 20px', borderRadius: '10px', background: activeTab === 'solved' ? 'linear-gradient(135deg, var(--success), #059669)' : '' }}
            onClick={() => setActiveTab('solved')}
          >
            الطلاب (محلول) ({solvedStudents.length})
          </button>
          <button
            className={activeTab === 'automation' ? 'btn-primary' : 'btn-secondary'}
            style={{ padding: '10px 20px', borderRadius: '10px', background: activeTab === 'automation' ? 'linear-gradient(135deg, #8b5cf6, #6d28d9)' : '' }}
            onClick={() => setActiveTab('automation')}
          >
            إعدادات الأتمتة <Settings size={16} style={{ display: 'inline', marginLeft: '5px' }} />
          </button>
        </div>
        <div style={{ position: 'relative', width: '300px', maxWidth: '100%' }}>
          <input
            type="text"
            className="input-base"
            placeholder="بحث..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ paddingRight: '40px' }}
          />
          <Search size={18} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
        </div>
      </div>

      {/* Content Area */}
      {activeTab === 'submissions' && (
        <div className="grid grid-cols-2 md-grid-cols-1 gap-6">
          {filteredSubmissions.length === 0 ? (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>لا توجد إثباتات مرسلة حالياً</div>
          ) : (
            filteredSubmissions.map(sub => (
              <div key={sub.id} className="glass-panel hover-glow" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px' }}>
                  <div>
                    <h3 style={{ margin: '0 0 5px 0', color: '#fff', fontSize: '1.2rem' }}>الطالب: {sub.studentName}</h3>
                    <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>الجامعة: {sub.university} | التخصص: {sub.major}</p>
                    <p style={{ margin: '5px 0 0 0', color: 'var(--brand-primary)', fontSize: '0.9rem', fontWeight: 'bold' }}>حلال الاختبار: {sub.solverName}</p>
                  </div>
                  <button onClick={() => deleteSubmission(sub.id)} className="btn-secondary" style={{ color: 'var(--danger)', padding: '8px', border: 'none', background: 'rgba(239, 68, 68, 0.1)' }} title="حذف الإثبات">
                    <Trash2 size={18} />
                  </button>
                </div>
                {sub.notes && (
                  <div style={{ background: 'rgba(255,255,255,0.05)', padding: '10px', borderRadius: '10px' }}>
                    <strong style={{ color: 'var(--warning)', fontSize: '0.85rem' }}>ملاحظات:</strong>
                    <p style={{ margin: '5px 0 0 0', fontSize: '0.95rem' }}>{sub.notes}</p>
                  </div>
                )}
                <div style={{ marginTop: 'auto' }}>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                    تاريخ الإرسال: {sub.timestamp?.toDate ? sub.timestamp.toDate().toLocaleString('ar-EG') : 'غير متوفر'}
                  </p>
                  <button 
                    className="btn-primary" 
                    style={{ width: '100%', gap: '10px' }}
                    onClick={() => setSelectedImage(sub.proofImage)}
                  >
                    <ImageIcon size={18} /> عرض صورة الإثبات
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'unsolved' && (
        <div className="glass-panel" style={{ overflow: 'hidden' }}>
          <div className="table-responsive">
            <table className="table" style={{ width: '100%', textAlign: 'right' }}>
              <thead>
                <tr>
                  <th>اسم الطالب</th>
                  <th>الجامعة</th>
                  <th>التخصص</th>
                  <th>رقم الواتساب</th>
                  <th>حالة الحل</th>
                  <th>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filteredUnsolved.length === 0 ? (
                  <tr><td colSpan="6" style={{ textAlign: 'center', padding: '2rem' }}>لا يوجد طلاب</td></tr>
                ) : (
                  filteredUnsolved.map(s => (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 'bold' }}>{s.name}</td>
                      <td>{s.university || '-'}</td>
                      <td>{s.major || '-'}</td>
                      <td dir="ltr" style={{ textAlign: 'right' }}>{s.whatsapp}</td>
                      <td>
                        {s.solverStatus === 'in_progress' ? (
                          <span className="badge badge-warning">قيد الحل (بواسطة {s.solvedBy})</span>
                        ) : (
                          <span className="badge badge-danger">بانتظار الحل</span>
                        )}
                      </td>
                      <td>
                        {s.solverStatus === 'in_progress' && (
                          <button 
                            className="btn-secondary" 
                            style={{ padding: '6px 12px', fontSize: '0.85rem', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                            onClick={() => resetStudentSolverStatus(s.id, s.name)}
                            title="إلغاء حجز المهمة وإعادتها لقائمة المهام الجديدة ليتمكن موظف آخر من حلها"
                          >
                            <RotateCcw size={14} style={{ marginLeft: '5px' }} /> استعادة للمهام الجديدة
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'solved' && (
        <div className="glass-panel" style={{ overflow: 'hidden' }}>
          <div className="table-responsive">
            <table className="table" style={{ width: '100%', textAlign: 'right' }}>
              <thead>
                <tr>
                  <th>اسم الطالب</th>
                  <th>الجامعة</th>
                  <th>التخصص</th>
                  <th>منفذ الحل</th>
                  <th>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filteredSolved.length === 0 ? (
                  <tr><td colSpan="5" style={{ textAlign: 'center', padding: '2rem' }}>لا يوجد طلاب</td></tr>
                ) : (
                  filteredSolved.map(s => (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 'bold' }}>{s.name}</td>
                      <td>{s.university || '-'}</td>
                      <td>{s.major || '-'}</td>
                      <td><span className="badge badge-success">{s.solvedBy || 'غير معروف'}</span></td>
                      <td>
                        <button 
                          className="btn-secondary" 
                          style={{ padding: '6px 12px', fontSize: '0.85rem', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                          onClick={() => resetStudentSolverStatus(s.id, s.name)}
                          title="إذا كان الحل خاطئاً أو مرفوضاً، يمكنك إعادته لقائمة الطلاب غير المحلولين"
                        >
                          <RotateCcw size={14} style={{ marginLeft: '5px' }} /> إعادة تعيين (إلغاء الحل)
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'automation' && (
        <div className="grid grid-cols-2 md-grid-cols-1 gap-6">
          <div style={{ gridColumn: '1 / -1', background: 'rgba(245, 158, 11, 0.1)', padding: '15px', borderRadius: '12px', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
            <h4 style={{ margin: '0 0 10px 0', color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldCheck size={20} /> ملاحظة هامة جداً حول الأتمتة التلقائية
            </h4>
            <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: '1.6', fontSize: '0.95rem' }}>
              إدخال عناصر CSS هنا سيتيح للنظام محاولة الإدخال التلقائي للبيانات داخل المنصة التعليمية للموظف. 
              <strong> ولكن: </strong> متصفحات الويب القياسية (Chrome, Edge) تمنع التعديل المباشر داخل المواقع الخارجية لأسباب أمنية (سياسات CORS). 
              هذه الميزة ستعمل بشكل مثالي فقط في حال تحويل النظام إلى تطبيق سطح مكتب (Desktop) أو توفير إضافة للمتصفح.
            </p>
          </div>

          {universities.map(univ => (
            <div key={univ.id} className="glass-panel hover-glow" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <h3 style={{ margin: '0 0 10px 0', color: '#fff', fontSize: '1.2rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px' }}>
                جامعة: {univ.name}
              </h3>
              
              <div className="flex-col gap-2">
                <label className="input-label" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>محدد حقل اسم المستخدم (CSS Selector)</label>
                <input 
                  type="text" 
                  className="input-base" 
                  placeholder="مثال: #username أو input[name='user']" 
                  defaultValue={univ.userSelector || ''}
                  id={`user-${univ.id}`}
                  dir="ltr"
                />
              </div>

              <div className="flex-col gap-2">
                <label className="input-label" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>محدد حقل كلمة المرور (CSS Selector)</label>
                <input 
                  type="text" 
                  className="input-base" 
                  placeholder="مثال: #password أو input[type='password']" 
                  defaultValue={univ.passSelector || ''}
                  id={`pass-${univ.id}`}
                  dir="ltr"
                />
              </div>

              <div className="flex-col gap-2">
                <label className="input-label" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>محدد زر تسجيل الدخول (CSS Selector)</label>
                <input 
                  type="text" 
                  className="input-base" 
                  placeholder="مثال: #loginbtn أو button[type='submit']" 
                  defaultValue={univ.loginBtnSelector || ''}
                  id={`btn-${univ.id}`}
                  dir="ltr"
                />
              </div>

              <button 
                className="btn-primary" 
                style={{ marginTop: '10px', gap: '8px' }}
                onClick={() => {
                  const userSel = document.getElementById(`user-${univ.id}`).value;
                  const passSel = document.getElementById(`pass-${univ.id}`).value;
                  const btnSel = document.getElementById(`btn-${univ.id}`).value;
                  handleUpdateUnivAutomation(univ.id, { userSelector: userSel, passSelector: passSel, loginBtnSelector: btnSel });
                }}
              >
                <Save size={18} /> حفظ إعدادات هذه الجامعة
              </button>
            </div>
          ))}
        </div>
      )}


      {/* Image Modal */}
      {selectedImage && (
        <div 
          style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(5px)' }}
          onClick={() => setSelectedImage(null)}
        >
          <button 
            style={{ position: 'absolute', top: '25px', right: '30px', background: 'var(--danger)', border: 'none', color: '#fff', padding: '12px 24px', borderRadius: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.1rem', fontWeight: 'bold', boxShadow: '0 4px 15px rgba(239, 68, 68, 0.4)', zIndex: 10000 }}
            onClick={(e) => { e.stopPropagation(); setSelectedImage(null); }}
            title="إغلاق الصورة"
          >
            <X size={24} /> إغلاق الصورة
          </button>
          <img 
            src={selectedImage} 
            alt="إثبات الحل" 
            style={{ maxWidth: '90%', maxHeight: '90vh', borderRadius: '12px', boxShadow: '0 0 40px rgba(0,0,0,0.6)' }} 
            onClick={(e) => e.stopPropagation()} 
          />
        </div>
      )}
    </div>
  );
}
