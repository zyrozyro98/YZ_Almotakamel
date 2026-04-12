import React, { useState, useEffect } from 'react';
import { 
  FileDown, Users, ShieldAlert, Activity, ArrowDownToLine, 
  QrCode, TrendingUp, BarChart3, Clock, MessageSquare, 
  CheckCircle, ShieldCheck, RefreshCw, Send
} from 'lucide-react';
import axios from 'axios';
import { QRCodeSVG } from 'qrcode.react';
import { db } from '../firebase';
import { collection, onSnapshot, query, orderBy, getDocs } from 'firebase/firestore';

export default function Reports() {
  const [employees, setEmployees] = useState([]);
  const [selectedEmp, setSelectedEmp] = useState('');
  const [qrString, setQrString] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [employeeStatuses, setEmployeeStatuses] = useState({});
  const [platformStats, setPlatformStats] = useState({
    totalStudents: 0,
    totalOrders: 0,
    activeSessions: 0
  });

  const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

  useEffect(() => {
    // 1. Fetch Employees
    const unsubEmps = onSnapshot(collection(db, 'employees'), (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setEmployees(list);
      if (list.length > 0 && !selectedEmp) setSelectedEmp(list[0].id);
    });

    // 2. Platform Stats
    const unsubStudents = onSnapshot(collection(db, 'students'), (snap) => {
      setPlatformStats(prev => ({ ...prev, totalStudents: snap.size }));
    });
    
    const unsubOrders = onSnapshot(collection(db, 'orders'), (snap) => {
      setPlatformStats(prev => ({ ...prev, totalOrders: snap.size }));
    });

    return () => { unsubEmps(); unsubStudents(); unsubOrders(); };
  }, []);

  useEffect(() => {
    const fetchStatuses = async () => {
      if (employees.length === 0) return;
      const statuses = {};
      for (const emp of employees) {
        const eid = emp.email?.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');
        if (!eid) continue;
        try {
          const res = await axios.get(`${BASE_URL}/api/whatsapp/status/${eid}`);
          statuses[emp.id] = res.data;
        } catch (err) {
          statuses[emp.id] = { isConnected: false };
        }
      }
      setEmployeeStatuses(statuses);
      setPlatformStats(prev => ({
        ...prev,
        activeSessions: Object.values(statuses).filter(s => s.isConnected).length
      }));
    };
    
    fetchStatuses();
    const interval = setInterval(fetchStatuses, 15000);
    return () => clearInterval(interval);
  }, [employees]);

  const handleGenerateQR = async () => {
    const emp = employees.find(e => e.id === selectedEmp);
    if (!emp) return;
    
    const eid = emp.email?.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');
    setIsLoading(true);
    setQrString('');
    try {
      const res = await axios.post(`${BASE_URL}/api/whatsapp/init`, { employeeId: eid });
      if (res.data.status === 'qr_generated') setQrString(res.data.qr);
      else if (res.data.status === 'connected') alert('هذا الحساب مرتبط بالفعل.');
    } catch (err) {
      alert('خطأ في الاتصال بالسيرفر.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      const snap = await getDocs(query(collection(db, 'students'), orderBy('createdAt', 'desc')));
      let csv = "\uFEFFالاسم,الهاتف,الجامعة,التخصص,تاريخ الإضافة\n";
      snap.docs.forEach(doc => {
        const d = doc.data();
        const date = d.createdAt ? new Date(d.createdAt.seconds * 1000).toLocaleDateString('ar-SA') : '-';
        csv += `"${d.name}","${d.phone}","${d.university}","${d.major}","${date}"\n`;
      });
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `تقرير_الطلاب_${new Date().toISOString().slice(0,10)}.csv`;
      a.click();
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in-up">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black text-white mb-2 flex items-center gap-3">
             <BarChart3 className="text-brand-secondary" /> الرقابة والتقارير العامة
          </h1>
          <p className="text-white/50 text-sm font-medium">متابعة أجهزة الموظفين، تصدير البيانات، وتحليل أداء المنصة.</p>
        </div>
      </div>

      {/* Hero Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          { label: 'إجمالي المسجلين', value: platformStats.totalStudents, icon: <Users />, color: 'var(--brand-primary)' },
          { label: 'جلسات العمل النشطة', value: platformStats.activeSessions, icon: <Activity />, color: 'var(--success)' },
          { label: 'طلبات مكتملة', value: platformStats.totalOrders, icon: <CheckCircle />, color: 'var(--info)' },
          { label: 'رسائل قيد المعالجة', value: '---', icon: <MessageSquare />, color: 'var(--brand-secondary)' },
        ].map((s, i) => (
          <div key={i} className="glass-panel p-6 flex items-center gap-5 hover-card">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white" style={{ background: s.color }}>
              {s.icon}
            </div>
            <div>
              <p className="text-[10px] font-black uppercase text-white/30 tracking-widest">{s.label}</p>
              <h3 className="text-2xl font-black text-white">{s.value}</h3>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Export Section */}
        <div className="glass-panel p-8">
          <div className="flex items-center gap-4 mb-6">
            <FileDown className="text-brand-secondary" size={32} />
            <h3 className="text-xl font-bold text-white">تصدير قاعدة البيانات</h3>
          </div>
          <p className="text-white/40 text-xs mb-8 leading-relaxed">
            يمكنك تحميل كافة بيانات الطلاب والطلبات المسجلة في النظام بصيغة CSV متوافقة مع برنامج Excel، المخرجات تدعم اللغة العربية بالكامل.
          </p>
          <button 
            onClick={handleExportCSV}
            disabled={isExporting}
            className="w-full btn-primary py-4 flex items-center justify-center gap-3 shadow-[0_10px_30px_rgba(59,130,246,0.2)]"
          >
            <ArrowDownToLine size={20} /> {isExporting ? 'جاري التحميل...' : 'تحميل التقرير الكامل (Excel)'}
          </button>
        </div>

        {/* WhatsApp QR Management Section */}
        <div className="glass-panel p-8 border-brand-primary/20 bg-brand-primary/5">
          <div className="flex items-center gap-4 mb-6">
            <QrCode className="text-brand-primary" size={32} />
            <h3 className="text-xl font-bold text-white">إدارة ربط الموظفين</h3>
          </div>
          <div className="space-y-4">
            <div className="flex gap-4">
              <select 
                className="input-base flex-1 font-bold text-sm"
                value={selectedEmp}
                onChange={(e) => { setSelectedEmp(e.target.value); setQrString(''); }}
              >
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name} | @{emp.email?.split('@')[0]}</option>
                ))}
              </select>
              <button onClick={handleGenerateQR} disabled={isLoading} className="btn-primary min-w-[150px]">
                {isLoading ? '...' : <><QrCode size={18} /> توليد QR</>}
              </button>
            </div>
            
            {qrString ? (
              <div className="bg-white p-6 rounded-2xl flex flex-col items-center gap-4 animate-scale-in">
                 <QRCodeSVG value={qrString} size={200} level="H" />
                 <p className="text-black font-black text-[10px] text-center">امسح الكود لربط واتساب الموظف المختار</p>
              </div>
            ) : (
              <div className="p-10 border-2 border-dashed border-white/5 rounded-2xl text-center opacity-20">
                <ShieldCheck size={48} className="mx-auto mb-2" />
                <p className="text-xs font-bold">جاهز لعملية الربط</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Live Monitoring Table */}
      <div className="glass-panel overflow-hidden">
        <div className="p-6 border-b border-white/5 flex items-center justify-between">
           <h3 className="text-lg font-bold text-white flex items-center gap-3">
              <Activity className="text-success" /> حالة الربط الفوري (Live)
           </h3>
           <button className="p-2 hover:bg-white/5 rounded-xl transition-all text-white/20"><RefreshCw size={18} /></button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead>
              <tr className="bg-white/5 text-[10px] uppercase font-black text-white/30">
                <th className="p-5">الموظف</th>
                <th className="p-5">حالة الاتصال</th>
                <th className="p-5">إصدار Baileys</th>
                <th className="p-5 text-left">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {employees.map(emp => {
                const status = employeeStatuses[emp.id];
                return (
                  <tr key={emp.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="p-5 text-sm font-bold text-white">{emp.name}</td>
                    <td className="p-5">
                       {status?.isConnected ? (
                         <span className="badge badge-success"><div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse"></div> متصل الآن</span>
                       ) : (
                         <span className="badge badge-danger">غير متصل</span>
                       )}
                    </td>
                    <td className="p-5 text-[10px] font-mono text-white/20">
                      {status?.isConnected ? 'v2.3000.1035' : '--'}
                    </td>
                    <td className="p-5 text-left">
                       <button className="btn-secondary py-1.5 px-4 text-[10px] font-black border-brand-secondary/30 text-brand-secondary hover:bg-brand-secondary/10">
                          <Send size={12} /> تجسس (مراقبة)
                       </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
