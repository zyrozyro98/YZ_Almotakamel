import React, { useState, useRef } from 'react';
import { ImagePlus, Play, Pause, RotateCcw, AlertTriangle, Send, RefreshCw, User, Trash2 } from 'lucide-react';
import { usePhotoSender } from '../context/PhotoSenderContext';

export default function PhotoSender() {
  const {
    filesQueue, currentIndex, isRunning, isPaused, stats,
    senderId, setSenderId,
    messageTemplate, setMessageTemplate,
    isAdmin, employees, goldenKey,
    handleStart, handlePause, handleResume, handleStop, clearQueue,
    addFilesToQueue, removeFileFromQueue, addBroadcastToQueue
  } = usePhotoSender();

  const [uploadMode, setUploadMode] = useState('folder'); // 'folder' or 'broadcast'
  const [manualNumbers, setManualNumbers] = useState('');
  const [broadcastImage, setBroadcastImage] = useState(null);

  const fileInputRef = useRef(null);

  const handleFolderSelection = (e) => {
    const rawFiles = Array.from(e.target.files || []);
    const validImages = rawFiles.filter(f => f.type.startsWith('image/'));
    
    if (validImages.length === 0) {
      alert('لم يتم العثور على أي صور في هذا المجلد.');
      return;
    }

    // Convert to queue format with preview
    const newQueue = validImages.map(file => ({
      file,
      name: file.name,
      preview: URL.createObjectURL(file), // Generate preview explicitly
      status: 'pending',
      error: null
    }));

    // If queue is empty, replace, otherwise append
    if (filesQueue.length === 0) clearQueue(); 
    addFilesToQueue(newQueue);
  };

  const handleReset = () => {
    if (window.confirm('هل أنت متأكد من إلغاء العملية بالكامل وتفريغ المجلد من الذاكرة؟')) {
      clearQueue();
    }
  };

  // Helper stats deriving from the filesQueue precisely
  const totalFiles = filesQueue.length;
  // stats object in context tracks success/failed, but let's calculate fresh from queue
  const successCount = filesQueue.filter(f => f.status === 'success').length;
  const failedCount = filesQueue.filter(f => f.status === 'failed').length;
  const pendingCount = filesQueue.filter(f => f.status === 'pending').length;

  // We don't have checkingAdmin in context explicitly, but if employees array is populated or goldenKey is set, we are ready
  if (goldenKey === null && isAdmin === false) {
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

  // Derive logs from filesQueue state
  // Convert processed ones into log objects
  const derivedLogs = filesQueue
    .map((f, i) => {
      if (f.status === 'success') {
        const targetNumber = f.name.replace(/[^0-9]/g, '');
        return { index: i, type: 'success', num: targetNumber, msg: 'تم الإرسال بنجاح', time: '' };
      } else if (f.status === 'failed') {
        const targetNumber = f.name.replace(/[^0-9]/g, '');
        return { index: i, type: 'error', num: targetNumber, msg: f.error || 'فشل غير معروف', time: '' };
      }
      return null;
    })
    .filter(Boolean)
    .reverse(); // Newest first

  return (
    <div className="animate-fade-in-up" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <h1 style={{ marginBottom: '0.5rem' }}>مرسل الصور الآلي المتقدم (WhatsApp)</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
        تم تفعيل وضع **"الخصوصية والمحاكاة البشرية"**: النظام يستخدم الآن أوقاتاً عشوائية، فترات خمول دورية، وميزة "جاري الكتابة" لضمان أمان حسابك 🛡️.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(350px, 1fr) 2fr', gap: '2rem', flex: 1 }}>
        {/* Settings Panel */}
        <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '4px', marginBottom: '10px' }}>
            <button 
              onClick={() => setUploadMode('folder')}
              style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: uploadMode === 'folder' ? 'var(--brand-primary)' : 'transparent', color: '#fff', fontSize: '0.85rem', fontWeight: 700, transition: '0.3s' }}
            >
              تحميل مجلد كامل
            </button>
            <button 
              onClick={() => setUploadMode('broadcast')}
              style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: uploadMode === 'broadcast' ? 'var(--brand-primary)' : 'transparent', color: '#fff', fontSize: '0.85rem', fontWeight: 700, transition: '0.3s' }}
            >
              إرسال مخصص لأرقام
            </button>
          </div>

          <h3 style={{ marginBottom: '0.5rem', color: 'var(--brand-secondary)', fontSize: '1.1rem' }}>إعدادات الإرسال</h3>

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

          {uploadMode === 'folder' ? (
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
                  background: totalFiles > 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255,255,255,0.02)',
                  borderColor: totalFiles > 0 ? 'var(--success)' : 'var(--glass-border)'
                }}
                onClick={() => { if (!isRunning) fileInputRef.current?.click() }}
              >
                <ImagePlus size={32} color={totalFiles > 0 ? 'var(--success)' : 'var(--text-secondary)'} style={{ margin: '0 auto 1rem' }} />
                {totalFiles > 0 ? (
                  <>
                    <p style={{ color: 'var(--success)', margin: 0, fontWeight: 600 }}>المجلد محفوط في الذاكرة</p>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>المتوفر {totalFiles} صورة.</p>
                  </>
                ) : (
                  <p style={{ margin: 0, color: 'var(--text-secondary)' }}>اضغط لتحديد المجلد من حاسوبك</p>
                )}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <label className="input-label">إدخال أرقام الهواتف (رقم في كل سطر)</label>
                <textarea 
                  className="input-base" 
                  placeholder="077xxxxxxx&#10;96773xxxxxx&#10;05xxxxxxx" 
                  rows={5}
                  value={manualNumbers}
                  onChange={(e) => setManualNumbers(e.target.value)}
                  disabled={isRunning}
                  style={{ fontSize: '0.85rem' }}
                />
              </div>
              <div>
                <label className="input-label">تحديد الصورة المراد إرسالها للجميع</label>
                <input 
                  type="file" 
                  accept="image/*"
                  onChange={(e) => setBroadcastImage(e.target.files[0])}
                  disabled={isRunning}
                  className="input-base"
                  style={{ padding: '8px' }}
                />
                {broadcastImage && (
                  <p style={{ fontSize: '0.75rem', color: 'var(--success)', marginTop: '5px' }}>تم اختيار: {broadcastImage.name}</p>
                )}
              </div>
              <button 
                onClick={() => {
                  if(!manualNumbers || !broadcastImage) return alert('يرجى إدخال الأرقام واختيار الصورة');
                  addBroadcastToQueue(manualNumbers, broadcastImage);
                  setManualNumbers('');
                  setBroadcastImage(null);
                }}
                className="btn-secondary"
                style={{ width: '100%', background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.2)' }}
                disabled={isRunning}
              >
                + إضافة هذه القائمة لجدول الإرسال
              </button>
            </div>
          )}

          <div>
            <label className="input-label">رسالة المتابعة (يدعم {`{أهلاً|مرحباً}`})</label>
            <textarea 
              className="input-base" rows="4" value={messageTemplate}
              placeholder="مثال: {مرحباً|أهلاً} بك، نرفق لك صورة الحضور {🌸|✨}"
              onChange={(e) => setMessageTemplate(e.target.value)} disabled={isRunning}
            ></textarea>
          </div>

          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {!isRunning ? (
              <button className="btn-primary" onClick={handleStart} style={{ padding: '1rem', fontSize: '1.1rem' }}>
                <Play size={20} fill="#fff" /> البدء بالإرسال بالخلفية
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
                <button onClick={handleStop} style={{ background: 'rgba(239, 68, 68, 0.2)', color: 'var(--danger)', padding: '0 1.5rem', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="إيقاف كامل">
                  <RotateCcw size={20} />
                </button>
              </div>
            )}
            
            {totalFiles > 0 && !isRunning && (
              <button 
                onClick={handleReset} 
                className="btn-secondary" 
                style={{ background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--danger)' }}
              >
                تفريغ الذاكرة (إلغاء العملية كلياً)
              </button>
            )}
          </div>
        </div>

        {/* Stats & Logs Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
            <div className="glass-panel" style={{ padding: '1.5rem', textAlign: 'center' }}>
               <p style={{ margin: 0, color: 'var(--text-secondary)' }}>الإجمالي</p>
               <h2 style={{ margin: '0.5rem 0 0', color: 'var(--text-primary)' }}>{totalFiles}</h2>
            </div>
            <div className="glass-panel" style={{ padding: '1.5rem', textAlign: 'center' }}>
               <p style={{ margin: 0, color: 'var(--text-secondary)' }}>تم الإرسال</p>
               <h2 style={{ margin: '0.5rem 0 0', color: 'var(--success)' }}>{successCount}</h2>
            </div>
            <div className="glass-panel" style={{ padding: '1.5rem', textAlign: 'center' }}>
               <p style={{ margin: 0, color: 'var(--text-secondary)' }}>فشل</p>
               <h2 style={{ margin: '0.5rem 0 0', color: 'var(--danger)' }}>{failedCount}</h2>
            </div>
            <div className="glass-panel" style={{ padding: '1.5rem', textAlign: 'center' }}>
               <p style={{ margin: 0, color: 'var(--text-secondary)' }}>الانتظار</p>
               <h2 style={{ margin: '0.5rem 0 0', color: 'var(--warning)' }}>{pendingCount}</h2>
            </div>
          </div>

          {totalFiles > 0 && (
            <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>نسبة الإنجاز (يتم الحفظ بالخلفية)</span>
                <span style={{ fontWeight: 'bold', color: 'var(--brand-secondary)' }}>
                  {Math.round(((successCount + failedCount) / totalFiles) * 100)}%
                </span>
              </div>
              <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ 
                  height: '100%', 
                  width: `${((successCount + failedCount) / totalFiles) * 100}%`, 
                  background: 'linear-gradient(90deg, var(--brand-primary), var(--brand-secondary))',
                  transition: 'width 0.3s ease'
                }}></div>
              </div>
            </div>
          )}

          <div className="glass-panel" style={{ flex: 1, padding: '2rem', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ marginBottom: '1.5rem' }}>السجل المعالج</h3>
            <div style={{ flex: 1, overflowY: 'auto' }}>
               {derivedLogs.length > 0 ? derivedLogs.map((log) => (
                 <div key={log.index} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', marginBottom: '0.5rem', background: log.type === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)', borderLeft: `3px solid ${log.type === 'error' ? 'var(--danger)' : 'var(--success)'}` }}>
                    {log.type === 'error' ? <AlertTriangle size={18} color="var(--danger)" /> : <Send size={18} color="var(--success)" />}
                    <div>
                      <p style={{ margin: 0, fontWeight: 600, color: log.type === 'error' ? 'var(--danger)' : 'var(--text-primary)' }}>{log.num}</p>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{log.msg}</p>
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
