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
      if (user) {
        setEmployeeId(user.email.split('@')[0].replace(/[^a-zA-Z0-9]/g, ''));
      } else {
        setEmployeeId('emp1');
      }
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    // 1. Initial manual status check
    if (!employeeId || employeeId === 'emp1') return;

    const statusRef = ref(rtdb, `status/${employeeId}`);
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
    }, (error) => {
      console.error(`[WA] RTDB Listener Error for ${employeeId}:`, error);
    });

    return () => unsub();
  }, [employeeId]);

  useEffect(() => {
    // 1. Initial manual status check
    if (employeeId) checkStatus();
    
    // 3. Fallback polling every 10 seconds just in case listener fails
    const interval = setInterval(() => {
      if (waStatus !== 'connected' && !qrCode) {
        checkStatus();
      }
    }, 10000);

    return () => {
      clearInterval(interval);
    };
  }, [employeeId, waStatus, qrCode]);

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
      } else if (waStatus !== 'qr_needed') {
        // Only reset if we are not already waiting for a scan
        setWaStatus('qr_needed');
      }
    } catch (err) {
      console.error('Status check failed:', err);
      setWaStatus('error');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    if (!window.confirm('هل أنت متأكد من رغبتك في فصل الواتساب ومسح بيانات الجلسة؟')) return;
    setLoading(true);
    try {
      await axios.post(`${BASE_URL}/api/whatsapp/logout`, { employeeId });
      setWaStatus('qr_needed');
      setQrCode(null);
      alert('تم فصل الحساب ومسح الجلسة بنجاح.');
    } catch (err) {
      console.error('Logout failed:', err);
      alert('فشل في تسجيل الخروج');
    } finally {
      setLoading(false);
    }
  };

  const initWhatsApp = async () => {
    setLoading(true);
    setWaStatus('checking');
    try {
      const res = await axios.post(`${BASE_URL}/api/whatsapp/init`, { employeeId });
      // The status will be updated via RTDB listener
      if (res.data.status === 'initializing') {
        console.log('Session initialization started...');
      }
    } catch (err) {
      console.error('WhatsApp Init Error:', err);
      setWaStatus('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="flex justify-between items-center mb-10">
        <div>
          <h1 className="text-3xl font-extrabold text-white mb-2">ربط واتساب المتكامل</h1>
          <p className="text-gray-400">المعرف النشط: <span className="text-brand-primary font-mono">{employeeId}</span></p>
        </div>
        <button 
          onClick={checkStatus} 
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white transition-all"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} /> تحديث
        </button>
      </div>

      <div className="grid grid-cols-12 gap-8">
        {/* Status Section */}
        <div className="col-span-12 lg:col-span-4 space-y-6">
          <div className="glass-panel p-8 text-center flex flex-col items-center">
            <div className={`w-24 h-24 rounded-3xl flex items-center justify-center mb-6 transition-all duration-500 ${
              waStatus === 'connected' ? 'bg-green-500 shadow-[0_0_30px_rgba(34,197,94,0.4)]' : 'bg-white/5'
            }`}>
              {waStatus === 'connected' ? <ShieldCheck size={48} color="#fff" /> : <Smartphone size={48} color="#666" />}
            </div>
            
            <h2 className="text-xl font-bold text-white mb-2">حالة الاتصال</h2>
            <p className={`text-sm font-medium px-4 py-1.5 rounded-full mb-8 ${
              waStatus === 'connected' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
            }`}>
              {waStatus === 'connected' ? 'متصل حالياً' : 'غير متصل'}
            </p>

            <button 
              onClick={initWhatsApp}
              disabled={loading}
              className={`w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-3 transition-all ${
                waStatus === 'connected' 
                ? 'bg-white/5 hover:bg-white/10 text-white border border-white/10' 
                : 'bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-600/20'
              }`}
            >
              {loading ? <RefreshCw className="animate-spin" size={20} /> : <Zap size={20} />}
              {waStatus === 'connected' ? 'تجديد الجلسة' : 'بدء ربط جديد'}
            </button>
          </div>

          <div className="glass-panel p-6">
            <h4 className="flex items-center gap-2 text-white mb-4">
              <Zap size={18} className="text-yellow-500" /> معلومات الموظف
            </h4>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between py-2 border-b border-white/5">
                <span className="text-gray-400">كود الموظف:</span>
                <span className="text-white font-mono">{employeeId}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-white/5">
                <span className="text-gray-400">الخادم النشط:</span>
                <span className="text-white font-mono">{BASE_URL.replace('http://', '')}</span>
              </div>
            </div>
          </div>
        </div>

        {/* QR Section */}
        <div className="col-span-12 lg:col-span-8">
          <div className="glass-panel p-10 h-full flex flex-col items-center justify-center min-h-[500px]">
            {loading && !qrCode ? (
              <div className="text-center">
                <div className="w-16 h-16 border-4 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
                <p className="text-gray-400">جاري التواصل مع خادم الواتساب...</p>
              </div>
            ) : qrCode && waStatus !== 'connected' ? (
              <div className="text-center animate-fade-in">
                <h3 className="text-2xl font-bold text-white mb-8">امسح الرمز ضوئياً</h3>
                <div className="bg-white p-6 rounded-[2.5rem] shadow-2xl inline-block mb-10 border-8 border-green-500/10">
                  <img 
                    src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(qrCode)}&size=300x300&color=059669`} 
                    alt="Scan Me"
                    className="w-64 h-64"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-right">
                  <div className="bg-white/5 p-4 rounded-2xl">
                    <span className="text-green-500 font-bold block mb-1">01</span>
                    <p className="text-xs text-gray-400 leading-relaxed">افتح الواتساب على جوالك الخاص</p>
                  </div>
                  <div className="bg-white/5 p-4 rounded-2xl">
                    <span className="text-green-500 font-bold block mb-1">02</span>
                    <p className="text-xs text-gray-400 leading-relaxed">الأجهزة المرتبطة ثم ربط جهاز</p>
                  </div>
                  <div className="bg-white/5 p-4 rounded-2xl">
                    <span className="text-green-500 font-bold block mb-1">03</span>
                    <p className="text-xs text-gray-400 leading-relaxed">وجه الكاميرا لهذا الرمز فوراً</p>
                  </div>
                </div>
              </div>
            ) : waStatus === 'connected' ? (
              <div className="text-center animate-fade-in">
                <div className="w-32 h-32 bg-green-500/10 border-2 border-green-500/30 rounded-full flex items-center justify-center mx-auto mb-8">
                  <CheckCircle size={64} className="text-green-500" />
                </div>
                <h3 className="text-3xl font-black text-white mb-4">أنت الآن متصل!</h3>
                <p className="text-gray-400 max-w-md mx-auto mb-10">
                  حسابك الشخصي مرتبط الآن بنظام المتكامل. يمكنك الذهاب لشاشة الدردشة أو الرقابة الحية لمتابعة العمل.
                </p>
                <div className="flex gap-4 justify-center">
                  <button onClick={handleLogout} className="px-8 py-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-2xl text-red-500 font-bold transition-all">قطع الاتصال</button>
                  <button className="px-8 py-3 bg-green-600 hover:bg-green-700 text-white rounded-2xl font-bold shadow-lg shadow-green-600/20 transition-all">بدء الدردشة</button>
                </div>
              </div>
            ) : (
              <div className="text-center">
                <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6">
                  <QrCode size={48} className="text-white/20" />
                </div>
                <p className="text-gray-500 max-w-xs mx-auto">اضغط على زر "بدء ربط جديد" في الجانب الأيمن لتوليد رمز المرور للواتساب.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="glass-panel mt-8 p-8">
        <h3 className="flex items-center gap-3 text-white font-bold mb-6">
          <AlertTriangle size={24} className="text-yellow-500" /> ملاحظات هامة
        </h3>
        <ul className="space-y-3 text-gray-400 text-sm" style={{ lineHeight: 1.6 }}>
          <li>يجب إبقاء الهاتف متصلاً بالإنترنت أثناء عملية الربط الأولى.</li>
          <li>النظام يدعم تعدد الموظفين، كل موظف يربط حسابه الخاص بشكل منفصل.</li>
          <li>في حال واجهت مشاكل في الإرسال، جرب فصل الجهاز من تطبيق الواتساب وإعادة الربط هنا.</li>
        </ul>
      </div>
    </div>
  );
}
