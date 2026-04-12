import React, { useState, useEffect } from 'react';
import { DollarSign, Search, Filter, CheckCircle, XCircle, FileText, Download, TrendingUp, AlertTriangle, RefreshCw } from 'lucide-react';
import { auth } from '../firebase';

export default function Receipts() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(true);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(user => {
      if (user) {
        const adminStatus = user.email === 'yazans95@gmail.com' || user.email === 'zyrozyro98@gmail.com';
        setIsAdmin(adminStatus);
      } else {
        setIsAdmin(false);
      }
      setCheckingAdmin(false);
    });
    return () => unsub();
  }, []);
  const [activeTab, setActiveTab] = useState('الكل');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewingReceipt, setViewingReceipt] = useState(null);

  const [receipts, setReceipts] = useState([
    { id: 'REC-12001', studentName: 'أحمد صالح', amount: 1500, status: 'مدفوع', date: '2026-04-05', note: 'الدفعة الأولى', imgUrl: 'https://images.unsplash.com/photo-1544396821-4dd40b938ad3?w=400&q=80' },
    { id: 'REC-12002', studentName: 'سارة خالد', amount: 3000, status: 'غير مدفوع', date: '2026-04-01', note: 'رسوم التسجيل الكاملة', imgUrl: null },
    { id: 'REC-12003', studentName: 'فهد محمد', amount: 1500, status: 'مدفوع', date: '2026-04-06', note: 'الدفعة الأولى', imgUrl: 'https://images.unsplash.com/photo-1544396821-4dd40b938ad3?w=400&q=80' },
  ]);

  const handleMarkAsPaid = (id) => {
    setReceipts(prev => prev.map(r => r.id === id ? { ...r, status: 'مدفوع', date: new Date().toISOString().split('T')[0] } : r));
    alert('تم تحصيل المبلغ وتحويل حالة الإيصال إلى مدفوع بنجاح.');
  };

  const totalPaid = receipts.filter(r => r.status === 'مدفوع').reduce((acc, curr) => acc + curr.amount, 0);
  const totalUnpaid = receipts.filter(r => r.status === 'غير مدفوع').reduce((acc, curr) => acc + curr.amount, 0);

  const filteredReceipts = receipts
    .filter(r => activeTab === 'الكل' || r.status === activeTab)
    .filter(r => searchTerm === '' || r.studentName.includes(searchTerm) || r.id.includes(searchTerm));

  if (checkingAdmin) {
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
          <p style={{ color: 'rgba(255,255,255,0.6)' }}>هذه الصفحة مخصصة للمسؤولين فقط لإدارة الحسابات المالية والإيصالات.</p>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="animate-fade-in-up" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: '2rem' }}>
        <h1 style={{ margin: 0 }}>نظام الإيصالات والتقارير المالية</h1>
        <button className="btn-primary">
          <DollarSign size={18} /> إصدار إيصال جديد
        </button>
      </div>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', borderLeft: '4px solid var(--brand-primary)' }}>
          <div style={{ width: '50px', height: '50px', borderRadius: '12px', background: 'rgba(59, 130, 246, 0.2)', color: 'var(--brand-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <TrendingUp size={24} />
          </div>
          <div>
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>إجمالي المطالبات</p>
            <h2 style={{ margin: 0 }}>{totalPaid + totalUnpaid} ر.س</h2>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', borderLeft: '4px solid var(--success)' }}>
          <div style={{ width: '50px', height: '50px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.2)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckCircle size={24} />
          </div>
          <div>
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>مبالغ مدفوعة</p>
            <h2 style={{ margin: 0 }}>{totalPaid} ر.س</h2>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', borderLeft: '4px solid var(--danger)' }}>
          <div style={{ width: '50px', height: '50px', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.2)', color: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <XCircle size={24} />
          </div>
          <div>
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>مبالغ متبقية (غير مدفوعة)</p>
            <h2 style={{ margin: 0 }}>{totalUnpaid} ر.س</h2>
          </div>
        </div>
      </div>

      {/* Main Table Area */}
      <div className="glass-panel" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <div style={{ position: 'relative', width: '300px' }}>
              <input type="text" className="input-base" placeholder="البحث برقم الإيصال أو اسم الطالب..." style={{ paddingRight: '2rem', padding: '0.5rem 2.5rem 0.5rem 0.5rem', width: '100%' }} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
              <Search size={16} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            </div>
            
            <div className="flex gap-2" style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '0.3rem', borderRadius: '10px' }}>
              {['الكل', 'مدفوع', 'غير مدفوع'].map(tab => (
                <button 
                  key={tab}
                  style={{
                    padding: '0.3rem 1rem', borderRadius: '8px',
                    background: activeTab === tab ? 'var(--brand-primary)' : 'transparent',
                    color: activeTab === tab ? '#fff' : 'var(--text-secondary)'
                  }}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          <button style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.05)', color: '#fff', padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
            <Download size={16} /> تصدير التقرير
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.02)', color: 'var(--text-secondary)' }}>
                <th style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--glass-border)' }}>رقم الإيصال</th>
                <th style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--glass-border)' }}>تاريخ الاستحقاق/الدفع</th>
                <th style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--glass-border)' }}>الطالب</th>
                <th style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--glass-border)' }}>المبلغ</th>
                <th style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--glass-border)' }}>الحالة</th>
                <th style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--glass-border)' }}>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filteredReceipts.map(receipt => (
                <tr key={receipt.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }} className="hover:bg-slate-800/30">
                  <td style={{ padding: '1rem 1.5rem', fontWeight: 600 }}>{receipt.id}</td>
                  <td style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)' }}>{receipt.date}</td>
                  <td style={{ padding: '1rem 1.5rem' }}>
                    <div>{receipt.studentName}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{receipt.note}</div>
                  </td>
                  <td style={{ padding: '1rem 1.5rem', fontWeight: 600 }}>{receipt.amount} ر.س</td>
                  <td style={{ padding: '1rem 1.5rem' }}>
                    <span style={{ 
                      background: receipt.status === 'مدفوع' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                      color: receipt.status === 'مدفوع' ? 'var(--success)' : 'var(--danger)',
                      padding: '4px 12px', borderRadius: '12px', fontSize: '0.85rem', fontWeight: 'bold'
                    }}>
                      {receipt.status}
                    </span>
                  </td>
                  <td style={{ padding: '1rem 1.5rem', display: 'flex', gap: '0.5rem' }}>
                    <button onClick={() => setViewingReceipt(receipt)} style={{ background: 'rgba(255,255,255,0.1)', padding: '0.5rem', borderRadius: '8px', color: '#fff' }} title="عرض الإيصال">
                      <FileText size={18} />
                    </button>
                    {receipt.status === 'غير مدفوع' && (
                      <button onClick={() => handleMarkAsPaid(receipt.id)} style={{ background: 'rgba(16, 185, 129, 0.2)', padding: '0.5rem', borderRadius: '8px', color: 'var(--success)' }} title="تحصيل وتغيير كمدفوع">
                        <CheckCircle size={18} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredReceipts.length === 0 && (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>لا تتوفر إيصالات تطابق البحث أو الفلتر المختار</div>
        )}
      </div>
    </div>

      {/* Viewing Receipt Popup Modal */}
      {viewingReceipt && (
        <div className="animate-fade-in-up" style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center', backdropFilter: 'blur(5px)' }}>
          <div className="glass-panel" style={{ width: '500px', maxWidth: '90%', padding: '2rem', borderRadius: '16px', position: 'relative', background: 'rgba(15, 23, 42, 0.95)' }}>
            <button style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }} onClick={() => setViewingReceipt(null)}>
              <XCircle size={24} />
            </button>
            <h2 style={{ marginTop: 0, marginBottom: '1.5rem', color: 'var(--brand-secondary)' }}>تفاصيل الإيصال - {viewingReceipt.id}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.8rem' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>اسم الطالب:</span>
                <strong style={{ fontSize: '1.1rem' }}>{viewingReceipt.studentName}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.8rem' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>المبلغ المالي:</span>
                <strong style={{ fontSize: '1.1rem', color: 'var(--success)' }}>{viewingReceipt.amount} ر.س</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.8rem' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>تفاصيل المستحقات:</span>
                <strong style={{ fontSize: '1.1rem' }}>{viewingReceipt.note}</strong>
              </div>
              
              <div style={{ marginTop: '1rem', background: 'rgba(0,0,0,0.3)', borderRadius: '12px', padding: '1rem', textAlign: 'center' }}>
                <h4 style={{ margin: '0 0 1rem 0' }}>مرفق الإيصال / السند</h4>
                {viewingReceipt.imgUrl ? (
                   <img src={viewingReceipt.imgUrl} alt="Receipt Content" style={{ maxWidth: '100%', maxHeight: '350px', borderRadius: '8px', border: '1px solid var(--glass-border)' }} />
                ) : (
                   <div style={{ padding: '2rem', color: 'var(--text-secondary)' }}>
                     <FileText size={48} style={{ opacity: 0.5, margin: '0 auto 1rem' }} />
                     لا يوجد مرفق مصور متاح لهذا الإيصال
                   </div>
                )}
              </div>
            </div>
            <button className="btn-primary" style={{ width: '100%', marginTop: '1.5rem', display: 'flex', justifyContent: 'center', gap: '0.5rem', background: 'var(--brand-primary)', padding: '1rem', borderRadius: '12px' }} onClick={() => window.print()}>
              <Download size={18} /> طباعة السند المالي
            </button>
          </div>
        </div>
      )}
    </>
  );
}
