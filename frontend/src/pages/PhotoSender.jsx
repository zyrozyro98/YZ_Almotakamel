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
  const [ goldenKey, setGoldenKey ] = useState(null);
  const [ students, setStudents ] = useState([]);

  useEffect(() => {
    // Cache students globally for matching JIDs in PhotoSender
    const unsub = onSnapshot(collection(db, 'students'), (snap) => {
      const sData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setStudents(sData);
    });
    return () => unsub();
  }, []);

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
        setSenderId('auto'); // Default to smart auto-routing
      } else {
        setIsAdmin(false);
        setSenderId('auto');
      }
      setCheckingAdmin(false);
    });
    return () => unsub();
  }, []);
  const [mode, setMode] = useState('folder'); // 'folder' or 'manual'
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [messageTemplate, setMessageTemplate] = useState('مرحباً بك، نرسل لك صورة الحضور الخاصة بك. شكراً لحضورك!');
  const [rawNumbers, setRawNumbers] = useState('');
  const [manualFile, setManualFile] = useState(null);
  
  const [filesQueue, setFilesQueue] = useState([]);
  const [manualQueue, setManualQueue] = useState([]);
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

  const getPureNumber = (raw) => {
    if (!raw) return "";
    // JID System: Extract the identifier part (phone or technical ID) without stripping country codes
    let d = String(raw).split(':')[0].split('@')[0].replace(/[^0-9a-zA-Z]/g, '');
    
    // Auto-prefix local numbers for better matching with student records if they use 9-digit format
    if (/^[7][0-9]{8}$/.test(d)) d = '967' + d;
    else if (/^[5][0-9]{8}$/.test(d)) d = '966' + d;
    else if (/^[9][0-9]{8}$/.test(d)) d = '249' + d;

    return d;
  };

  const parseSpintax = (text) => {
    if (!text) return "";
    return text.replace(/\{([^{}]+)\}/g, (match, options) => {
      const choices = options.split('|');
      return choices[Math.floor(Math.random() * choices.length)];
    });
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
    const activeQueue = mode === 'folder' ? filesQueue : manualQueue;

    while (current < activeQueue.length) {
      if (!isRunningRef.current || isPausedRef.current) return;

      const item = activeQueue[current];
      let targetNumber = '';
      let fileToUpload = null;

      if (mode === 'folder') {
        targetNumber = getPureNumber(item.name);
        fileToUpload = item;
      } else {
        targetNumber = item;
        fileToUpload = manualFile;
      }

      if (!targetNumber || targetNumber.length < 9) {
        setLogs(prev => [{ 
          type: 'error', 
          num: mode === 'folder' ? item.name : targetNumber, 
          msg: 'رقم هاتف غير صالح (يجب أن يكون 9 أرقام على الأقل).', 
          time: new Date().toLocaleTimeString('ar-SA') 
        }, ...prev]);
        setStats(prev => ({ ...prev, failed: prev.failed + 1, pending: prev.pending - 1 }));
      } else {
        try {
          const b64 = fileToUpload ? await getBase64(fileToUpload) : null;
          
          // Apply Spintax and Unique Noise to evade hash-based detection
          let finalMessage = parseSpintax(messageTemplate);
          const noise = " ".repeat(Math.floor(Math.random() * 5)) + (Math.random() > 0.5 ? "\u200B" : "");
          if (finalMessage) finalMessage += noise;

          const student = students.find(s => getPureNumber(s.phone) === targetNumber);
          const studentJid = student?.fullJid || '';

          if (b64) {
             await axios.post(`${BASE_URL}/api/whatsapp/send-image`, {
               employeeId: senderId,
               phoneNumber: targetNumber,
               fullJid: studentJid,
               base64Image: b64,
               caption: finalMessage,
               senderName: auth.currentUser?.displayName || 'المرسل القوي',
               senderId: auth.currentUser?.uid || 'system'
             });
          } else if (finalMessage) {
             await axios.post(`${BASE_URL}/api/whatsapp/send`, {
               employeeId: senderId,
               phoneNumber: targetNumber,
               fullJid: studentJid,
               message: finalMessage,
               senderName: auth.currentUser?.displayName || 'المرسل القوي',
               senderId: auth.currentUser?.uid || 'system'
             });
          }
          
          setLogs(prev => [{ type: 'success', num: targetNumber, msg: 'تم إرسال المحتوى بنجاح', time: new Date().toLocaleTimeString('ar-SA') }, ...prev]);
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

      // --- ADVANCED HUMAN EMULATION (Anti-Ban) ---
      if (current < activeQueue.length && isRunningRef.current && !isPausedRef.current) {
        // 1. Box-Muller transform for Gaussian Distribution
        const gaussianRandom = () => {
          let uOffset = 0, vOffset = 0;
          while(uOffset === 0) uOffset = Math.random();
          while(vOffset === 0) vOffset = Math.random();
          return Math.sqrt(-2.0 * Math.log(uOffset)) * Math.cos(2.0 * Math.PI * vOffset);
        };

        // Base Delay: Mean 5s, Std Dev 2.5s (Minimum 3s to be safe)
        let delay = Math.max(3000, (5000 + gaussianRandom() * 2500));

        // 2. Irregular "Activity Cycles"
        // Every 10 messages, simulate a "Human Rest" period (15-45 seconds)
        if (current % 10 === 0 && current % 50 !== 0) {
          const restPeriod = 15000 + (Math.random() * 30000);
          setLogs(prev => [{ type: 'info', num: 'System', msg: `محاكاة استراحة بشرية لمدة ${Math.round(restPeriod/1000)} ثانية...`, time: new Date().toLocaleTimeString('ar-SA') }, ...prev]);
          await new Promise(r => setTimeout(r, restPeriod));
        } else if (current % 50 === 0) {
          // BATCH REST: Every 50 messages, take a long break (5-8 minutes)
          const longRest = 300000 + (Math.random() * 180000);
          const minutes = Math.round(longRest / 60000);
          setLogs(prev => [{ type: 'info', num: 'System', msg: `إيقاف مؤقت طويل (باتش) لتجنب الحظر: ${minutes} دقائق...`, time: new Date().toLocaleTimeString('ar-SA') }, ...prev]);
          await new Promise(r => setTimeout(r, longRest));
        } else {
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }

    if (current >= filesQueue.length) {
      alert('اكتملت المهمة الجماعية!');
      setIsRunning(false);
      setIsPaused(false);
    }
  };

  const handleStart = () => {
    if (mode === 'folder') {
      if (filesQueue.length === 0) { alert('يجب تحديد المجلد أولاً.'); return; }
    } else {
      const numbers = rawNumbers.split(/[\n,;]/).map(n => getPureNumber(n)).filter(n => n.length >= 9);
      if (numbers.length === 0) { alert('يجب إدخال أرقام صحيحة أولاً.'); return; }
      
      // Sort alphabetically (Ascending) as requested
      const sortedNumbers = [...new Set(numbers)].sort();
      setManualQueue(sortedNumbers);
      setStats({ total: sortedNumbers.length, sent: 0, failed: 0, pending: sortedNumbers.length });
    }

    if (currentIndex >= (mode === 'folder' ? filesQueue.length : manualQueue.length)) { 
      setCurrentIndex(0); 
    }
    
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
      <h1 style={{ marginBottom: '0.5rem' }}>المُرسل الجماعي الذكي (WhatsApp)</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
        أداة احترافية لإرسال صور الحضور أو الرسائل الجماعية لأرقام محددة بضغطة زر.
      </p>

      {/* Mode Switches */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '1.5rem', background: 'rgba(255,255,255,0.03)', padding: '5px', borderRadius: '15px', width: 'fit-content' }}>
        <button 
           onClick={() => !isRunning && setMode('folder')}
           style={{ padding: '10px 20px', borderRadius: '12px', border: 'none', background: mode === 'folder' ? 'var(--brand-primary)' : 'transparent', color: '#fff', cursor: 'pointer', fontWeight: 600, transition: '0.3s' }}
        >
          مجلد صور (أسماء الصور أرقام)
        </button>
        <button 
           onClick={() => !isRunning && setMode('manual')}
           style={{ padding: '10px 20px', borderRadius: '12px', border: 'none', background: mode === 'manual' ? 'var(--brand-primary)' : 'transparent', color: '#fff', cursor: 'pointer', fontWeight: 600, transition: '0.3s' }}
        >
          أرقام محددة (نص / صور)
        </button>
      </div>

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
                <option value="auto">توجيه ذكي تلقائي للموظف المناسب (مستحسن 🌟)</option>
                <option value="emp1">الحساب الافتراضي للموظف (emp1)</option>
                <option value={goldenKey}>المفتاح الذهبي (إرسال من حسابي الشخصي كـ مدير)</option>
                {employees.filter(e => e.id !== 'emp1' && e.id !== goldenKey).map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name} ({emp.id})</option>
                ))}
              </select>
            </div>
          </div>

          {mode === 'folder' ? (
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
          ) : (
            <>
              <div>
                <label className="input-label">أدخل الأرقام (كل رقم في سطر أو مفصول بفواصل)</label>
                <textarea 
                  className="input-base custom-scrollbar" 
                  rows="6" 
                  placeholder="0096650...&#10;96777...&#10;551234567"
                  value={rawNumbers}
                  onChange={(e) => setRawNumbers(e.target.value)}
                  disabled={isRunning}
                  style={{ fontSize: '0.85rem', fontFamily: 'monospace' }}
                ></textarea>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '5px' }}>
                  سيتم تنظيف الأرقام وترتيبها وعمل فلترة للمكرر آلياً.
                </p>
              </div>

              <div>
                <label className="input-label">أرفق صورة واحدة لجميع الأرقام (اختياري)</label>
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={(e) => setManualFile(e.target.files[0])}
                  disabled={isRunning}
                  style={{ color: '#94a3b8', fontSize: '0.8rem' }}
                />
              </div>
            </>
          )}

          <div>
            <label className="input-label">نص الرسالة (دعم Spintax والرموز)</label>
            <textarea 
              className="input-base" rows="4" value={messageTemplate}
              placeholder="مثال: {مرحباً|أهلاً|السلام عليكم} نرسل لكم {الملف|الصورة|البيانات}..."
              onChange={(e) => setMessageTemplate(e.target.value)} disabled={isRunning}
            ></textarea>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '5px' }}>
              استخدم الصيغة <code style={{ color: 'var(--brand-secondary)' }}>{'{option1|option2}'}</code> للتنويع العشوائي للنص.
            </p>
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
