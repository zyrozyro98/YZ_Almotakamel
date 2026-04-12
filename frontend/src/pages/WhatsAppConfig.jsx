import React, { useState, useEffect } from 'react';
import { QrCode, ShieldCheck, RefreshCw, LogOut, CheckCircle, Smartphone, Zap, AlertTriangle, ExternalLink } from 'lucide-react';
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
      if (user) {
        setEmployeeId(user.email.split('@')[0].replace(/[^a-zA-Z0-9]/g, ''));
      }
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!employeeId || employeeId === 'emp1') return;

    // Fixed path to match backend: wa_status
    const statusRef = ref(rtdb, `wa_status/${employeeId}`);
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
      console.error('Status check failed:', err);
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
    } catch (err) {
      console.error('WhatsApp Init Error:', err);
      setWaStatus('error');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    if (!window.confirm('هل أنت متأكد من فصل الجلسة؟')) return;
    setLoading(true);
    try {
      await axios.post(`${BASE_URL}/api/whatsapp/logout`, { employeeId });
      setWaStatus('qr_needed');
      setQrCode(null);
    } catch (err) {
      console.error('Logout failed:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
        <div>
          <h1 style={{ fontSize: '2.2rem', fontWeight: 900, color: '#fff', margin: 0 }}>ربط واتساب</h1>
          <p style={{ color: 'rgba(255,255,255,0.4)', margin: '5px 0 0' }}>المعرف النشط: <span style={{ color: 'var(--brand-primary)', fontFamily: 'monospace' }}>{employeeId}</span></p>
        </div>
        <button onClick={checkStatus} disabled={loading} className="btn-secondary" style={{ borderRadius: '15px' }}>
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} /> تحديث الحالة
        </button>
      </div>

      <div className="grid grid-cols-12 gap-8" style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '30px' }}>
        <div style={{ gridColumn: 'span 4' }}>
          <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ 
              width: '100px', height: '100px', borderRadius: '30px', 
              background: waStatus === 'connected' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(255,255,255,0.05)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '25px',
              border: waStatus === 'connected' ? '2px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(255,255,255,0.05)',
              color: waStatus === 'connected' ? '#22c55e' : '#666'
            }}>
              {waStatus === 'connected' ? <ShieldCheck size={50} /> : <Smartphone size={50} />}
            </div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fff', marginBottom: '10px' }}>الحالة</h2>
            <div style={{ 
              padding: '6px 20px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 700, marginBottom: '30px',
              background: waStatus === 'connected' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              color: waStatus === 'connected' ? '#4ade80' : '#f87171'
            }}>
              {waStatus === 'connected' ? 'متصل حالياً' : 'غير متصل'}
            </div>
            
            <button 
              onClick={initWhatsApp} disabled={loading}
              className="btn-primary" style={{ width: '100%', padding: '15px', borderRadius: '18px', gap: '10px' }}
            >
              <Zap size={20} /> بدء ربط جديد
            </button>
          </div>
        </div>

        <div style={{ gridColumn: 'span 8' }}>
          <div className="glass-panel" style={{ height: '100%', minHeight: '450px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px' }}>
            {waStatus === 'qr_needed' && qrCode ? (
              <div style={{ textAlign: 'center' }}>
                <h3 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fff', marginBottom: '30px' }}>امسح الرمز ضوئياً</h3>
                <div style={{ background: '#fff', padding: '20px', borderRadius: '30px', display: 'inline-block', boxShadow: '0 20px 50px rgba(0,0,0,0.3)', marginBottom: '30px' }}>
                  <img src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(qrCode)}&size=300x300&color=059669`} alt="QR" style={{ width: '250px', height: '250px' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px' }}>
                  {['افتح واتساب', 'الأجهزة المرتبطة', 'مسح الرمز'].map((step, i) => (
                    <div key={i} style={{ background: 'rgba(255,255,255,0.05)', padding: '15px', borderRadius: '15px', fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>
                      <span style={{ color: 'var(--brand-primary)', fontWeight: 900, fontSize: '1.1rem', display: 'block' }}>0{i+1}</span>
                      {step}
                    </div>
                  ))}
                </div>
              </div>
            ) : waStatus === 'connected' ? (
              <div style={{ textAlign: 'center' }}>
                <CheckCircle size={80} style={{ color: '#22c55e', marginBottom: '20px' }} />
                <h3 style={{ fontSize: '2rem', fontWeight: 900, color: '#fff', marginBottom: '10px' }}>تم الاتصال بنجاح</h3>
                <p style={{ color: 'rgba(255,255,255,0.4)', marginBottom: '30px' }}>نظامك الآن مرتبط بواتساب الموظف النشط.</p>
                <button onClick={handleLogout} className="btn-secondary" style={{ borderColor: 'rgba(239, 68, 68, 0.3)', color: '#f87171' }}>قطع الاتصال</button>
              </div>
            ) : (
              <div style={{ textAlign: 'center', opacity: 0.3 }}>
                <QrCode size={100} style={{ color: '#fff', marginBottom: '20px' }} />
                <p style={{ color: '#fff' }}>في انتظار بدء الجلسة...</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
