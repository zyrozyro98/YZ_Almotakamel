import React, { useState, useEffect } from 'react';
import { QrCode, ShieldCheck, RefreshCw, LogOut, CheckCircle, Smartphone, Zap, AlertTriangle } from 'lucide-react';
import axios from 'axios';
import { auth, rtdb } from '../firebase';
import { ref, onValue } from 'firebase/database';

export default function WhatsAppConfig() {
  const [waStatus, setWaStatus] = useState('checking'); // 'checking', 'connected', 'qr_needed', 'error'
  const [qrCode, setQrCode] = useState(null);
  const [loading, setLoading] = useState(false);
  const [employeeId, setEmployeeId] = useState('emp1');
  const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

  useEffect(() => {
    const unsubAuth = auth.onAuthStateChanged(user => {
      if (user) setEmployeeId(user.email.split('@')[0].replace(/[^a-zA-Z0-9]/g, ''));
    });
    return () => unsubAuth();
  }, []);

  // Listen for STATUS and QR
  useEffect(() => {
    if (!employeeId || employeeId === 'emp1') return;
    
    // We listen to the most stable path
    const statusRef = ref(rtdb, `whatsapp/${employeeId}`);
    const unsub = onValue(statusRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        if (data.isConnected) {
          setWaStatus('connected');
          setQrCode(null);
        } else if (data.qr) {
          setWaStatus('qr_needed');
          setQrCode(data.qr);
        }
      }
    });

    return () => unsub();
  }, [employeeId]);

  const checkStatus = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${BASE_URL}/api/whatsapp/status/${employeeId}`);
      if (res.data.isConnected) {
        setWaStatus('connected');
        setQrCode(null);
      } else if (res.data.qr) {
        setWaStatus('qr_needed');
        setQrCode(res.data.qr);
      }
    } catch (err) {
      console.error(err);
      setWaStatus('error');
    } finally {
      setLoading(false);
    }
  };

  const initWhatsApp = async () => {
    setLoading(true);
    setWaStatus('checking');
    try {
      await axios.post(`${BASE_URL}/api/whatsapp/init`, { employeeId });
      // Logic continues via RTDB listener
    } catch (err) {
      setWaStatus('error');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    if (!window.confirm('فصل الواتساب؟')) return;
    setLoading(true);
    try {
      await axios.post(`${BASE_URL}/api/whatsapp/logout`, { employeeId });
      setWaStatus('qr_needed');
      setQrCode(null);
    } catch (err) {
      alert('خطأ في الفصل');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '30px' }}>
        <h1 style={{ color: '#fff', fontSize: '2rem' }}>إعدادات الواتساب</h1>
        <button onClick={checkStatus} className="btn-secondary" style={{ borderRadius: '10px' }}>
           <RefreshCw size={18} className={loading ? 'animate-spin' : ''} /> تحديث الحالة
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '30px' }}>
        <div className="glass-panel" style={{ padding: '30px', textAlign: 'center' }}>
          <div style={{ width: '80px', height: '80px', background: waStatus === 'connected' ? '#10b981' : '#334155', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
             {waStatus === 'connected' ? <ShieldCheck size={40} color="#fff" /> : <Smartphone size={40} color="#fff" />}
          </div>
          <h3 style={{ color: '#fff' }}>الحالة: {waStatus === 'connected' ? 'متصل' : 'غير متصل'}</h3>
          <p style={{ fontSize: '0.8rem', opacity: 0.5, marginBottom: '20px' }}>الموظف: {employeeId}</p>
          
          <button onClick={initWhatsApp} className="btn-primary" style={{ width: '100%', padding: '15px' }} disabled={loading}>
             {loading ? 'انتظر...' : (waStatus === 'connected' ? 'إعادة ربط' : 'بدء الربط')}
          </button>
          
          {waStatus === 'connected' && (
            <button onClick={handleLogout} style={{ marginTop: '15px', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>فصل الحساب</button>
          )}
        </div>

        <div className="glass-panel" style={{ padding: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}>
           {qrCode && waStatus !== 'connected' ? (
             <div style={{ textAlign: 'center' }}>
                <h2 style={{ color: '#fff', marginBottom: '20px' }}>امسح الرمز ضوئياً</h2>
                <div style={{ background: '#fff', padding: '15px', borderRadius: '20px', display: 'inline-block' }}>
                   <img src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(qrCode)}&size=250x250`} alt="QR" />
                </div>
                <div style={{ marginTop: '20px', color: '#10b981', fontWeight: 'bold', fontSize: '0.9rem' }}>باقي 20 ثانية قبل تجديد الرمز</div>
             </div>
           ) : waStatus === 'connected' ? (
             <div style={{ textAlign: 'center' }}>
                <CheckCircle size={80} color="#10b981" />
                <h2 style={{ color: '#fff', marginTop: '20px' }}>أنت متصل بالكامل!</h2>
                <p style={{ opacity: 0.4 }}>يمكنك الآن إرسال واستقبال الرسائل.</p>
             </div>
           ) : (
             <div style={{ opacity: 0.2, textAlign: 'center' }}>
                <QrCode size={100} />
                <p>اضغط "بدء الربط" لتوليد رمز الاستجابة</p>
             </div>
           )}
        </div>
      </div>
    </div>
  );
}
