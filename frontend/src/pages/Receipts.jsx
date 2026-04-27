import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  DollarSign, Search, Filter, CheckCircle, XCircle, FileText, 
  Download, TrendingUp, AlertTriangle, RefreshCw, Plus, 
  Trash2, Printer, CreditCard, Calendar, User, ClipboardList,
  ArrowRight, Landmark, Settings, MessageCircle, Phone
} from 'lucide-react';
import { auth, db } from '../firebase';
import { 
  collection, onSnapshot, doc, getDoc, addDoc, 
  updateDoc, deleteDoc, query, orderBy, serverTimestamp 
} from 'firebase/firestore';

export default function Receipts() {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [receipts, setReceipts] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [activeTab, setActiveTab] = useState('الكل');
  const [searchTerm, setSearchTerm] = useState('');
  const [bankFilter, setBankFilter] = useState('الكل');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  
  const [viewingReceipt, setViewingReceipt] = useState(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isManagingBanks, setIsManagingBanks] = useState(false);
  const [loading, setLoading] = useState(false);
  const [newBankName, setNewBankName] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    studentName: '',
    studentPhone: '',
    amount: '',
    category: 'رسوم تسجيل',
    note: '',
    status: 'مدفوع',
    bankAccount: ''
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
        } catch (e) {}
        setIsAdmin(adminStatus);
      } else {
        setIsAdmin(false);
      }
      setCheckingAdmin(false);
    });
    return () => unsub();
  }, []);

  // Fetch Receipts from Firestore
  useEffect(() => {
    const q = query(collection(db, 'receipts'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        // System registration date
        date: doc.data().createdAt ? new Date(doc.data().createdAt.seconds * 1000).toLocaleDateString('ar-SA') : 'اليوم',
        isoDate: doc.data().createdAt ? new Date(doc.data().createdAt.seconds * 1000).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
      }));
      setReceipts(data);
    });
    return () => unsubscribe();
  }, []);

  // Fetch Bank Accounts from Firestore
  useEffect(() => {
    const q = query(collection(db, 'bankAccounts'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setBankAccounts(data);
      if (data.length > 0 && !formData.bankAccount) {
        setFormData(prev => ({ ...prev, bankAccount: data[0].name }));
      }
    });
    return () => unsubscribe();
  }, [formData.bankAccount]);

  const handleAddReceipt = async (e) => {
    e.preventDefault();
    if (!formData.studentName || !formData.amount) return alert('يرجى ملء الحقول الأساسية');
    
    setLoading(true);
    try {
      await addDoc(collection(db, 'receipts'), {
        ...formData,
        amount: parseFloat(formData.amount),
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser?.email || 'Admin'
      });
      setIsAdding(false);
      setFormData({ 
        studentName: '', studentPhone: '', amount: '', category: 'رسوم تسجيل', 
        note: '', status: 'مدفوع', 
        bankAccount: bankAccounts.length > 0 ? bankAccounts[0].name : ''
      });
      alert('تم إصدار الإيصال بنجاح');
    } catch (err) {
      console.error(err);
      alert('حدث خطأ أثناء إضافة الإيصال');
    } finally {
      setLoading(false);
    }
  };

  const handleAddBank = async () => {
    if (!newBankName) return;
    try {
      await addDoc(collection(db, 'bankAccounts'), { name: newBankName });
      setNewBankName('');
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteBank = async (id) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا الحساب البنكي؟')) return;
    try {
      await deleteDoc(doc(db, 'bankAccounts', id));
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkAsPaid = async (id) => {
    if (!window.confirm('هل أنت متأكد من تغيير حالة هذا الإيصال إلى مدفوع؟')) return;
    try {
      await updateDoc(doc(db, 'receipts', id), { status: 'مدفوع' });
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteReceipt = async (id) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا الإيصال نهائياً؟')) return;
    try {
      await deleteDoc(doc(db, 'receipts', id));
    } catch (err) {
      console.error(err);
    }
  };

  const handleExportCSV = () => {
    let csvContent = "\uFEFF"; 
    csvContent += "رقم الإيصال,اسم الطالب,رقم الهاتف,المبلغ,الفئة,الحالة,الحساب البنكي,تاريخ التسجيل,ملاحظات\n";
    
    filteredReceipts.forEach(r => {
      const row = `"${r.id}","${r.studentName}","${r.studentPhone || ''}","${r.amount}","${r.category}","${r.status}","${r.bankAccount || ''}","${r.date}","${r.note || ''}"`;
      csvContent += row + "\n";
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `تقرير_مالي_${new Date().toLocaleDateString('en-GB')}.csv`);
    link.click();
  };

  const totalPaid = receipts.filter(r => r.status === 'مدفوع').reduce((acc, curr) => acc + curr.amount, 0);
  const totalUnpaid = receipts.filter(r => r.status === 'غير مدفوع').reduce((acc, curr) => acc + curr.amount, 0);

  const filteredReceipts = receipts.filter(r => {
    const matchesTab = activeTab === 'الكل' || r.status === activeTab;
    const matchesSearch = searchTerm === '' || r.studentName.toLowerCase().includes(searchTerm.toLowerCase()) || r.id.includes(searchTerm);
    const matchesBank = bankFilter === 'الكل' || r.bankAccount === bankFilter;
    
    let matchesDate = true;
    if (dateFrom || dateTo) {
      const rDate = new Date(r.isoDate);
      if (dateFrom && rDate < new Date(dateFrom)) matchesDate = false;
      if (dateTo && rDate > new Date(dateTo)) matchesDate = false;
    }

    return matchesTab && matchesSearch && matchesBank && matchesDate;
  });

  if (checkingAdmin) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#fff' }}>
        <RefreshCw size={40} className="animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="animate-fade-in-up" style={{ padding: '40px', textAlign: 'center' }}>
        <div className="glass-panel" style={{ padding: '4rem', maxWidth: '600px', margin: '0 auto', border: '1px solid var(--danger)' }}>
          <AlertTriangle size={80} color="var(--danger)" style={{ marginBottom: '2rem' }} />
          <h2 style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>الوصول مرفوض</h2>
          <p style={{ fontSize: '1.2rem', opacity: 0.8 }}>عذراً، هذه الصفحة مخصصة للمسؤولين الماليين فقط.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* Header Area */}
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ fontSize: '2.2rem', fontWeight: 900, marginBottom: '0.5rem', background: 'linear-gradient(to left, #fff, var(--brand-secondary))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            نظام الإيصالات والتقارير المالية
          </h1>
          <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}>إدارة التدفقات المالية، الحسابات البنكية، وتحليل الإيرادات.</p>
        </div>
        <div className="flex gap-3">
          <button className="btn-secondary" onClick={() => setIsManagingBanks(true)}>
            <Settings size={18} /> إدارة الحسابات البنكية
          </button>
          <button className="btn-primary" onClick={() => setIsAdding(true)}>
            <Plus size={20} /> إصدار سند مالي جديد
          </button>
        </div>
      </div>

      {/* Financial Summary Cards */}
      <div className="grid grid-cols-3 sm-grid-cols-1">
        <div className="glass-panel" style={{ padding: '1.8rem', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: '-10px', left: '-10px', opacity: 0.05, transform: 'scale(4)' }}><TrendingUp size={48} /></div>
          <p style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>إجمالي الإيرادات المتوقعة</p>
          <h2 style={{ fontSize: '2.4rem', fontWeight: 900, color: '#fff' }}>{(totalPaid + totalUnpaid).toLocaleString()} <span style={{ fontSize: '1rem' }}>ر.س</span></h2>
          <div style={{ fontSize: '0.8rem', color: 'var(--info)', marginTop: '0.8rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <ClipboardList size={14} /> بناءً على {receipts.length} سند مالي
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '1.8rem', position: 'relative', overflow: 'hidden', borderRight: '5px solid var(--success)' }}>
          <p style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>المبالغ المحصلة (فعلي)</p>
          <h2 style={{ fontSize: '2.4rem', fontWeight: 900, color: 'var(--success)' }}>{totalPaid.toLocaleString()} <span style={{ fontSize: '1rem' }}>ر.س</span></h2>
          <div style={{ fontSize: '0.8rem', color: 'var(--success)', marginTop: '0.8rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <CheckCircle size={14} /> تم تأكيد استلامها
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '1.8rem', position: 'relative', overflow: 'hidden', borderRight: '5px solid var(--danger)' }}>
          <p style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>مبالغ قيد الانتظار</p>
          <h2 style={{ fontSize: '2.4rem', fontWeight: 900, color: 'var(--danger)' }}>{totalUnpaid.toLocaleString()} <span style={{ fontSize: '1rem' }}>ر.س</span></h2>
          <div style={{ fontSize: '0.8rem', color: 'var(--danger)', marginTop: '0.8rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <AlertTriangle size={14} /> ذمم مالية معلقة
          </div>
        </div>
      </div>

      {/* Advanced Filters */}
      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', alignItems: 'flex-end' }}>
          <div>
            <label className="input-label">بحث سريع</label>
            <div style={{ position: 'relative' }}>
              <input type="text" className="input-base" placeholder="الاسم أو رقم السند..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ paddingRight: '2.5rem' }} />
              <Search size={16} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            </div>
          </div>
          <div>
            <label className="input-label">تصفية حسب الحالة</label>
            <select className="input-base" value={activeTab} onChange={e => setActiveTab(e.target.value)}>
              <option value="الكل">جميع الحالات</option>
              <option value="مدفوع">مدفوع فقط</option>
              <option value="غير مدفوع">غير مدفوع فقط</option>
            </select>
          </div>
          <div>
            <label className="input-label">الحساب البنكي</label>
            <select className="input-base" value={bankFilter} onChange={e => setBankFilter(e.target.value)}>
              <option value="الكل">جميع الحسابات</option>
              {bankAccounts.map(bank => <option key={bank.id} value={bank.name}>{bank.name}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
             <div style={{ flex: 1 }}>
               <label className="input-label">من تاريخ</label>
               <input type="date" className="input-base" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
             </div>
             <div style={{ flex: 1 }}>
               <label className="input-label">إلى تاريخ</label>
               <input type="date" className="input-base" value={dateTo} onChange={e => setDateTo(e.target.value)} />
             </div>
          </div>
        </div>
      </div>

      {/* Main Table Content */}
      <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}><ClipboardList size={20} style={{ display: 'inline', marginLeft: '10px' }} /> سجل الحركات المالية ({filteredReceipts.length})</h3>
          <button onClick={handleExportCSV} className="btn-secondary" style={{ padding: '0.6rem 1.2rem' }}>
            <Download size={18} /> تصدير النتائج
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>رقم السند</th>
                <th>الطالب / الهاتف</th>
                <th>البنك / النوع</th>
                <th>المبلغ</th>
                <th>الحالة</th>
                <th>تاريخ التسجيل</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filteredReceipts.map(receipt => (
                <tr key={receipt.id}>
                  <td style={{ fontWeight: 800, color: 'var(--brand-secondary)' }}>#{receipt.id.substring(0, 8).toUpperCase()}</td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                       <span style={{ fontWeight: 700 }}>{receipt.studentName}</span>
                       <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Phone size={12} /> {receipt.studentPhone || 'غير مسجل'}
                       </span>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                       <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{receipt.bankAccount || 'غير محدد'}</span>
                       <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{receipt.category}</span>
                    </div>
                  </td>
                  <td style={{ fontWeight: 900, color: '#fff', fontSize: '1.1rem' }}>{receipt.amount.toLocaleString()} <span style={{ fontSize: '0.75rem', fontWeight: 400 }}>ر.س</span></td>
                  <td>
                    <span style={{ 
                      background: receipt.status === 'مدفوع' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                      color: receipt.status === 'مدفوع' ? 'var(--success)' : 'var(--danger)',
                      padding: '5px 12px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 'bold'
                    }}>
                      {receipt.status}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{receipt.date}</td>
                  <td>
                    <div className="flex gap-2">
                      <button onClick={() => setViewingReceipt(receipt)} style={{ background: 'rgba(59, 130, 246, 0.1)', color: 'var(--brand-primary)', padding: '6px', borderRadius: '8px' }} title="عرض وطباعة">
                        <FileText size={18} />
                      </button>
                      {receipt.studentPhone && (
                        <button onClick={() => navigate(`/chat?select=${receipt.studentPhone}`)} style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)', padding: '6px', borderRadius: '8px' }} title="فتح الدردشة">
                          <MessageCircle size={18} />
                        </button>
                      )}
                      {receipt.status === 'غير مدفوع' && (
                        <button onClick={() => handleMarkAsPaid(receipt.id)} style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)', padding: '6px', borderRadius: '8px' }} title="تحصيل">
                          <CheckCircle size={18} />
                        </button>
                      )}
                      <button onClick={() => handleDeleteReceipt(receipt.id)} style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', padding: '6px', borderRadius: '8px' }} title="حذف">
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredReceipts.length === 0 && (
            <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <Search size={48} style={{ opacity: 0.1, marginBottom: '1rem' }} />
              <p>لم يتم العثور على أي نتائج تطابق التصفية</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal: Add New Receipt */}
      {isAdding && (
        <div className="animate-fade-in" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '700px', padding: '2.5rem', animation: 'slideUp 0.4s forwards' }}>
            <div className="flex justify-between items-center mb-6">
              <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}><Plus color="var(--brand-secondary)" /> إصدار سند مالي جديد</h2>
              <button onClick={() => setIsAdding(false)} style={{ background: 'none', color: 'var(--text-secondary)' }}><XCircle size={24} /></button>
            </div>

            <form onSubmit={handleAddReceipt} className="flex flex-col gap-5">
              <div className="grid grid-cols-2 sm-grid-cols-1">
                <div>
                  <label className="input-label">اسم الطالب المستلم منه</label>
                  <div style={{ position: 'relative' }}>
                    <User size={18} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                    <input 
                      type="text" className="input-base" style={{ paddingRight: '2.5rem' }} required 
                      value={formData.studentName} onChange={e => setFormData({...formData, studentName: e.target.value})}
                      placeholder="الاسم الكامل للطالب"
                    />
                  </div>
                </div>
                <div>
                  <label className="input-label">رقم هاتف الطالب</label>
                  <div style={{ position: 'relative' }}>
                    <Phone size={18} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                    <input 
                      type="text" className="input-base" style={{ paddingRight: '2.5rem' }}
                      value={formData.studentPhone} onChange={e => setFormData({...formData, studentPhone: e.target.value})}
                      placeholder="966..."
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm-grid-cols-1">
                <div>
                  <label className="input-label">المبلغ المالي (ر.س)</label>
                  <div style={{ position: 'relative' }}>
                    <DollarSign size={18} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--success)' }} />
                    <input 
                      type="number" className="input-base" style={{ paddingRight: '2.5rem' }} required 
                      value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})}
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div>
                  <label className="input-label">فئة السند</label>
                  <select className="input-base" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})}>
                    <option value="رسوم تسجيل">رسوم تسجيل</option>
                    <option value="دفعة قسط">دفعة قسط</option>
                    <option value="رسوم خدمة إضافية">رسوم خدمة إضافية</option>
                    <option value="تأمين">تأمين</option>
                    <option value="أخرى">أخرى</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 sm-grid-cols-1">
                <div>
                  <label className="input-label">الحساب البنكي</label>
                  <select className="input-base" value={formData.bankAccount} onChange={e => setFormData({...formData, bankAccount: e.target.value})}>
                    <option value="" disabled>اختر البنك...</option>
                    {bankAccounts.map(bank => <option key={bank.id} value={bank.name}>{bank.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="input-label">الحالة الأولية</label>
                  <select className="input-base" value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}>
                    <option value="مدفوع">مدفوع (تم الاستلام)</option>
                    <option value="غير مدفوع">غير مدفوع (مطالبة)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="input-label">ملاحظات إضافية</label>
                <textarea 
                  className="input-base" style={{ height: '80px', resize: 'none' }}
                  value={formData.note} onChange={e => setFormData({...formData, note: e.target.value})}
                  placeholder="اكتب أي تفاصيل إضافية هنا..."
                ></textarea>
              </div>

              <button className="btn-primary w-full" type="submit" disabled={loading} style={{ padding: '1rem', marginTop: '1rem' }}>
                {loading ? <RefreshCw className="animate-spin" /> : <><CheckCircle size={20} /> تأكيد وإصدار السند مالي</>}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Manage Bank Accounts */}
      {isManagingBanks && (
        <div className="animate-fade-in" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '500px', padding: '2rem', animation: 'slideUp 0.4s forwards' }}>
            <div className="flex justify-between items-center mb-6">
              <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}><Landmark color="var(--brand-secondary)" /> إدارة الحسابات البنكية</h2>
              <button onClick={() => setIsManagingBanks(false)} style={{ background: 'none', color: 'var(--text-secondary)' }}><XCircle size={24} /></button>
            </div>

            <div className="flex gap-2 mb-6">
              <input 
                type="text" className="input-base" placeholder="اسم البنك الجديد..." 
                value={newBankName} onChange={e => setNewBankName(e.target.value)} 
              />
              <button className="btn-primary" onClick={handleAddBank}>إضافة</button>
            </div>

            <div style={{ maxHeight: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              {bankAccounts.map(bank => (
                <div key={bank.id} className="flex justify-between items-center" style={{ background: 'rgba(255,255,255,0.05)', padding: '0.8rem 1.2rem', borderRadius: '10px' }}>
                  <span style={{ fontWeight: 600 }}>{bank.name}</span>
                  <button onClick={() => handleDeleteBank(bank.id)} style={{ color: 'var(--danger)', background: 'none' }}><Trash2 size={18} /></button>
                </div>
              ))}
              {bankAccounts.length === 0 && <p style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>لا توجد حسابات مضافة حالياً</p>}
            </div>
          </div>
        </div>
      )}

      {/* Modal: View/Print Receipt */}
      {viewingReceipt && (
        <div className="animate-fade-in" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(10px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '550px', padding: 0, overflow: 'hidden', background: '#fff', color: '#1a1a1a', borderRadius: '16px' }}>
            
            <div style={{ padding: '1.5rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} className="no-print">
               <h3 style={{ margin: 0, color: '#1a1a1a' }}>سند مالي رقم #{viewingReceipt.id.substring(0,8).toUpperCase()}</h3>
               <button onClick={() => setViewingReceipt(null)} style={{ background: 'none', color: '#64748b' }}><XCircle size={24} /></button>
            </div>

            <div id="printable-receipt" style={{ padding: '2.5rem', background: '#fff' }}>
              <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                 <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--brand-primary)', marginBottom: '0.5rem' }}>المتكامل للخدمات الطلابية</div>
                 <div style={{ fontSize: '0.9rem', color: '#64748b' }}>Almotakamel Student Services</div>
                 <div style={{ margin: '1rem auto', height: '2px', width: '100px', background: 'var(--brand-primary)' }}></div>
                 <h2 style={{ color: '#1e293b', fontSize: '1.5rem', margin: '1rem 0' }}>سند قبض مالي</h2>
              </div>

              <div style={{ display: 'grid', gap: '1.2rem', fontSize: '1.1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #e2e8f0', paddingBottom: '0.5rem' }}>
                  <span style={{ color: '#64748b' }}>التاريخ:</span>
                  <strong>{viewingReceipt.date}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #e2e8f0', paddingBottom: '0.5rem' }}>
                  <span style={{ color: '#64748b' }}>الحساب البنكي:</span>
                  <strong>{viewingReceipt.bankAccount || 'نقداً'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #e2e8f0', paddingBottom: '0.5rem' }}>
                  <span style={{ color: '#64748b' }}>استلمنا من السيد/ة:</span>
                  <strong style={{ fontSize: '1.2rem' }}>{viewingReceipt.studentName}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #e2e8f0', paddingBottom: '0.5rem' }}>
                  <span style={{ color: '#64748b' }}>مبلغ وقدره:</span>
                  <strong style={{ fontSize: '1.3rem', color: '#059669' }}>{viewingReceipt.amount.toLocaleString()} ر.س</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #e2e8f0', paddingBottom: '0.5rem' }}>
                  <span style={{ color: '#64748b' }}>وذلك عن:</span>
                  <strong>{viewingReceipt.category}</strong>
                </div>
                {viewingReceipt.note && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <span style={{ color: '#64748b' }}>ملاحظات:</span>
                    <p style={{ margin: 0, padding: '1rem', background: '#f8fafc', borderRadius: '8px', fontSize: '0.95rem' }}>{viewingReceipt.note}</p>
                  </div>
                )}
              </div>

              <div style={{ marginTop: '3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                 <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '2rem' }}>توقيع المحاسب</div>
                    <div style={{ borderTop: '1px solid #1e293b', width: '150px' }}></div>
                 </div>
                 <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '2rem' }}>الختم الرسمي</div>
                    <div style={{ border: '2px solid #e2e8f0', width: '100px', height: '100px', borderRadius: '50%' }}></div>
                 </div>
              </div>
            </div>

            <div style={{ padding: '1.5rem', background: '#f1f5f9', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '1rem' }} className="no-print">
               <button className="btn-primary" style={{ flex: 1 }} onClick={() => window.print()}>
                  <Printer size={18} /> طباعة السند
               </button>
               <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setViewingReceipt(null)}>
                  إغلاق
               </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #printable-receipt, #printable-receipt * { visibility: visible; }
          #printable-receipt {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 0 !important;
            margin: 0 !important;
          }
          .no-print { display: none !important; }
        }
      `}</style>

    </div>
  );
}
