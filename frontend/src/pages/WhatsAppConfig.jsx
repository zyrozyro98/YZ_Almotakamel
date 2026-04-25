import React, { useState, useEffect } from 'react';
import { QrCode, ShieldCheck, RefreshCw, LogOut, CheckCircle, Smartphone, Zap, AlertTriangle, Users, Database } from 'lucide-react';
import axios from 'axios';
import { auth, rtdb, db } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { ref, onValue } from 'firebase/database';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';

export default function WhatsAppConfig() {
  const [waStatus, setWaStatus] = useState('checking'); // 'checking', 'connected', 'qr_needed', 'error'
  const [qrCode, setQrCode] = useState(null);
  const [loading, setLoading] = useState(false);
  const [employeeId, setEmployeeId] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [targetEmployeeId, setTargetEmployeeId] = useState(null);
  const [allStatuses, setAllStatuses] = useState([]);
  const [activeTab, setActiveTab] = useState('single'); // 'single', 'dashboard'

  const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

  // 1. Auth Listener
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, user => {
      if (user) {
        setEmployeeId(user.uid);
        const adminStatus = user.email === 'yazans95@gmail.com' || user.email === 'zyrozyro98@gmail.com';
        setIsAdmin(adminStatus);
        if (!adminStatus) setTargetEmployeeId(user.uid);
      } else {
        setEmployeeId(null);
        setIsAdmin(false);
      }
    });
    return () => unsubAuth();
  }, []);

  // 2. Real-time Status for Selected Employee
  useEffect(() => {
    const activeTarget = isAdmin ? targetEmployeeId : employeeId;
    if (!activeTarget) return;

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

  // 3. Admin Data: Employees & Global Status
  useEffect(() => {
    if (!isAdmin) return;
    
    // Get Employees
    const q = query(collection(db, 'employees'), orderBy('name', 'asc'));
    const unsubEmp = onSnapshot(q, (snapshot) => {
      setEmployees(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // Get All Statuses from RTDB (Real-time overview)
    const allStatusRef = ref(rtdb, 'wa_status');
    const unsubStatus = onValue(allStatusRef, (snapshot) => {
      const data = snapshot.val() || {};
      setAllStatuses(data);
    });

    return () => { unsubEmp(); unsubStatus(); };
  }, [isAdmin]);

  const fetchAllStatuses = async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const res = await axios.get(`${BASE_URL}/api/whatsapp/status-all`);
      // We don't necessarily need to store this in state if we have RTDB, 
      // but it helps force a refresh of the internal memory of the backend.
      console.log('Backend sync complete');
    } catch (err) {
      console.error('Failed to sync statuses:', err);
    } finally {
      setLoading(false);
    }
  };

  const initWhatsApp = async (id = null) => {
    const activeTarget = id || (isAdmin ? targetEmployeeId : employeeId);
    if (!activeTarget) return;

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

  const handleLogout = async (id = null) => {
    const activeTarget = id || (isAdmin ? targetEmployeeId : employeeId);
    if (!activeTarget) return;

    if (!window.confirm('هل أنت متأكد من فصل الجلسة؟')) return;
    setLoading(true);
    try {
      await axios.post(`${BASE_URL}/api/whatsapp/logout`, { employeeId: activeTarget });
    } catch (err) { 
      console.error('Logout failed:', err); 
    } finally { 
      setLoading(false); 
    }
  };

  const handleCleanup = async () => {
    const activeTarget = isAdmin ? targetEmployeeId : employeeId;
    if (!activeTarget) return;
    if (!window.confirm('سيتم محاولة دمج السجلات المتكررة وتصحيح قاعدة البيانات لهذا الموظف. هل تريد الاستمرار؟')) return;
    setLoading(true);
    try {
      const res = await axios.post(`${BASE_URL}/api/whatsapp/cleanup-database`, { employeeId: activeTarget });
      alert(`تمت العملية بنجاح. تم دمج/تصحيح ${res.data.transformed} سجل.`);
    } catch (err) {
      alert('فشلت عملية التنظيف');
    } finally {
      setLoading(false);
    }
  };

  if (!employeeId) {
    return <div style={{ color: '#fff', padding: '100px', textAlign: 'center' }}>جاري التحقق من الهوية...</div>;
  }

  return (
    <div className="animate-fade-in" style={{ padding: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
        <div>
          <h1 style={{ fontSize: '2.2rem', fontWeight: 900, color: '#fff', margin: 0 }}>إعدادات الربط</h1>
          <p style={{ color: 'rgba(255,255,255,0.4)', margin: '5px 0 0' }}>
            {isAdmin ? 'الإدارة المركزية للجلسات والتحكم في الربط' : `هوية الربط: ${employeeId}`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          {isAdmin && (
            <div className="glass-panel" style={{ padding: '5px', display: 'flex', gap: '5px', borderRadius: '15px' }}>
              <button 
                onClick={() => setActiveTab('single')} 
                style={{ padding: '8px 20px', borderRadius: '10px', border: 'none', background: activeTab === 'single' ? 'var(--brand-primary)' : 'transparent', color: '#fff', cursor: 'pointer', fontWeight: 700 }}
              >
                تحكم فردي
              </button>
              <button 
                onClick={() => setActiveTab('dashboard')} 
                style={{ padding: '8px 20px', borderRadius: '10px', border: 'none', background: activeTab === 'dashboard' ? 'var(--brand-primary)' : 'transparent', color: '#fff', cursor: 'pointer', fontWeight: 700 }}
              >
                لوحة المتابعة
              </button>
            </div>
          )}
          <button onClick={fetchAllStatuses} disabled={loading} className="btn-secondary">
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} /> تحديث النظام
          </button>
        </div>
      </div>

      {activeTab === 'single' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '30px' }}>
          {/* Left Panel: Selector & Actions */}
          <div style={{ gridColumn: 'span 4' }}>
            <div className="glass-panel" style={{ padding: '30px', textAlign: 'center' }}>
              {isAdmin && (
                <div style={{ marginBottom: '30px', textAlign: 'right' }}>
                  <label className="input-label" style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Users size={16} color="var(--brand-primary)" />
                    الموظف المستهدف:
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
                    <option value="">-- اختر موظفاً للإدارة --</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name} {emp.id === employeeId ? '(أنا)' : ''}</option>
                    ))}
                  </select>
                </div>
              )}
              
              {!targetEmployeeId && isAdmin ? (
                <div style={{ padding: '40px 20px', color: 'rgba(255,255,255,0.2)' }}>
                  <Users size={60} style={{ marginBottom: '20px', opacity: 0.2 }} />
                  <p>يرجى اختيار موظف من القائمة للبدء في إدارة جلسته</p>
                </div>
              ) : (
                <>
                  <div style={{ width: '80px', height: '80px', borderRadius: '25px', background: waStatus === 'connected' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', color: waStatus === 'connected' ? '#22c55e' : '#666' }}>
                    {waStatus === 'connected' ? <ShieldCheck size={40} /> : <Smartphone size={40} />}
                  </div>
                  <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fff', marginBottom: '10px' }}>الحالة الحالية</h2>
                  <div style={{ padding: '8px 20px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 700, marginBottom: '30px', background: waStatus === 'connected' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: waStatus === 'connected' ? '#4ade80' : '#f87171' }}>
                    {waStatus === 'connected' ? 'متصل بنجاح' : (waStatus === 'checking' ? 'جاري الفحص...' : 'غير متصل')}
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <button onClick={() => initWhatsApp()} disabled={loading} className="btn-primary" style={{ width: '100%', padding: '15px' }}>
                      <Zap size={20} /> {waStatus === 'connected' ? 'إعادة تشغيل الجلسة' : 'ربط جديد / توليد QR'}
                    </button>
                    
                    {isAdmin && (
                      <button onClick={handleCleanup} disabled={loading} className="btn-secondary" style={{ width: '100%', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                        <Database size={18} /> تنظيف ودمج قاعدة البيانات
                      </button>
                    )}
                    
                    {waStatus === 'connected' && (
                      <button onClick={() => handleLogout()} disabled={loading} style={{ background: 'transparent', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', padding: '12px', borderRadius: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: 700 }}>
                        <LogOut size={18} /> قطع اتصال الجلسة
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Right Panel: Display Area (QR or Success) */}
          <div style={{ gridColumn: 'span 8' }}>
            <div className="glass-panel" style={{ height: '100%', minHeight: '450px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px', position: 'relative' }}>
              {waStatus === 'qr_needed' && qrCode ? (
                <div className="animate-scale-in" style={{ textAlign: 'center' }}>
                  <div style={{ marginBottom: '25px' }}>
                    <h3 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#fff', marginBottom: '10px' }}>امسح الرمز ضوئياً</h3>
                    <p style={{ color: 'rgba(255,255,255,0.4)' }}>افتح واتساب على هاتفك {'>'} الأجهزة المرتبطة {'>'} ربط جهاز</p>
                  </div>
                  <div style={{ background: '#fff', padding: '20px', borderRadius: '30px', display: 'inline-block', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}>
                    <img src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(qrCode)}&size=300x300&color=059669`} alt="QR" style={{ width: '250px', height: '250px' }} />
                  </div>
                  <div style={{ marginTop: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', color: 'var(--brand-primary)' }}>
                    <RefreshCw size={16} className="animate-spin" />
                    <span style={{ fontWeight: 700 }}>يتم التحديث تلقائياً عند المسح</span>
                  </div>
                </div>
              ) : waStatus === 'connected' ? (
                <div className="animate-scale-in" style={{ textAlign: 'center' }}>
                  <div style={{ width: '120px', height: '120px', borderRadius: '40px', background: 'rgba(34, 197, 94, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 30px', color: '#22c55e' }}>
                    <CheckCircle size={70} />
                  </div>
                  <h3 style={{ fontSize: '2rem', fontWeight: 900, color: '#fff', marginBottom: '10px' }}>تم الربط بنجاح!</h3>
                  <p style={{ color: 'rgba(255,255,255,0.4)', maxWidth: '400px', margin: '0 auto' }}>
                    هذا الجهاز متصل الآن بالخادم ويمكنه إرسال واستقبال الرسائل بشكل تلقائي.
                  </p>
                </div>
              ) : waStatus === 'checking' && targetEmployeeId ? (
                <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.2)' }}>
                  <RefreshCw size={50} className="animate-spin" style={{ marginBottom: '20px' }} />
                  <p>جاري التحقق من حالة الجلسة لدى الخادم...</p>
                </div>
              ) : (
                <div style={{ textAlign: 'center', opacity: 0.3 }}>
                   <Smartphone size={80} style={{ marginBottom: '20px' }} />
                   <p style={{ fontSize: '1.2rem' }}>انتظار الأوامر...</p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Admin Dashboard Tab */
        <div className="animate-fade-in">
          <div className="glass-panel" style={{ padding: '0', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem' }}>
                  <th style={{ padding: '20px' }}>الموظف</th>
                  <th style={{ padding: '20px' }}>الحالة</th>
                  <th style={{ padding: '20px' }}>آخر تحديث</th>
                  <th style={{ padding: '20px' }}>الرقم المرتبط</th>
                  <th style={{ padding: '20px' }}>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {employees.map(emp => {
                  const status = allStatuses[emp.id] || {};
                  return (
                    <tr key={emp.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                      <td style={{ padding: '20px' }}>
                        <div style={{ fontWeight: 800, color: '#fff' }}>{emp.name}</div>
                        <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.2)' }}>{emp.id}</div>
                      </td>
                      <td style={{ padding: '20px' }}>
                        <div style={{ 
                          display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '5px 12px', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 700,
                          background: status.isConnected ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                          color: status.isConnected ? '#4ade80' : '#f87171'
                        }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'currentColor' }}></div>
                          {status.isConnected ? 'متصل' : 'غير متصل'}
                        </div>
                      </td>
                      <td style={{ padding: '20px', color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem' }}>
                        {status.lastUpdate ? new Date(status.lastUpdate).toLocaleString('ar-SA') : '---'}
                      </td>
                      <td style={{ padding: '20px', color: '#fff', fontWeight: 600 }}>
                        {status.phoneNumber ? status.phoneNumber.split(':')[0] : '---'}
                      </td>
                      <td style={{ padding: '20px' }}>
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <button 
                            onClick={() => { setTargetEmployeeId(emp.id); setActiveTab('single'); }} 
                            className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                          >
                            إدارة
                          </button>
                          {status.isConnected && (
                            <button 
                              onClick={() => handleLogout(emp.id)} 
                              style={{ padding: '6px 12px', background: 'rgba(239, 68, 68, 0.1)', color: '#f87171', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700 }}
                            >
                              فصل
                            </button>
                          )}
                          {!status.isConnected && (
                            <button 
                              onClick={() => initWhatsApp(emp.id)} 
                              style={{ padding: '6px 12px', background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700 }}
                            >
                              ربط
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
