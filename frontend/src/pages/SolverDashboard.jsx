import React, { useState, useEffect } from 'react';
import { db, auth, rtdb } from '../firebase';
import { collection, onSnapshot, doc, getDoc, getDocs, addDoc, serverTimestamp, updateDoc, query, where } from 'firebase/firestore';
import { ref, onValue } from 'firebase/database';
import { ExternalLink, Copy, Check, Lock, Shield, ImagePlus, Send, AlertTriangle, User, RefreshCw, X, Clock, CheckCircle, FileText, ArrowRight, BookOpen, GraduationCap, Eye, EyeOff } from 'lucide-react';

export default function SolverDashboard() {
  const [solverData, setSolverData] = useState(null);
  const [isLocked, setIsLocked] = useState(false);
  const [students, setStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [copiedField, setCopiedField] = useState('');
  const [assignedUnivPlatformUrl, setAssignedUnivPlatformUrl] = useState('');
  const [activeTab, setActiveTab] = useState('new'); // 'new', 'in_progress', 'completed'
  const [showUsername, setShowUsername] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [platformModalOpen, setPlatformModalOpen] = useState(false);
  const [currentPlatformUrl, setCurrentPlatformUrl] = useState('');
  const [universitiesData, setUniversitiesData] = useState([]);

  const [submissionData, setSubmissionData] = useState({
    proofImage: '',
    notes: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubStudents = null;
    let unsubUniversities = null;

    // 1. Lock Status (RTDB Fast Path)
    const lockRef = ref(rtdb, 'system_settings/solverSystemLocked');
    const unsubLock = onValue(lockRef, (snap) => {
      setIsLocked(snap.val() === true);
    });

    // 2. Main Init Function
    const initSolver = async (user) => {
      try {
        let fsStudents = [];
        let rtdbStudents = {};
        let currentSolverInfo = null;

        const updateStudents = (fs, rt, info) => {
          if (!info) return;
          const merged = [...fs];
          Object.keys(rt || {}).forEach(id => {
            if (!merged.find(s => s.id === id)) {
              merged.push({ id, ...rt[id], source: 'rtdb' });
            }
          });

          const filtered = merged.filter(s => {
            const matchUniv = info.assignedUniversity === 'الكل' || s.university === info.assignedUniversity;
            const matchMajor = info.assignedMajor === 'الكل' || s.major === info.assignedMajor;
            return matchUniv && matchMajor;
          });
          setStudents(filtered);
        };

        // A. FAST PATH: RTDB (Primary for unblocking UI)
        const roleRef = ref(rtdb, `employee_roles/${user.uid}`);
        onValue(roleRef, (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.val();
            const info = {
              id: user.uid,
              name: data.name,
              role: data.role,
              assignedUniversity: data.assignedUniversity || 'الكل',
              assignedMajor: data.assignedMajor || 'الكل'
            };
            setSolverData(info);
            currentSolverInfo = info;
            updateStudents(fsStudents, rtdbStudents, info);

            // Start RTDB Students Listener once we have solver info
            const rtdbStudentsRef = ref(rtdb, 'active_students');
            onValue(rtdbStudentsRef, (snap) => {
              rtdbStudents = snap.exists() ? snap.val() : {};
              updateStudents(fsStudents, rtdbStudents, currentSolverInfo);
            });
          }
        }, { onlyOnce: true });

        // B. Firestore Students Listener (Parallel)
        const studentsQuery = query(collection(db, 'students'), where('mainStatus', '!=', 'مكتمل'));
        unsubStudents = onSnapshot(studentsQuery, (snap) => {
          fsStudents = snap.docs.map(s => ({ id: s.id, ...s.data() }));
          updateStudents(fsStudents, rtdbStudents, currentSolverInfo);
        }, (err) => {
          console.warn("Firestore students query blocked:", err);
          updateStudents(fsStudents, rtdbStudents, currentSolverInfo);
        });

        // C. Universities Listener
        unsubUniversities = onSnapshot(collection(db, 'universities'), (snap) => {
          const univs = snap.docs.map(u => ({ id: u.id, ...u.data() }));
          setUniversitiesData(univs);
        });

        setLoading(false);
      } catch (err) {
        console.error("Solver Init Error:", err);
        setLoading(false);
      }
    };

    const unsubAuth = auth.onAuthStateChanged(user => {
      if (user) {
        initSolver(user);
      } else {
        setLoading(false);
        setSolverData(null);
      }
    });

    return () => {
      unsubAuth();
      unsubLock();
      if (unsubStudents) unsubStudents();
      if (unsubUniversities) unsubUniversities();
      // unsubRtdbStudents is local to initSolver, so we handle it there or via a ref
    };
  }, []);

  const handleCopy = (text, field) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(''), 2000);
  };

  const clearClipboard = () => {
    navigator.clipboard.writeText('').catch(() => { });
  };

  const openStudentPanel = async (student) => {
    // If not already locked by this solver, lock it
    if (student.solverStatus !== 'in_progress' || student.lockedById !== solverData.id) {
      try {
        await updateDoc(doc(db, 'students', student.id), {
          solverStatus: 'in_progress',
          lockedById: solverData.id,
          solvedBy: solverData.name
        });
      } catch (e) {
        console.error(e);
        alert('حدث خطأ أثناء حجز المهمة');
        return;
      }
    }
    clearClipboard();
    setSelectedStudent({ ...student, solverStatus: 'in_progress', lockedById: solverData.id });
    setSubmissionData({ proofImage: '', notes: '' });
    setShowUsername(false);
    setShowPassword(false);
  };

  const closeStudentPanel = () => {
    clearClipboard();
    setSelectedStudent(null);
    setSubmissionData({ proofImage: '', notes: '' });
    setShowUsername(false);
    setShowPassword(false);
    setPlatformModalOpen(false);
  };

  const cancelStudentTask = async () => {
    if (!selectedStudent) return;
    if (window.confirm('هل أنت متأكد من إلغاء حجز هذه المهمة؟ سيتم إعادتها لقائمة المهام الجديدة ليتمكن غيرك من حلها.')) {
      try {
        await updateDoc(doc(db, 'students', selectedStudent.id), {
          solverStatus: 'pending',
          lockedById: null,
          solvedBy: null
        });
        closeStudentPanel();
      } catch (e) {
        console.error(e);
        alert('حدث خطأ أثناء إلغاء المهمة');
      }
    }
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
      // 1. Save to Firestore (Primary)
      const submissionRef = await addDoc(collection(db, 'solver_submissions'), {
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

      // 2. Save to RTDB (Fast Path for Monitoring)
      const { ref: rtdbRef, set: rtdbSet } = await import('firebase/database');
      await rtdbSet(rtdbRef(rtdb, `solver_submissions/${submissionRef.id}`), {
        studentId: selectedStudent.id,
        studentName: selectedStudent.name,
        solverId: solverData.id,
        solverName: solverData.name,
        university: selectedStudent.university,
        major: selectedStudent.major,
        proofImage: submissionData.proofImage,
        notes: submissionData.notes,
        timestamp: Date.now(),
        status: 'completed'
      });

      // 3. Update Student Status in both
      await updateDoc(doc(db, 'students', selectedStudent.id), {
        solverStatus: 'completed',
        solvedBy: solverData.name,
        lockedById: solverData.id
      });

      // Update student status in RTDB (if students node exists there, or just a flag)
      await rtdbSet(rtdbRef(rtdb, `student_status_updates/${selectedStudent.id}`), {
        solverStatus: 'completed',
        solvedBy: solverData.name,
        lockedById: solverData.id,
        updatedAt: Date.now()
      });

      alert('تم إرسال النتيجة بنجاح للرقابة.');
      closeStudentPanel();
      setActiveTab('completed');
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

  if (isLocked && solverData?.role !== 'admin') {
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

  // Categorize students
  const newTasks = students.filter(s => !s.solverStatus || s.solverStatus === 'pending');
  const myInProgressTasks = students.filter(s => s.solverStatus === 'in_progress' && s.lockedById === solverData.id);
  const myCompletedTasks = students.filter(s => s.solverStatus === 'completed' && (s.lockedById === solverData.id || s.solvedBy === solverData.name));

  const renderStudentCards = (list, type) => {
    if (list.length === 0) {
      return (
        <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '4rem 2rem', background: 'rgba(255,255,255,0.02)', borderRadius: '24px', border: '1px dashed var(--glass-border)' }}>
          {type === 'new' && <BookOpen size={60} style={{ opacity: 0.3, marginBottom: '1rem', color: 'var(--brand-primary)', margin: '0 auto' }} />}
          {type === 'in_progress' && <Clock size={60} style={{ opacity: 0.3, marginBottom: '1rem', color: 'var(--warning)', margin: '0 auto' }} />}
          {type === 'completed' && <CheckCircle size={60} style={{ opacity: 0.3, marginBottom: '1rem', color: 'var(--success)', margin: '0 auto' }} />}
          <h3 style={{ color: '#fff', fontSize: '1.4rem' }}>
            {type === 'new' ? 'لا توجد مهام جديدة حالياً' : type === 'in_progress' ? 'ليس لديك مهام قيد الإنجاز' : 'لم تقم بإنجاز مهام بعد'}
          </h3>
          <p style={{ color: 'var(--text-secondary)' }}>
            {type === 'new' ? 'انتظر حتى يتم تعيين طلاب جدد أو تواصل مع الإدارة.' : type === 'in_progress' ? 'اختر مهمة من المهام الجديدة لتبدأ بحلها.' : 'بادر بحل الاختبارات لتظهر إنجازاتك هنا.'}
          </p>
        </div>
      );
    }

    return list.map(student => (
      <div key={student.id} className="glass-panel hover-glow group" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '15px', position: 'relative', overflow: 'hidden' }}>
        {type === 'completed' && (
          <div style={{ position: 'absolute', top: 0, right: 0, width: '4px', height: '100%', background: 'var(--success)' }}></div>
        )}
        {type === 'in_progress' && (
          <div style={{ position: 'absolute', top: 0, right: 0, width: '4px', height: '100%', background: 'var(--warning)' }}></div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '50px', height: '50px', borderRadius: '14px', background: 'linear-gradient(135deg, rgba(59,130,246,0.1), rgba(6,182,212,0.1))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand-primary)' }}>
            <User size={24} />
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#fff' }}>{student.name}</h3>
            <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}><GraduationCap size={12} /> {student.major || 'غير محدد'}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>| دفعة: {student.batch || '-'}</span>
            </div>
          </div>
        </div>

        {type !== 'completed' ? (
          <button
            className="btn-primary"
            style={{ width: '100%', padding: '12px', marginTop: 'auto', background: type === 'in_progress' ? 'linear-gradient(135deg, var(--warning), #d97706)' : '' }}
            onClick={() => openStudentPanel(student)}
          >
            {type === 'in_progress' ? 'متابعة الحل' : 'بدء الحل'} <ArrowRight size={16} />
          </button>
        ) : (
          <div style={{ marginTop: 'auto', padding: '12px', background: 'rgba(16,185,129,0.1)', color: 'var(--success)', borderRadius: '12px', textAlign: 'center', fontWeight: 'bold', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
            <CheckCircle size={18} /> تم الإنجاز
          </div>
        )}
      </div>
    ));
  };

  return (
    <div className="animate-fade-in-up">
      {/* Header and Stats */}
      <div className="flex justify-between items-start responsive-flex" style={{ marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem', background: 'linear-gradient(to right, #fff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>مرحباً بك، {solverData.name}</h1>
          <p style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <BookOpen size={16} /> الجامعة المخصصة: <strong style={{ color: '#fff' }}>{solverData.assignedUniversity || 'الكل'}</strong> | التخصص: <strong style={{ color: '#fff' }}>{solverData.assignedMajor || 'الكل'}</strong>
          </p>
        </div>
        <div style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', padding: '10px 20px', borderRadius: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
          <Shield size={18} /> النظام نشط
        </div>
      </div>

      <div className="grid grid-cols-3 sm-grid-cols-1 gap-4" style={{ marginBottom: '2.5rem' }}>
        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ width: '50px', height: '50px', borderRadius: '12px', background: 'rgba(59, 130, 246, 0.1)', color: 'var(--brand-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FileText size={24} />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>مهام جديدة</p>
            <h2 style={{ margin: 0, fontSize: '1.8rem' }}>{newTasks.length}</h2>
          </div>
        </div>
        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ width: '50px', height: '50px', borderRadius: '12px', background: 'rgba(245, 158, 11, 0.1)', color: 'var(--warning)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Clock size={24} />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>قيد الإنجاز</p>
            <h2 style={{ margin: 0, fontSize: '1.8rem' }}>{myInProgressTasks.length}</h2>
          </div>
        </div>
        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ width: '50px', height: '50px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckCircle size={24} />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>إنجازاتي</p>
            <h2 style={{ margin: 0, fontSize: '1.8rem' }}>{myCompletedTasks.length}</h2>
          </div>
        </div>
      </div>

      {!selectedStudent ? (
        <>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '1.5rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px' }}>
            <button
              className={activeTab === 'new' ? 'btn-primary' : 'btn-secondary'}
              style={{ padding: '10px 20px', borderRadius: '10px', fontSize: '0.95rem' }}
              onClick={() => setActiveTab('new')}
            >
              المهام الجديدة ({newTasks.length})
            </button>
            <button
              className={activeTab === 'in_progress' ? 'btn-primary' : 'btn-secondary'}
              style={{ padding: '10px 20px', borderRadius: '10px', fontSize: '0.95rem', background: activeTab === 'in_progress' ? 'linear-gradient(135deg, var(--warning), #d97706)' : '' }}
              onClick={() => setActiveTab('in_progress')}
            >
              قيد الإنجاز ({myInProgressTasks.length})
            </button>
            <button
              className={activeTab === 'completed' ? 'btn-primary' : 'btn-secondary'}
              style={{ padding: '10px 20px', borderRadius: '10px', fontSize: '0.95rem', background: activeTab === 'completed' ? 'linear-gradient(135deg, var(--success), #059669)' : '' }}
              onClick={() => setActiveTab('completed')}
            >
              مهامي المنجزة ({myCompletedTasks.length})
            </button>
          </div>

          {/* Student Grid */}
          <div className="grid grid-cols-3 md-grid-cols-2 sm-grid-cols-1 gap-6">
            {activeTab === 'new' && renderStudentCards(newTasks, 'new')}
            {activeTab === 'in_progress' && renderStudentCards(myInProgressTasks, 'in_progress')}
            {activeTab === 'completed' && renderStudentCards(myCompletedTasks, 'completed')}
          </div>
        </>
      ) : (
        <div className="glass-panel animate-fade-in-up" style={{ padding: '2.5rem', maxWidth: '800px', margin: '0 auto', position: 'relative', borderRadius: '24px' }}>
          <button
            onClick={closeStudentPanel}
            style={{ position: 'absolute', top: '25px', left: '25px', background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-secondary)', border: '1px solid var(--glass-border)', padding: '10px', borderRadius: '12px', cursor: 'pointer', transition: 'all 0.2s' }}
            onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#fff'; }}
            onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
            title="إخفاء النافذة (العودة لاحقاً)"
          >
            <ArrowRight size={20} />
          </button>

          <div style={{ marginBottom: '2rem', paddingBottom: '1.5rem', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ margin: 0, color: '#fff', fontSize: '1.6rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <User size={28} color="var(--brand-primary)" /> مهمة الطالب: {selectedStudent.name}
              </h2>
              <p style={{ margin: '5px 0 0 38px', color: 'var(--text-secondary)' }}>الجامعة: {selectedStudent.university} | التخصص: {selectedStudent.major}</p>
            </div>
            <div>
              <button
                onClick={cancelStudentTask}
                className="btn-secondary"
                style={{ color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.3)', background: 'rgba(239, 68, 68, 0.05)' }}
                title="إلغاء حجز هذه المهمة لتعود لقائمة المهام الجديدة"
              >
                <X size={16} /> إلغاء المهمة
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6" style={{ marginBottom: '2rem' }}>
            <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '20px', borderRadius: '16px', border: '1px solid rgba(59, 130, 246, 0.2)', textAlign: 'center' }}>
              <Shield size={40} color="var(--brand-primary)" style={{ margin: '0 auto 10px' }} />
              <h3 style={{ color: '#fff', marginBottom: '10px' }}>البيانات مشفرة ومخفية</h3>
              <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
                لقد تم إخفاء بيانات الدخول للطالب بالكامل لدواعي الأمان. اضغط على الزر أدناه للدخول للمنصة وسيتم الإدخال التلقائي بناءً على إعدادات الأتمتة المسبقة.
              </p>
            </div>
          </div>

          <div style={{ marginBottom: '2.5rem', textAlign: 'center' }}>
            <button
              className="btn-primary"
              style={{ width: '100%', padding: '18px', fontSize: '1.1rem', gap: '10px', borderRadius: '16px', boxShadow: '0 8px 25px rgba(59, 130, 246, 0.25)' }}
              onClick={() => {
                let finalUrl = selectedStudent.platformUrl;
                if (!finalUrl) {
                  // Fallback: look up the student's university in the universities data
                  const studentUniv = universitiesData.find(u => (u.name || '').trim() === (selectedStudent.university || '').trim());
                  finalUrl = (studentUniv && studentUniv.platformUrl) ? studentUniv.platformUrl : assignedUnivPlatformUrl;
                }

                if (!finalUrl) {
                  alert('لا يوجد رابط منصة تعليمية مسجل لهذا الطالب ولا للجامعة.');
                  return;
                }

                // Check if our Chrome Extension is installed
                const isExtensionActive = sessionStorage.getItem('SOLVER_EXTENSION_ACTIVE') === 'true';

                if (isExtensionActive) {
                  const url = finalUrl.startsWith('http') ? finalUrl : `https://${finalUrl}`;
                  const univ = universitiesData.find(u => (u.name || '').trim() === (selectedStudent.university || '').trim()) || {};

                  // Dispatch event to the extension
                  const eventData = {
                    url: url,
                    username: selectedStudent.username,
                    password: selectedStudent.password,
                    userSelector: univ.userSelector,
                    passSelector: univ.passSelector,
                    btnSelector: univ.loginBtnSelector
                  };
                  window.dispatchEvent(new CustomEvent('SOLVER_AUTO_LOGIN_EVENT', { detail: eventData }));
                } else {
                  // Fallback if extension is not installed
                  alert('عذراً، يجب عليك تثبيت "إضافة متصفح كروم الخاصة بالدخول التلقائي" لتتمكن من فتح المنصة. تواصل مع الإدارة للحصول عليها.');
                }
              }}
            >
              <ExternalLink size={22} /> الانتقال للمنصة التعليمية وتسجيل الدخول تلقائياً
            </button>
          </div>

          <div style={{ padding: '2rem', background: 'rgba(0,0,0,0.2)', borderRadius: '20px', border: '1px solid var(--glass-border)' }}>
            <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px', color: '#fff' }}>
              <Shield size={22} color="var(--success)" /> إرسال النتيجة للإدارة
            </h3>

            <form onSubmit={handleSubmit} className="flex-col gap-5">
              <div className="flex-col gap-2">
                <label className="input-label">صورة إثبات الحل (إلزامي)</label>
                <div style={{ position: 'relative' }}>
                  <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} id="proof-upload" />
                  <label htmlFor="proof-upload" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '2.5rem', background: submissionData.proofImage ? 'rgba(16,185,129,0.05)' : 'rgba(255,255,255,0.02)', border: '2px dashed', borderColor: submissionData.proofImage ? 'var(--success)' : 'var(--glass-border)', borderRadius: '16px', cursor: 'pointer', transition: 'all 0.3s ease' }}>
                    {submissionData.proofImage ? (
                      <>
                        <img src={submissionData.proofImage} alt="Preview" style={{ maxHeight: '180px', borderRadius: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.2)' }} />
                        <span style={{ color: 'var(--success)', fontSize: '0.95rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}><CheckCircle size={16} /> تم إرفاق الصورة بنجاح (اضغط للتغيير)</span>
                      </>
                    ) : (
                      <>
                        <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <ImagePlus size={30} color="var(--text-secondary)" />
                        </div>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>اضغط هنا لاختيار صورة النتيجة</span>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', opacity: 0.7 }}>الحد الأقصى للحجم 2MB</span>
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
                  onChange={e => setSubmissionData({ ...submissionData, notes: e.target.value })}
                  style={{ borderRadius: '12px', resize: 'vertical' }}
                ></textarea>
              </div>

              <button type="submit" className="btn-primary" disabled={isSubmitting} style={{ marginTop: '1rem', padding: '16px', fontSize: '1.1rem', background: 'linear-gradient(45deg, #10b981, #059669)', boxShadow: '0 8px 25px rgba(16, 185, 129, 0.3)', borderRadius: '16px' }}>
                {isSubmitting ? 'جاري الإرسال...' : <><Send size={20} /> تأكيد وإرسال للإدارة</>}
              </button>
            </form>
          </div>

        </div>
      )}

      {/* Old modal removed */}
    </div>
  );
}
