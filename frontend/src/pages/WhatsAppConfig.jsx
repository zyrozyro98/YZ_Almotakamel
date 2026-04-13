import React, { useState, useEffect } from 'react';
import { QrCode, ShieldCheck, RefreshCw, LogOut, CheckCircle, Smartphone, Zap, AlertTriangle, Database } from 'lucide-react';
import axios from 'axios';
import { auth, rtdb, db } from '../firebase';
import { ref, onValue } from 'firebase/database';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';

export default function WhatsAppConfig() {
  const [waStatus, setWaStatus] = useState('checking'); // 'checking', 'connected', 'qr_needed', 'error'
  const [qrCode, setQrCode] = useState(null);
  const [loading, setLoading] = useState(false);
  const [employeeId, setEmployeeId] = useState('emp1');
  const [isAdmin, setIsAdmin] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [targetEmployeeId, setTargetEmployeeId] = useState(null);

  const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

  // 1. GOLDEN KEY: Auth Listener using UID
  useEffect(() => {
    const unsubAuth = auth.onAuthStateChanged(user => {
      if (user) {
        setEmployeeId(user.uid);
        const adminStatus = user.email === 'yazans95@gmail.com' || user.email === 'zyrozyro98@gmail.com';
        setIsAdmin(adminStatus);
        // Only auto-select if NOT admin, admins should select a target
        if (!adminStatus) setTargetEmployeeId(user.uid);
      } else {
        setEmployeeId('emp1');
        setIsAdmin(false);
      }
    });
    return () => unsubAuth();
  }, []);


  // 2. Real-time Status using Golden Key
  useEffect(() => {
    const activeTarget = isAdmin ? targetEmployeeId : employeeId;
    if (!activeTarget || activeTarget === 'emp1') return;

    const statusRef = ref(rtdb, `wa_status/${activeTarget}`);
    const unsub = onValue(statusRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        if (data.isConnected) {
          setWaStatus('connected');
          setQrCode(null);
        } else if (data.qr) {
          setWaStatus('qr_needed');
          setQrCode(data.qr);
        } else {
          setWaStatus('checking');
          setQrCode(null);
        }
      } else {
        setWaStatus('checking');
        setQrCode(null);
      }
    });

    return () => unsub();
  }, [employeeId, targetEmployeeId, isAdmin]);

  // For Admin: Get all employees from Firestore
  useEffect(() => {
    if (!isAdmin) return;
    
    const q = query(collection(db, 'employees'), orderBy('name', 'asc'));
    const unsub = onSnapshot(q, (snapshot) => {
      setEmployees(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [isAdmin]);

  const checkStatus = async () => {
    const activeTarget = isAdmin ? targetEmployeeId : employeeId;
    setLoading(true);
    try {
      const res = await axios.get(`${BASE_URL}/api/whatsapp/status/${activeTarget}`);
      if (res.data.isConnected) {
        setWaStatus('connected');
        setQrCode(null);
      } else if (res.data.qr) {
        setWaStatus('qr_needed');
        setQrCode(res.data.qr);
      }
    } catch (err) {
      console.error('Status check failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const initWhatsApp = async () => {
    const activeTarget = isAdmin ? targetEmployeeId : employeeId;
    setLoading(true);
    setWaStatus('checking');
    try {
      await axios.post(`${BASE_URL}/api/whatsapp/init`, { employeeId: activeTarget });
    } catch (err) {
      console.error('WhatsApp Init Error:', err);
      setWaStatus('error');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    const activeTarget = isAdmin ? targetEmployeeId : employeeId;
    if (!window.confirm('هل أنت متأكد من فصل الجلسة؟')) return;
    setLoading(true);
    try {
      await axios.post(`${BASE_URL}/api/whatsapp/logout`, { employeeId: activeTarget });
      setWaStatus('qr_needed');
      setQrCode(null);
    } catch (err) { console.error('Logout failed:', err); } finally { setLoading(false); }
  };

  const handleSyncAll = async () => {
    if (!window.confirm('سيقوم هذا بتحديث ملخصات كافة الدردشات لزيادة سرعة النظام للجميع. هل تود الاستمرار؟')) return;
    setLoading(true);
    try {
      const activeTarget = isAdmin ? targetEmployeeId : employeeId;
      await axios.post(`${BASE_URL}/api/whatsapp/sync-existing`, { employeeId: activeTarget });
      alert('تمت مزامنة البيانات بنجاح! سيلاحظ الجميع الآن سرعة فورية في تحميل القوائم.');
    } catch (err) { 
      alert('فشل المزامنة: ' + err.message);
    } finally { setLoading(false); }
  };

  if (loading && waStatus === 'checking') {
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
          <p style={{ color: 'rgba(255,255,255,0.6)' }}>هذه الصفحة مخصصة للمسؤولين فقط لإدارة جلسات الربط المركزية.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
        <div>
          <h1 style={{ fontSize: '2.2rem', fontWeight: 900, color: '#fff', margin: 0 }}>إعدادات الربط</h1>
          <p style={{ color: 'rgba(255,255,255,0.4)', margin: '5px 0 0' }}>
            {isAdmin ? 'الإدارة المركزية للجلسات' : `هوية المفتاح الذهبي: ${employeeId}`}
          </p>
        </div>
        <button onClick={checkStatus} disabled={loading} className="btn-secondary">
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} /> تحديث
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '30px' }}>
        <div style={{ gridColumn: 'span 4' }}>
          <div className="glass-panel" style={{ padding: '40px', textAlign: 'center' }}>
            {isAdmin && (
              <div style={{ marginBottom: '30px', textAlign: 'right' }}>
                <label className="input-label" style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ShieldCheck size={16} color="var(--brand-primary)" />
                  الموظف المستهدف للإدارة:
                </label>
                <select 
                  className="input-base" 
                  value={targetEmployeeId || ''} 
                  onChange={(e) => {
                    setTargetEmployeeId(e.target.value);
                    setWaStatus('checking');
                  }}
                  style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', border: '1px solid var(--glass-border)' }}
                >
                  <option value="">-- اختر الموظف --</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name} {emp.id === employeeId ? '(أنا)' : ''}</option>
                  ))}
                </select>
              </div>
            )}
            
            {!targetEmployeeId && isAdmin ? (
              <div style={{ padding: '20px', color: 'rgba(255,255,255,0.2)' }}>
                <AlertTriangle size={40} style={{ marginBottom: '15px', color: 'var(--warning)' }} />
                <p>يرجى اختيار الموظف أولاً للتحكم في جلسته</p>
              </div>
            ) : (
              <>
                <div style={{ width: '80px', height: '80px', borderRadius: '25px', background: waStatus === 'connected' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', color: waStatus === 'connected' ? '#22c55e' : '#666' }}>
                  {waStatus === 'connected' ? <ShieldCheck size={40} /> : <Smartphone size={40} />}
                </div>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fff', marginBottom: '10px' }}>الحالة</h2>
                <div style={{ padding: '6px 20px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 700, marginBottom: '30px', background: waStatus === 'connected' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: waStatus === 'connected' ? '#4ade80' : '#f87171' }}>
                  {waStatus === 'connected' ? 'متصل' : (waStatus === 'checking' ? 'جاري التحقق...' : 'غير متصل')}
                </div>
                <button onClick={initWhatsApp} disabled={loading} className="btn-primary" style={{ width: '100%', padding: '15px' }}>
                  <Zap size={20} /> {waStatus === 'connected' ? 'إعادة ربط الجلسة' : 'ربط جديد وتوليد QR'}
                </button>

                {isAdmin && (
                  <button 
                    onClick={handleSyncAll} 
                    disabled={loading} 
                    className="btn-secondary" 
                    style={{ width: '100%', marginTop: '15px', color: 'var(--brand-primary)', borderColor: 'rgba(59,130,246,0.3)' }}
                  >
                    <Database size={18} /> مزامنة القوائم القديمة
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        <div style={{ gridColumn: 'span 8' }}>
          <div className="glass-panel" style={{ height: '100%', minHeight: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px' }}>
            {waStatus === 'qr_needed' && qrCode ? (
              <div style={{ textAlign: 'center' }}>
                <h3 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff', marginBottom: '20px' }}>امسح الرمز ضوئياً</h3>
                <div style={{ background: '#fff', padding: '15px', borderRadius: '25px', display: 'inline-block', marginBottom: '20px' }}>
                  <img src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(qrCode)}&size=300x300&color=059669`} alt="QR" style={{ width: '220px', height: '220px' }} />
                </div>
              </div>
            ) : waStatus === 'connected' ? (
              <div style={{ textAlign: 'center' }}>
                <CheckCircle size={60} style={{ color: '#22c55e', marginBottom: '20px' }} />
                <h3 style={{ color: '#fff' }}>تم الاتصال!</h3>
                <button onClick={handleLogout} className="btn-secondary" style={{ marginTop: '20px', color: '#f87171' }}>قطع الاتصال</button>
              </div>
            ) : (
              <p style={{ color: 'rgba(255,255,255,0.2)' }}>اضغط "ربط جديد" لتوليد الرمز</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
