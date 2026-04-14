import React, { useState, useRef, useEffect } from 'react';
import { ImagePlus, Play, Pause, RotateCcw, AlertTriangle, Send, RefreshCw, User } from 'lucide-react';
import axios from 'axios';
import { db, auth } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, onSnapshot } from 'firebase/firestore';

export default function PhotoSender() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [employees, setEmployees] = useState([]);
  const [senderId, setSenderId] = useState('emp1');
  const [goldenKey, setGoldenKey] = useState(null);

  useEffect(() => {
    if (isAdmin) {
      const unsub = onSnapshot(collection(db, 'employees'), (snap) => {
        const emps = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setEmployees(emps);
      });
      return () => unsub();
    }
  }, [isAdmin]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      if (user) {
        const adminStatus = user.email === 'yazans95@gmail.com' || user.email === 'zyrozyro98@gmail.com';
        setIsAdmin(adminStatus);
        setGoldenKey(user.uid);
        setSenderId(user.uid); // Default to the Golden Key
      } else {
        setIsAdmin(false);
        setSenderId('emp1');
      }
      setCheckingAdmin(false);
    });
    return () => unsub();
  }, []);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [messageTemplate, setMessageTemplate] = useState('مرحباً بك، نرسل لك صورة الحضور الخاصة بك. شكراً لحضورك!');
  
  const [filesQueue, setFilesQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [logs, setLogs] = useState([]);
  
  // Real stats
  const [stats, setStats] = useState({ total: 0, sent: 0, failed: 0, pending: 0 });
  const fileInputRef = useRef(null);

  // When paused or unpaused, a ref helps async loops know to stop immediately
  const isRunningRef = useRef(false);
  const isPausedRef = useRef(false);

  useEffect(() => {
    isRunningRef.current = isRunning;
    isPausedRef.current = isPaused;
  }, [isRunning, isPaused]);

  const handleFolderSelection = (e) => {
    const rawFiles = Array.from(e.target.files || []);
    const validImages = rawFiles.filter(f => f.type.startsWith('image/'));
    
    if (validImages.length === 0) {
      alert('لم يتم العثور على أي صور في هذا المجلد.');
      return;
    }

    setFilesQueue(validImages);
    setStats({ total: validImages.length, sent: 0, failed: 0, pending: validImages.length });
    setCurrentIndex(0);
    setLogs([]);
    setIsRunning(false);
    setIsPaused(false);
  };

  const getBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = error => reject(error);
    });
  };

  const processQueue = async (startIndex) => {
    let current = startIndex;
    const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

    while (current < filesQueue.length) {
      if (!isRunningRef.current || isPausedRef.current) return;

      const file = filesQueue[current];
      // File name normally matches "050123... .jpg" - extract numbers only
      let targetNumber = file.name.replace(/[^0-9]/g, '');
      if (targetNumber.length >= 9) {
        targetNumber = targetNumber.slice(-9); // Use last 9 digits
      }

      if (!targetNumber || targetNumber.length < 9) {
        setLogs(prev => [{ type: 'error', num: file.name, msg: 'اسم الملف لا يحتوي على رقم هاتف صالح (على الأقل 9 أرقام).', time: new Date().toLocaleTimeString('ar-SA') }, ...prev]);
        setStats(prev => ({ ...prev, failed: prev.failed + 1, pending: prev.pending - 1 }));
      } else {
        try {
          const b64 = await getBase64(file);
          await axios.post(`${BASE_URL}/api/whatsapp/send-image`, {
            employeeId: senderId,
            phoneNumber: targetNumber,
            base64Image: b64,
            caption: messageTemplate,
            senderName: auth.currentUser?.displayName || 'المرسل الآلي',
            senderId: auth.currentUser?.uid || 'system'
          });
          
          setLogs(prev => [{ type: 'success', num: targetNumber, msg: 'تم إرسال الصورة والرسالة بنجاح', time: new Date().toLocaleTimeString('ar-SA') }, ...prev]);
          setStats(prev => ({ ...prev, sent: prev.sent + 1, pending: prev.pending - 1 }));
        } catch (err) {
          console.error(err);
          const errorMsg = err.response?.data?.error || err.message || 'فشل غير معروف';
          setLogs(prev => [{ type: 'error', num: targetNumber, msg: `فشل الإرسال (${errorMsg})`, time: new Date().toLocaleTimeString('ar-SA') }, ...prev]);
          setStats(prev => ({ ...prev, failed: prev.failed + 1, pending: prev.pending - 1 }));
        }
      }

      current++;
      setCurrentIndex(current);

      // Delay to avoid WhatsApp Anti-Spam Ban (Wait 3 seconds)
      if (current < filesQueue.length && isRunningRef.current && !isPausedRef.current) {
        await new Promise(r => setTimeout(r, 3000));
      }
    }

    if (current >= filesQueue.length) {
      alert('اكتملت المهمة الجماعية!');
      setIsRunning(false);
      setIsPaused(false);
    }
  };

  const handleStart = () => {
    if (filesQueue.length === 0) { alert('يجب إضافة المجلد أولاً.'); return; }
    if (currentIndex >= filesQueue.length) { alert('المهمة مكتملة، استخدم زر إعادة التهيئة للبدء من جديد.'); return; }
    
    setIsRunning(true);
    setIsPaused(false);
    isRunningRef.current = true;
    isPausedRef.current = false;
    processQueue(currentIndex);
  };

  const handlePause = () => {
    setIsPaused(true);
    isPausedRef.current = true;
  };

  const handleResume = () => {
    setIsPaused(false);
    isPausedRef.current = false;
    processQueue(currentIndex);
  };

  const handleReset = () => {
    if (window.confirm('هل أنت متأكد من تصفير وإلغاء العملية بالكامل؟')) {
      setIsRunning(false);
      setIsPaused(false);
      isRunningRef.current = false;
      isPausedRef.current = false;
      setFilesQueue([]);
      setLogs([]);
      setCurrentIndex(0);
      setStats({ total: 0, sent: 0, failed: 0, pending: 0 });
    }
  };

  if (checkingAdmin) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#fff' }}>
        <RefreshCw size={40} className="animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '40px', borderRadius: '24px', maxWidth: '500px', margin: '0 auto', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
          <AlertTriangle size={60} color="var(--danger)" style={{ marginBottom: '20px' }} />
          <h2 style={{ color: '#fff', marginBottom: '10px' }}>عذراً، غير مسموح بالدخول</h2>
          <p style={{ color: 'rgba(255,255,255,0.6)' }}>هذه الأداة مخصصة للمسؤولين فقط لإرسال صور الحضور الجماعية.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <h1 style={{ marginBottom: '0.5rem' }}>مرسل الصور الآلي المتقدم (WhatsApp)</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
        تحديد مجلد الصور (أسماء الصور تطابق رقم هاتف المتدرب) لإرسالها آلياً لكل رقم باستخدام حساب الإدارة.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(350px, 1fr) 2fr', gap: '2rem', flex: 1 }}>
        <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <h3 style={{ marginBottom: '1rem', color: 'var(--brand-secondary)' }}>إعدادات الإرسال</h3>

          <div>
            <label className="input-label">حساب المرسل (الموظف)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ background: 'rgba(59,130,246,0.1)', padding: '10px', borderRadius: '10px' }}>
                <User size={20} color="#3b82f6" />
              </div>
              <select 
                className="input-base" 
                value={senderId} 
                onChange={(e) => setSenderId(e.target.value)}
                disabled={isRunning}
                style={{ flex: 1 }}
              >
                <option value={goldenKey}>المفتاح الذهبي (إرسال من حسابي)</option>
                <option value="emp1">الحساب الافتراضي (emp1)</option>
                {employees.filter(e => e.id !== 'emp1' && e.id !== goldenKey).map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name} ({emp.id})</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="input-label">تحديد مجلد الصور محلياً</label>
            <input 
               type="file" 
               ref={fileInputRef} 
               style={{ display: 'none' }} 
               webkitdirectory="true" 
               directory="true" 
               multiple 
               onChange={handleFolderSelection} 
            />
            <div 
              style={{ 
                border: '2px dashed var(--glass-border)', padding: '2rem', borderRadius: '12px',
                textAlign: 'center', cursor: 'pointer',
                background: filesQueue.length > 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255,255,255,0.02)',
                borderColor: filesQueue.length > 0 ? 'var(--success)' : 'var(--glass-border)'
              }}
              onClick={() => { if (!isRunning) fileInputRef.current?.click() }}
            >
              <ImagePlus size={32} color={filesQueue.length > 0 ? 'var(--success)' : 'var(--text-secondary)'} style={{ margin: '0 auto 1rem' }} />
              {filesQueue.length > 0 ? (
                <>
                  <p style={{ color: 'var(--success)', margin: 0, fontWeight: 600 }}>تم تحديد المجلد بنجاح</p>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>عُثر على {filesQueue.length} صورة.</p>
                </>
              ) : (
                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>اضغط لتحديد المجلد من حاسوبك</p>
              )}
            </div>
          </div>

          <div>
            <label className="input-label">رسالة المتابعة (ترسل أسفل الصورة كـ Caption)</label>
            <textarea 
              className="input-base" rows="4" value={messageTemplate}
              onChange={(e) => setMessageTemplate(e.target.value)} disabled={isRunning}
            ></textarea>
          </div>

          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {!isRunning ? (
              <button className="btn-primary" onClick={handleStart} style={{ padding: '1rem', fontSize: '1.1rem' }}>
                <Play size={20} fill="#fff" /> البدء بالإرسال المباشر
              </button>
            ) : (
              <div style={{ display: 'flex', gap: '1rem' }}>
                {isPaused ? (
                  <button className="btn-primary" onClick={handleResume} style={{ flex: 1, background: 'linear-gradient(135deg, var(--success), #059669)' }}>
                    <Play size={20} fill="#fff" /> استئناف
                  </button>
                ) : (
                  <button className="btn-primary" onClick={handlePause} style={{ flex: 1, background: 'linear-gradient(135deg, var(--warning), #d97706)' }}>
                    <Pause size={20} fill="#fff" /> إيقاف مؤقت
                  </button>
                )}
                <button onClick={handleReset} style={{ background: 'rgba(239, 68, 68, 0.2)', color: 'var(--danger)', padding: '0 1.5rem', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <RotateCcw size={20} />
                </button>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
            <div className="glass-panel" style={{ padding: '1.5rem', textAlign: 'center' }}>
               <p style={{ margin: 0, color: 'var(--text-secondary)' }}>الإجمالي</p>
               <h2 style={{ margin: '0.5rem 0 0', color: 'var(--text-primary)' }}>{stats.total}</h2>
            </div>
            <div className="glass-panel" style={{ padding: '1.5rem', textAlign: 'center' }}>
               <p style={{ margin: 0, color: 'var(--text-secondary)' }}>تم الإرسال</p>
               <h2 style={{ margin: '0.5rem 0 0', color: 'var(--success)' }}>{stats.sent}</h2>
            </div>
            <div className="glass-panel" style={{ padding: '1.5rem', textAlign: 'center' }}>
               <p style={{ margin: 0, color: 'var(--text-secondary)' }}>فشل</p>
               <h2 style={{ margin: '0.5rem 0 0', color: 'var(--danger)' }}>{stats.failed}</h2>
            </div>
            <div className="glass-panel" style={{ padding: '1.5rem', textAlign: 'center' }}>
               <p style={{ margin: 0, color: 'var(--text-secondary)' }}>الانتظار</p>
               <h2 style={{ margin: '0.5rem 0 0', color: 'var(--warning)' }}>{stats.pending}</h2>
            </div>
          </div>

          {stats.total > 0 && (
            <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>نسبة الإنجاز</span>
                <span style={{ fontWeight: 'bold', color: 'var(--brand-secondary)' }}>
                  {Math.round(((stats.sent + stats.failed) / stats.total) * 100)}%
                </span>
              </div>
              <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ 
                  height: '100%', 
                  width: `${((stats.sent + stats.failed) / stats.total) * 100}%`, 
                  background: 'linear-gradient(90deg, var(--brand-primary), var(--brand-secondary))',
                  transition: 'width 0.3s ease'
                }}></div>
              </div>
            </div>
          )}

          <div className="glass-panel" style={{ flex: 1, padding: '2rem', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ marginBottom: '1.5rem' }}>السجل الحي للعمليات</h3>
            <div style={{ flex: 1, overflowY: 'auto' }}>
               {logs.length > 0 ? logs.map((log, i) => (
                 <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', marginBottom: '0.5rem', background: log.type === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)', borderLeft: `3px solid ${log.type === 'error' ? 'var(--danger)' : 'var(--success)'}` }}>
                    {log.type === 'error' ? <AlertTriangle size={18} color="var(--danger)" /> : <Send size={18} color="var(--success)" />}
                    <div>
                      <p style={{ margin: 0, fontWeight: 600, color: log.type === 'error' ? 'var(--danger)' : 'var(--text-primary)' }}>{log.num}</p>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{log.time} - {log.msg}</p>
                    </div>
                 </div>
               )) : (
                 <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', flexDirection: 'column' }}>
                   <Send size={40} opacity={0.3} style={{ marginBottom: '1rem' }} />
                   <p>لم تبدأ أي عملية إرسال فعلية حتى الآن</p>
                 </div>
               )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
