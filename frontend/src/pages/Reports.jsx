import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FileDown, Users, ShieldAlert, Activity, ArrowDownToLine, 
  QrCode, TrendingUp, BarChart3, Clock, MessageSquare, 
  CheckCircle, Zap, UserCheck, AlertCircle, RefreshCcw, Lock
} from 'lucide-react';
import axios from 'axios';
import { QRCodeSVG } from 'qrcode.react';
import { db, auth, rtdb } from '../firebase';
import { 
  collection, getDocs, orderBy, query, getDoc, doc, 
  getCountFromServer, onSnapshot, where 
} from 'firebase/firestore';
import { ref, onValue } from 'firebase/database';

export default function Reports() {
  const navigate = useNavigate();
  const [selectedEmp, setSelectedEmp] = useState('');
  const [qrString, setQrString] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [employeeStatuses, setEmployeeStatuses] = useState({});
  const [employees, setEmployees] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [solverSystemLocked, setSolverSystemLocked] = useState(false);
  const [solverSubmissions, setSolverSubmissions] = useState([]);
  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [stats, setStats] = useState({
    totalStudents: 0,
    totalOrders: 0,
    activeEmployees: 0,
    totalMessages: 0
  });

  // Admin Check
  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async user => {
      if (user) {
        let adminStatus = user.email === 'yazans95@gmail.com' || user.email === 'zyrozyro98@gmail.com';
        try {
          const userDoc = await getDoc(doc(db, 'employees', user.uid));
          if (userDoc.exists() && (userDoc.data().role === 'admin' || userDoc.data().type === 'admin')) {
            adminStatus = true;
          }
        } catch (e) {
          console.error("Admin check error:", e);
        }
        setIsAdmin(adminStatus);
      } else {
        setIsAdmin(false);
      }
      setCheckingAdmin(false);
    });
    return () => unsub();
  }, []);

  // Fetch Employees
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'employees'), (snapshot) => {
      const empList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setEmployees(empList);
      if (empList.length > 0 && !selectedEmp) {
        setSelectedEmp(empList[0].id);
      }
    });
    return () => unsub();
  }, [selectedEmp]);

  // Fetch Stats (Students, Orders)
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const studentSnap = await getCountFromServer(collection(db, 'students'));
        const orderSnap = await getCountFromServer(collection(db, 'orders'));
        const empSnap = await getCountFromServer(query(collection(db, 'employees'), where('status', '==', 'online')));
        
        setStats(prev => ({
          ...prev,
          totalStudents: studentSnap.data().count,
          totalOrders: orderSnap.data().count,
          activeEmployees: empSnap.data().count
        }));
      } catch (err) {
        console.error("Error fetching stats:", err);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  // Fetch Solver System Status & Submissions
  useEffect(() => {
    const unsubLock = onSnapshot(doc(db, 'system_settings', 'global'), (docSnap) => {
      if (docSnap.exists()) {
        setSolverSystemLocked(docSnap.data().solverSystemLocked === true);
      }
    });

    const unsubSubmissions = onSnapshot(query(collection(db, 'solver_submissions'), orderBy('timestamp', 'desc')), (snapshot) => {
      setSolverSubmissions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => { unsubLock(); unsubSubmissions(); };
  }, []);

  // Fetch Real-time Message Stats from RTDB
  useEffect(() => {
    const chatsRef = ref(rtdb, 'chats');
    const unsub = onValue(chatsRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) return;
      
      let messageCount = 0;
      Object.values(data).forEach(empChats => {
        Object.values(empChats).forEach(chat => {
          if (chat.messages) messageCount += Object.keys(chat.messages).length;
        });
      });
      
      setStats(prev => ({ ...prev, totalMessages: messageCount }));
    });
    return () => unsub();
  }, []);

  // Fetch WhatsApp Statuses
  useEffect(() => {
    const fetchStatuses = async () => {
      const statuses = {};
      const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
      
      for (const emp of employees) {
        try {
          const res = await axios.get(`${BASE_URL}/api/whatsapp/status/${emp.id}`);
          statuses[emp.id] = res.data;
        } catch (err) {
          statuses[emp.id] = { isConnected: false, hasCredentialsSaved: false };
        }
      }
      setEmployeeStatuses(statuses);
    };
    
    if (employees.length > 0) {
      fetchStatuses();
      const interval = setInterval(fetchStatuses, 15000);
      return () => clearInterval(interval);
    }
  }, [employees]);

  const handleGenerateQR = async () => {
    if (!selectedEmp) return alert('يرجى اختيار موظف أولاً');
    setIsLoading(true);
    setQrString('');
    try {
      const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
      const res = await axios.post(`${BASE_URL}/api/whatsapp/init`, { employeeId: selectedEmp });
      
      if (res.data.status === 'qr_generated') setQrString(res.data.qr);
      else if (res.data.status === 'connected') alert('هذا الحساب مرتبط بالفعل ولا يحتاج إلى مسح باركود جديد.');
    } catch (err) {
      console.error(err);
      alert('حدث خطأ أثناء توليد الباركود. تأكد من تشغيل الباك إند.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleSolverSystem = async () => {
    try {
      await updateDoc(doc(db, 'system_settings', 'global'), {
        solverSystemLocked: !solverSystemLocked
      });
    } catch (err) {
      if (err.code === 'not-found') {
         const { setDoc } = await import('firebase/firestore');
         await setDoc(doc(db, 'system_settings', 'global'), {
           solverSystemLocked: !solverSystemLocked
         });
      } else {
         console.error('Error toggling system:', err);
         alert('حدث خطأ أثناء تعديل حالة النظام.');
      }
    }
  };

  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      const q = query(collection(db, 'students'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      
      let csvContent = "\uFEFF"; 
      csvContent += "الاسم,رقم الهاتف,الجامعة,التخصص,الحالة الرئيسية,الحالة الفرعية,تاريخ الإضافة\n";
      
      snapshot.docs.forEach(doc => {
        const d = doc.data();
        const date = d.createdAt ? new Date(d.createdAt.seconds * 1000).toLocaleDateString('ar-SA') : 'N/A';
        const row = `"${d.name || ''}","${d.phone || ''}","${d.university || ''}","${d.major || ''}","${d.mainStatus || ''}","${d.subStatus || ''}","${date}"`;
        csvContent += row + "\n";
      });

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `تقرير_بيانات_الطلاب_${new Date().toLocaleDateString('en-GB').replace(/\//g,'-')}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error(err);
      alert('حدث خطأ أثناء سحب البيانات وتصدير التقرير.');
    } finally {
      setIsExporting(false);
    }
  };

  if (checkingAdmin) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#fff' }}>
        <RefreshCcw size={40} className="animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="animate-fade-in-up" style={{ padding: '40px', textAlign: 'center' }}>
        <div className="glass-panel" style={{ padding: '4rem', maxWidth: '600px', margin: '0 auto', border: '1px solid var(--danger)' }}>
          <AlertCircle size={80} color="var(--danger)" style={{ marginBottom: '2rem' }} />
          <h2 style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>الوصول مرفوض</h2>
          <p style={{ fontSize: '1.2rem', opacity: 0.8 }}>عذراً، هذه الصفحة مخصصة للمسؤولين فقط (Super Admin). يرجى العودة للرئيسية.</p>
          <button className="btn-primary" style={{ marginTop: '2rem' }} onClick={() => navigate('/')}>العودة للرئيسية</button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '2rem', paddingBottom: '2rem' }}>
      
      {/* Header Section */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ fontSize: '2.2rem', fontWeight: 900, marginBottom: '0.5rem', background: 'linear-gradient(to left, #fff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            التقارير المتقدمة والرقابة للحساب
          </h1>
          <p style={{ fontSize: '1.1rem' }}>مراقبة الأداء، إدارة الجلسات، وتحليل بيانات المنصة بشكل كامل.</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
           <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '0.5rem 1rem', borderRadius: '12px', border: '1px solid rgba(59, 130, 246, 0.2)', display: 'flex', alignItems: 'center', gap: '8px' }}>
             <ShieldAlert size={18} color="var(--brand-primary)" />
             <span style={{ fontWeight: 800, fontSize: '0.9rem' }}>نمط المسؤول (Admin Mode)</span>
           </div>
        </div>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 sm-grid-cols-1">
        {[
          { label: 'إجمالي الطلاب', value: stats.totalStudents.toLocaleString(), icon: <Users />, color: '#3b82f6', trend: '+12% منذ الأسبوع الماضي' },
          { label: 'إجمالي الطلبات', value: stats.totalOrders.toLocaleString(), icon: <Zap />, color: '#f59e0b', trend: 'نشاط مستقر اليوم' },
          { label: 'إجمالي الرسائل', value: stats.totalMessages.toLocaleString(), icon: <MessageSquare />, color: '#10b981', trend: 'أعلى مستوى اليوم' },
          { label: 'الموظفون النشطون', value: stats.activeEmployees, icon: <UserCheck />, color: '#a855f7', trend: 'جميعهم متصلون' }
        ].map((item, idx) => (
          <div key={idx} className="glass-panel" style={{ padding: '1.5rem', position: 'relative', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ padding: '0.6rem', background: `${item.color}20`, borderRadius: '10px', color: item.color }}>{item.icon}</div>
              <TrendingUp size={16} color="var(--success)" style={{ opacity: 0.6 }} />
            </div>
            <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{item.label}</p>
            <h2 style={{ fontSize: '2rem', margin: '0.2rem 0', fontWeight: 900 }}>{item.value}</h2>
            <div style={{ fontSize: '0.75rem', color: 'var(--success)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <ArrowDownToLine size={12} style={{ transform: 'rotate(180deg)' }} /> {item.trend}
            </div>
          </div>
        ))}
      </div>

      {/* Main Tools Section */}
      <div className="grid grid-cols-2 md-grid-cols-1 gap-6">
        
        {/* Export Panel */}
        <div className="glass-panel" style={{ padding: '2rem', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
          <div className="flex items-center gap-4 mb-6">
            <div style={{ padding: '0.8rem', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '12px', color: 'var(--success)' }}><BarChart3 size={24} /></div>
            <div>
              <h3 style={{ margin: 0 }}>تصدير وتحليل البيانات</h3>
              <p style={{ margin: 0, fontSize: '0.85rem' }}>سحب قاعدة بيانات الطلاب بصيغة Excel (CSV)</p>
            </div>
          </div>
          
          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1.5rem', borderRadius: '16px', marginBottom: '1.5rem', border: '1px dashed var(--glass-border)' }}>
             <ul style={{ padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
               <li className="flex items-center gap-3" style={{ fontSize: '0.9rem' }}><CheckCircle size={16} color="var(--success)" /> تصدير كامل بيانات الطلاب (أكثر من {stats.totalStudents} سجل)</li>
               <li className="flex items-center gap-3" style={{ fontSize: '0.9rem' }}><CheckCircle size={16} color="var(--success)" /> دعم كامل للغة العربية والرموز الخاصة</li>
               <li className="flex items-center gap-3" style={{ fontSize: '0.9rem' }}><CheckCircle size={16} color="var(--success)" /> تصنيف حسب الجامعة والتخصص تلقائياً</li>
             </ul>
          </div>

          <button onClick={handleExportExcel} disabled={isExporting} className="btn-primary w-full" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
            <FileDown size={20} /> {isExporting ? 'جاري تجهيز الملف...' : 'تصدير بيانات الطلاب (Excel)'}
          </button>
        </div>

        {/* Solver Control Panel */}
        <div className="glass-panel" style={{ padding: '2rem', border: '1px solid rgba(139, 92, 246, 0.2)' }}>
          <div className="flex items-center gap-4 mb-6">
            <div style={{ padding: '0.8rem', background: 'rgba(139, 92, 246, 0.1)', borderRadius: '12px', color: '#8b5cf6' }}><Lock size={24} /></div>
            <div>
              <h3 style={{ margin: 0 }}>نظام حل الاختبارات</h3>
              <p style={{ margin: 0, fontSize: '0.85rem' }}>التحكم في وصول حلالي الاختبارات للنظام</p>
            </div>
          </div>
          
          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1.5rem', borderRadius: '16px', marginBottom: '1.5rem', border: '1px dashed var(--glass-border)' }}>
             <p style={{ fontSize: '0.9rem', marginBottom: '1rem', color: 'var(--text-secondary)' }}>
               حالة النظام الحالي: <strong style={{ color: solverSystemLocked ? 'var(--danger)' : 'var(--success)' }}>{solverSystemLocked ? 'مقفل (لا يمكنهم الدخول)' : 'نشط ومفتوح'}</strong>
             </p>
             <button 
                onClick={handleToggleSolverSystem} 
                className="btn-primary w-full" 
                style={{ background: solverSystemLocked ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, #ef4444, #dc2626)' }}
             >
               <Lock size={20} /> {solverSystemLocked ? 'فتح النظام للسماح بالحل' : 'إقفال النظام فوراً'}
             </button>
          </div>
        </div>

        {/* WhatsApp QR Panel */}
        <div className="glass-panel" style={{ padding: '2rem', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
          <div className="flex items-center gap-4 mb-6">
            <div style={{ padding: '0.8rem', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '12px', color: 'var(--brand-primary)' }}><QrCode size={24} /></div>
            <div>
              <h3 style={{ margin: 0 }}>ربط أجهزة الواتساب للموظفين</h3>
              <p style={{ margin: 0, fontSize: '0.85rem' }}>إدارة جلسات الربط وتوليد الباركود (QR)</p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
            <select 
              className="input-base" 
              style={{ flex: 1 }} 
              value={selectedEmp} 
              onChange={(e) => { setSelectedEmp(e.target.value); setQrString(''); }}
            >
              <option value="" disabled>اختر الموظف...</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.name || emp.email}</option>
              ))}
            </select>
            <button className="btn-primary" onClick={handleGenerateQR} disabled={isLoading || !selectedEmp}>
              {isLoading ? 'جاري التوليد...' : 'توليد QR'}
            </button>
          </div>

          <div style={{ 
            minHeight: '200px', background: 'rgba(15,23,42,0.4)', borderRadius: '16px', 
            display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--glass-border)',
            position: 'relative', overflow: 'hidden'
          }}>
            {qrString ? (
              <div style={{ background: '#fff', padding: '1rem', borderRadius: '12px', animation: 'scaleUp 0.3s forwards' }}>
                <QRCodeSVG value={qrString} size={180} level="H" />
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem' }}>
                <QrCode size={40} style={{ opacity: 0.1, marginBottom: '1rem' }} />
                <p style={{ fontSize: '0.85rem' }}>اختر موظفاً واضغط على "توليد QR" لربط الهاتف</p>
              </div>
            )}
            
            {qrString && (
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(59, 130, 246, 0.9)', padding: '0.5rem', color: '#fff', fontSize: '0.75rem', fontWeight: 700, textAlign: 'center' }}>
                امسح الكود الآن قبل انتهاء الصلاحية
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Detailed Monitoring Table */}
      <div className="glass-panel" style={{ flex: 1, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="flex items-center gap-3">
            <Activity size={22} color="var(--brand-secondary)" />
            <h3 style={{ margin: 0 }}>مراقبة الأداء الفوري (Live)</h3>
          </div>
          <span className="badge badge-info">{employees.length} موظفين مسجلين</span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>الموظف</th>
                <th>الحالة العامة</th>
                <th>ربط الواتساب</th>
                <th>البريد الإلكتروني</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {employees.map(emp => (
                <tr key={emp.id}>
                  <td style={{ fontWeight: 800 }}>
                    <div className="flex items-center gap-3">
                      <div style={{ 
                        width: '35px', height: '35px', borderRadius: '10px', 
                        background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-secondary))',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.9rem'
                      }}>
                        {emp.name?.charAt(0) || 'E'}
                      </div>
                      {emp.name || 'موظف مجهول'}
                    </div>
                  </td>
                  <td>
                    {emp.status === 'online' ? (
                      <span className="badge badge-success">متصل الآن</span>
                    ) : (
                      <span className="badge" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)' }}>أوفلاين</span>
                    )}
                  </td>
                  <td>
                    {employeeStatuses[emp.id]?.isConnected ? (
                      <div className="flex items-center gap-2" style={{ color: 'var(--success)', fontWeight: 700 }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--success)', boxShadow: '0 0 8px var(--success)' }}></div>
                        مرتبط ونشط
                      </div>
                    ) : (
                      <div className="flex items-center gap-2" style={{ color: 'var(--danger)', fontWeight: 700 }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--danger)' }}></div>
                        غير مرتبط
                      </div>
                    )}
                  </td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{emp.email}</td>
                  <td>
                    <button 
                      className="btn-secondary" 
                      style={{ padding: '0.4rem 1rem', fontSize: '0.8rem' }}
                      onClick={() => navigate(`/live-monitoring?emp=${emp.id}`)}
                    >
                      <Activity size={14} /> مراقبة حية
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Solver Submissions Monitoring */}
      <div className="glass-panel" style={{ flex: 1, padding: 0, overflow: 'hidden', border: '1px solid rgba(139, 92, 246, 0.2)' }}>
        <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(139, 92, 246, 0.05)' }}>
          <div className="flex items-center gap-3">
            <CheckCircle size={22} color="#8b5cf6" />
            <h3 style={{ margin: 0, color: '#8b5cf6' }}>سجل حلول الاختبارات المكتملة</h3>
          </div>
          <span className="badge" style={{ background: '#8b5cf6', color: '#fff' }}>{solverSubmissions.length} مهام منجزة</span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>الطالب</th>
                <th>الجامعة والتخصص</th>
                <th>الموظف (الحلال)</th>
                <th>وقت الإنجاز</th>
                <th>الإثبات والملاحظات</th>
              </tr>
            </thead>
            <tbody>
              {solverSubmissions.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>لا توجد مهام منجزة حتى الآن.</td>
                </tr>
              ) : (
                solverSubmissions.map(sub => (
                  <tr key={sub.id}>
                    <td style={{ fontWeight: 800 }}>{sub.studentName}</td>
                    <td>
                      <p style={{ margin: 0 }}>{sub.university}</p>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{sub.major}</p>
                    </td>
                    <td>{sub.solverName}</td>
                    <td style={{ fontSize: '0.85rem' }} dir="ltr">
                      {sub.timestamp ? new Date(sub.timestamp.seconds * 1000).toLocaleString('ar-SA') : 'N/A'}
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        {sub.proofImage ? (
                          <a href={sub.proofImage} target="_blank" rel="noopener noreferrer" className="badge badge-success" style={{ cursor: 'pointer', textDecoration: 'none' }}>عرض الصورة</a>
                        ) : (
                          <span className="badge badge-warning">بدون صورة</span>
                        )}
                        {sub.notes && (
                          <button className="badge badge-info" style={{ border: 'none', cursor: 'help' }} title={sub.notes}>ملاحظة</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`
        @keyframes scaleUp {
          from { transform: scale(0.9); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
