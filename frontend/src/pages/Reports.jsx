import React, { useState } from 'react';
import { FileDown, Users, ShieldAlert, Activity, ArrowDownToLine, QrCode, TrendingUp, BarChart3, Clock, MessageSquare, CheckCircle } from 'lucide-react';
import axios from 'axios';
import { QRCodeSVG } from 'qrcode.react';
import { db } from '../firebase';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';

export default function Reports() {
  const [selectedEmp, setSelectedEmp] = useState('emp1');
  const [qrString, setQrString] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [employeeStatuses, setEmployeeStatuses] = useState({});

  React.useEffect(() => {
    const fetchStatuses = async () => {
      const statuses = {};
      const emps = ['emp1', 'emp2', 'emp3'];
      const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
      
      for (const emp of emps) {
        try {
          const res = await axios.get(`${BASE_URL}/api/whatsapp/status/${emp}`);
          statuses[emp] = res.data;
        } catch (err) {
          statuses[emp] = { isConnected: false, hasCredentialsSaved: false };
        }
      }
      setEmployeeStatuses(statuses);
    };
    
    fetchStatuses();
    const interval = setInterval(fetchStatuses, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleGenerateQR = async () => {
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

  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      const q = query(collection(db, 'students'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      
      // UTF-8 BOM for Arabic support in Excel
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

  return (
    <div className="animate-fade-in-up" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <h1 style={{ marginBottom: '0.5rem' }}>التقارير المتقدمة والرقابة للحساب (Admin)</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
        تصدير التقارير لتطبيق Excel، المراقبة الحية لأنشطة الموظفين، وأدوات ربط الواتساب الوهمي.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
        
        {/* Export Reports Box */}
        <div className="glass-panel" style={{ padding: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
            <FileDown size={28} color="var(--brand-secondary)" />
            <h3 style={{ margin: 0 }}>تصدير قاعدة البيانات (Excel)</h3>
          </div>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
            اضغط على الزر أدناه لسحب جميع بيانات الطلبات والعملاء بشكل فوري من السيرفر بصيغة Excel (CSV متوافق مع اللغة العربية).
          </p>
          <div className="flex gap-4">
            <button onClick={handleExportExcel} disabled={isExporting} className="btn-primary flex items-center justify-center flex-1 gap-2" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
              <ArrowDownToLine size={18} /> {isExporting ? 'جاري السحب والتصدير...' : 'تحميل كـ Excel / CSV'}
            </button>
          </div>
        </div>

        {/* WhatsApp QR Configuration Box - Admin Controlled */}
        <div className="glass-panel" style={{ padding: '2rem', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
            <QrCode size={28} color="var(--brand-primary)" />
            <h3 style={{ margin: 0 }}>إدارة ربط الواتساب (للمسؤول فقط)</h3>
          </div>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: '1.6' }}>
            من هنا يقوم <strong>المسؤول (Admin)</strong> بتوليد رمز QR خاص وربط هاتف واتساب مخصص للموظف. 
            تتم الدردشة عبر غرفة معزولة تماماً لكل موظف وبدون تداخل للبيانات أو الإشعارات.
          </p>
          
          <div className="flex gap-4 items-center" style={{ marginBottom: '1.5rem' }}>
            <select className="input-base" style={{ flex: 1 }} value={selectedEmp} onChange={(e) => {
              setSelectedEmp(e.target.value);
              setQrString('');
            }}>
              <option value="emp1">الموظف: محمد عبدالعزيز</option>
              <option value="emp2">الموظف: سارة الخالد</option>
              <option value="emp3">الموظف: عبدالله الفهد</option>
            </select>
            <button className="btn-primary flex items-center gap-2" onClick={handleGenerateQR} disabled={isLoading}>
              <QrCode size={18} /> {isLoading ? 'جاري التحميل...' : 'توليد QR للموظف'}
            </button>
          </div>

          {/* Connected Status Hint */}
          {!qrString && !isLoading && (
            <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid var(--success)', padding: '1rem', borderRadius: '12px', textAlign: 'center', color: 'var(--success)' }}>
              حالة الربط: يمكنك التحقق من ربط هذا الموظف. في حال لم يكن مرتبطاً اضغط لتوليد الاستجابة.
            </div>
          )}

          {/* QR Code Display Container */}
          {qrString && (
            <div style={{ 
              background: '#fff', padding: '1.5rem', borderRadius: '12px', 
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' 
            }}>
              <QRCodeSVG value={qrString} size={220} level="H" />
              <p style={{ margin: 0, color: '#333', fontSize: '0.9rem', fontWeight: 'bold', textAlign: 'center' }}>
                يرجى مسح هذا الرمز باستخدام "الأجهزة المرتبطة" بالهاتف المخصص للموظف المختار.
              </p>
            </div>
          )}
        </div>

      </div>

      {/* Platform Activity Overview */}
      <h3 style={{ marginBottom: '1rem', color: 'var(--brand-secondary)' }}>نظرة عامة على نشاط المنصة اليوم</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
        <div style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid var(--glass-border)', padding: '1.5rem', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '1rem' }}>
           <div style={{ padding: '0.8rem', background: 'rgba(59, 130, 246, 0.2)', borderRadius: '10px', color: 'var(--brand-primary)' }}><MessageSquare size={24} /></div>
           <div><p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>إجمالي الرسائل (اليوم)</p><h3 style={{ margin: '0.3rem 0 0', fontSize: '1.5rem' }}>1,240</h3></div>
        </div>
        <div style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid var(--glass-border)', padding: '1.5rem', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '1rem' }}>
           <div style={{ padding: '0.8rem', background: 'rgba(16, 185, 129, 0.2)', borderRadius: '10px', color: 'var(--success)' }}><CheckCircle size={24} /></div>
           <div><p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>الطلبات المنجزة المكتملة</p><h3 style={{ margin: '0.3rem 0 0', fontSize: '1.5rem' }}>45</h3></div>
        </div>
        <div style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid var(--glass-border)', padding: '1.5rem', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '1rem' }}>
           <div style={{ padding: '0.8rem', background: 'rgba(239, 68, 68, 0.2)', borderRadius: '10px', color: 'var(--danger)' }}><ShieldAlert size={24} /></div>
           <div><p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>طلبات معلقة / مشاكل</p><h3 style={{ margin: '0.3rem 0 0', fontSize: '1.5rem' }}>8</h3></div>
        </div>
        <div style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid var(--glass-border)', padding: '1.5rem', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '1rem' }}>
           <div style={{ padding: '0.8rem', background: 'rgba(168, 85, 247, 0.2)', borderRadius: '10px', color: '#a855f7' }}><Clock size={24} /></div>
           <div><p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>متوسط سرعة الاستجابة</p><h3 style={{ margin: '0.3rem 0 0', fontSize: '1.5rem' }}>دقيقتان</h3></div>
        </div>
      </div>

      {/* Live Monitoring */}
      <div className="glass-panel" style={{ flex: 1, padding: '2rem', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
          <ShieldAlert size={28} color="var(--warning)" />
          <h3 style={{ margin: 0 }}>الرقابة الفورية للموظفين (Live)</h3>
        </div>
        
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right' }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.02)', color: 'var(--text-secondary)' }}>
              <th style={{ padding: '1rem', borderBottom: '1px solid var(--glass-border)' }}>الموظف</th>
              <th style={{ padding: '1rem', borderBottom: '1px solid var(--glass-border)' }}>حالة الاتصال (الواتساب)</th>
              <th style={{ padding: '1rem', borderBottom: '1px solid var(--glass-border)' }}>نشاط المحادثات (اليوم)</th>
              <th style={{ padding: '1rem', borderBottom: '1px solid var(--glass-border)' }}>الطلبات المعالجة</th>
              <th style={{ padding: '1rem', borderBottom: '1px solid var(--glass-border)' }}>إجراءات المراقب</th>
            </tr>
          </thead>
          <tbody>
            {[
              { id: 'emp1', name: 'محمد عبدالعزيز' },
              { id: 'emp2', name: 'سارة الخالد' },
              { id: 'emp3', name: 'عبدالله الفهد' }
            ].map(emp => (
              <tr key={emp.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', transition: 'background 0.2s' }} className="hover:bg-slate-800/30">
                <td style={{ padding: '1rem', fontWeight: 600 }}>{emp.name}</td>
                <td style={{ padding: '1rem' }}>
                  {employeeStatuses[emp.id]?.isConnected ? (
                    <span style={{ color: 'var(--success)', background: 'rgba(16,185,129,0.1)', padding: '4px 10px', borderRadius: '10px', fontSize: '0.85rem' }}>متصل ونشط</span>
                  ) : (
                    <span style={{ color: 'var(--danger)', background: 'rgba(239,68,68,0.1)', padding: '4px 10px', borderRadius: '10px', fontSize: '0.85rem' }}>غير متصل</span>
                  )}
                </td>
                <td style={{ padding: '1rem', color: employeeStatuses[emp.id]?.isConnected ? 'var(--success)' : 'var(--text-secondary)' }}>
                  {employeeStatuses[emp.id]?.isConnected ? <Activity size={16} style={{ display: 'inline', marginLeft: '5px' }} /> : '--'} 
                  {employeeStatuses[emp.id]?.isConnected ? ' محادثة نشطة' : '--'}
                </td>
                <td style={{ padding: '1rem' }}>--</td>
                <td style={{ padding: '1rem' }}>
                  <button style={{ color: 'var(--brand-secondary)', background: 'rgba(6, 182, 212, 0.1)', padding: '0.4rem 1rem', borderRadius: '8px', border: '1px solid var(--brand-secondary)' }}>تجسس حي (مراقبة)</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}
