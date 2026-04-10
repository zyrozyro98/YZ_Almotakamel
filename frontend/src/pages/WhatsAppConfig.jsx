import React, { useState, useEffect } from 'react';
import { QrCode, ShieldCheck, RefreshCw, LogOut, CheckCircle, Smartphone, Zap, AlertTriangle } from 'lucide-react';
import axios from 'axios';
import { auth } from '../firebase';

export default function WhatsAppConfig() {
  const [waStatus, setWaStatus] = useState('checking'); // 'checking', 'connected', 'qr_needed', 'error'
  const [qrCode, setQrCode] = useState(null);
  const [loading, setLoading] = useState(false);
  const employeeId = auth.currentUser?.email?.split('@')[0].replace(/[^a-zA-Z0-9]/g, '') || 'emp1';
  const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

  useEffect(() => {
    checkStatus();
    
    // Auto-poll status if not connected to detect QR scan automatically
    const interval = setInterval(() => {
      if (waStatus !== 'connected') {
        checkStatus();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [employeeId, waStatus]);

  const checkStatus = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${BASE_URL}/api/whatsapp/status/${employeeId}`);
      if (res.data.isConnected) {
        setWaStatus('connected');
      } else {
        setWaStatus('qr_needed');
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
      const res = await axios.post(`${BASE_URL}/api/whatsapp/init`, { employeeId });
      if (res.data.status === 'qr_generated') {
        setQrCode(res.data.qr);
        setWaStatus('qr_needed');
      } else if (res.data.status === 'connected') {
        setWaStatus('connected');
      }
    } catch (err) {
      console.error('WhatsApp Init Error:', err);
      setWaStatus('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-fade-in-up">
      <div className="flex justify-between items-center responsive-flex" style={{ marginBottom: '2.5rem' }}>
        <div>
          <h1 style={{ marginBottom: '0.25rem' }}>إعدادات ربط الواتساب</h1>
          <p style={{ color: 'var(--text-secondary)' }}>توليد وإدارة جلسة واتساب لربطها بالنظام الموحد</p>
        </div>
        <button 
          className="btn-secondary" 
          onClick={checkStatus} 
          disabled={loading}
          style={{ padding: '0.75rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} /> تحديث الحالة
        </button>
      </div>

      <div className="grid grid-cols-3 sm-grid-cols-1 gap-6">
        {/* Status Card */}
        <div className="glass-panel" style={{ gridColumn: 'span 2', padding: '2.5rem' }}>
          <div className="flex items-center gap-4" style={{ marginBottom: '2rem' }}>
            <div style={{ 
              width: '56px', height: '56px', borderRadius: '16px', 
              background: waStatus === 'connected' ? 'var(--success)' : (waStatus === 'qr_needed' ? 'var(--warning)' : 'rgba(255,255,255,0.05)'),
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' 
            }}>
              {waStatus === 'connected' ? <CheckCircle size={32} /> : (waStatus === 'qr_needed' ? <Smartphone size={32} /> : <Zap size={32} />)}
            </div>
            <div>
              <h2 style={{ margin: 0 }}>حالة الجلسة الحالية</h2>
              <p style={{ margin: 0, color: waStatus === 'connected' ? 'var(--success)' : 'var(--text-secondary)', fontWeight: 700 }}>
                {waStatus === 'connected' ? 'واتساب متصل ويعمل بكفاءة' : (waStatus === 'qr_needed' ? 'في انتظار ربط الجهاز' : 'جاري التحقق...')}
              </p>
            </div>
          </div>

          <div style={{ background: 'rgba(0,0,0,0.1)', padding: '1.5rem', borderRadius: '20px', marginBottom: '2rem' }}>
            <h4 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ShieldCheck size={18} color="var(--brand-secondary)" /> معلومات الخادم
            </h4>
            <div className="flex justify-between" style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>هوية الموظف:</span>
              <span style={{ fontWeight: 700 }}>{employeeId}</span>
            </div>
            <div className="flex justify-between" style={{ fontSize: '0.9rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>عنوان الربط:</span>
              <span style={{ fontWeight: 700 }}>{BASE_URL}</span>
            </div>
          </div>

          <div className="flex gap-4">
            {waStatus !== 'connected' && (
              <button 
                className="btn-primary" 
                onClick={initWhatsApp} 
                disabled={loading}
                style={{ padding: '1rem 2rem', flex: 1 }}
              >
                <Zap size={20} /> توليد رمز QR جديد
              </button>
            )}
            {waStatus === 'connected' && (
              <button 
                className="btn-secondary" 
                style={{ flex: 1, color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.2)' }}
                onClick={() => alert('ميزة إلغاء الربط قيد التطوير')}
              >
                <LogOut size={20} /> إلغاء ربط الحساب
              </button>
            )}
          </div>
        </div>

        {/* QR Code Card */}
        <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          {waStatus === 'connected' ? (
            <div className="animate-fade-in-up">
              <div style={{ padding: '2rem', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '50%', width: 'fit-content', margin: '0 auto 1.5rem' }}>
                 <CheckCircle size={80} color="var(--success)" />
              </div>
              <h3>النظام مرتبط بنجاح</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>يمكنك الآن إرسال واستقبال الرسائل عبر لوحة الدردشة الموحدة.</p>
            </div>
          ) : qrCode && waStatus === 'qr_needed' ? (
            <div className="animate-fade-in-up">
              <h3 style={{ margin: '0 0 1.5rem' }}>امسح الرمز للربط</h3>
              <div style={{ background: '#fff', padding: '1rem', borderRadius: '15px', display: 'inline-block', boxShadow: '0 10px 30px rgba(0,0,0,0.3)' }}>
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(qrCode)}&size=200x200`} 
                  alt="QR Code" 
                  style={{ display: 'block' }}
                />
              </div>
              <div className="flex-col gap-2" style={{ marginTop: '1.5rem', textAlign: 'right', background: 'rgba(0,0,0,0.1)', padding: '1rem', borderRadius: '12px', fontSize: '0.85rem' }}>
                <p style={{ margin: 0 }}>1. افتح واتساب على هاتفك</p>
                <p style={{ margin: 0 }}>2. الأجهزة المرتبطة &gt; ربط جهاز</p>
                <p style={{ margin: 0 }}>3. وجه الكاميرا لهذا الرمز</p>
              </div>
            </div>
          ) : (
            <div>
              <QrCode size={100} style={{ opacity: 0.1, marginBottom: '1.5rem' }} />
              <p style={{ color: 'var(--text-secondary)' }}>اضغط على "توليد رمز QR" للبدء بالربط</p>
            </div>
          )}
        </div>
      </div>

      <div className="glass-panel" style={{ marginTop: '2rem', padding: '2rem' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <AlertTriangle size={24} color="var(--warning)" /> ملاحظات هامة
        </h3>
        <ul className="flex-col gap-3" style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.6 }}>
          <li>يجب إبقاء الهاتف متصلاً بالإنترنت أثناء عملية الربط الأولى.</li>
          <li>النظام يدعم تعدد الموظفين، كل موظف يربط حسابه الخاص بشكل منفصل.</li>
          <li>في حال واجهت مشاكل في الإرسال، جرب فصل الجهاز من تطبيق الواتساب وإعادة الربط هنا.</li>
        </ul>
      </div>
    </div>
  );
}
