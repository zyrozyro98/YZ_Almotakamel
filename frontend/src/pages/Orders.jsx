import React, { useState, useEffect } from 'react';
import { Filter, Eye, ChevronRight, CheckCircle, XCircle, Clock, AlertCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import { db, auth } from '../firebase';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';

// Maps main status to acceptable sub-statuses
const STATUS_MAP = {
  'جديد': ['لم يتم التواصل', 'تم التواصل'],
  'انتظار': ['انتظار رد العميل', 'انتظار ارسال البيانات'],
  'مكتمل': ['تم استلام البيانات'],
  'مرفوض': ['لم يرد منذ فترة طويلة', 'لم يتم الموافقة من جهة العمل', 'رفض السعر', 'مشترك مع شخص آخر', 'مكرر'],
  'إنسحاب': ['قيد المراجعة', 'تم قبول الإنسحاب', 'تم رفض الإنسحاب']
};

const getStatusColor = (status) => {
  switch(status) {
    case 'جديد': return 'var(--brand-secondary)';
    case 'انتظار': return 'var(--warning)';
    case 'مكتمل': return 'var(--success)';
    case 'مرفوض': return 'var(--danger)';
    case 'إنسحاب': return '#f97316';
    default: return 'var(--text-secondary)';
  }
};

const getStatusIcon = (status) => {
  switch(status) {
    case 'جديد': return <AlertCircle size={16} />;
    case 'انتظار': return <Clock size={16} />;
    case 'مكتمل': return <CheckCircle size={16} />;
    case 'مرفوض': return <XCircle size={16} />;
    case 'إنسحاب': return <AlertCircle size={16} color="#f97316" />;
    default: return null;
  }
};

export default function Orders() {
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [activeTab, setActiveTab] = useState('الكل');
  const [ordersData, setOrdersData] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

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

  // For editing status in detailed view
  const [editMainStatus, setEditMainStatus] = useState('');
  const [editSubStatus, setEditSubStatus] = useState('');

  useEffect(() => {
    // Sync Orders (Students) from Firestore
    const unsubscribe = onSnapshot(collection(db, 'students'), (snapshot) => {
      const liveData = snapshot.docs.map(docSnap => {
        const student = docSnap.data();
        return {
          id: docSnap.id,
          studentName: student.name || 'غير معروف',
          university: student.university || 'غير محدد',
          major: student.major || 'غير محدد',
          phone: student.phone || 'غير مسجل',
          withdrawReason: student.withdrawReason || '',
          date: student.createdAt ? new Date(student.createdAt.seconds * 1000).toLocaleDateString('ar-SA') : 'اليوم',
          mainStatus: student.mainStatus || 'جديد',
          subStatus: student.subStatus || 'لم يتم التواصل',
          details: student.notes || 'طلب تسجيل (لا توجد ملاحظات)'
        };
      });
      setOrdersData(liveData);
    });
    return () => unsubscribe();
  }, []);

  const handleSelectOrder = (order) => {
    setSelectedOrder(order);
    setEditMainStatus(order.mainStatus);
    setEditSubStatus(order.subStatus);
  };

  const handleMainStatusChange = (e) => {
    const newMain = e.target.value;
    setEditMainStatus(newMain);
    if (newMain === 'جديد') setEditSubStatus('لم يتم التواصل');
    else setEditSubStatus(STATUS_MAP[newMain][0]);
  };

  const handleSaveStatus = async () => {
    if (!selectedOrder) return;
    try {
      await updateDoc(doc(db, 'students', selectedOrder.id), {
        mainStatus: editMainStatus,
        subStatus: editSubStatus
      });
      alert(`تم تحديث حالة الطلب بنجاح!`);
      setSelectedOrder({...selectedOrder, mainStatus: editMainStatus, subStatus: editSubStatus});
    } catch (err) {
      console.error(err);
      alert('حدث خطأ أثناء تحديث الحالة بقاعدة البيانات.');
    }
  };

  const handleDirectStatusSave = async (quickMain, quickSub) => {
    if (!selectedOrder) return;
    try {
      await updateDoc(doc(db, 'students', selectedOrder.id), {
        mainStatus: quickMain,
        subStatus: quickSub
      });
      alert(`تم تأكيد الإجراء بنجاح!`);
      setSelectedOrder({...selectedOrder, mainStatus: quickMain, subStatus: quickSub});
      setEditMainStatus(quickMain);
      setEditSubStatus(quickSub);
    } catch (err) {
      console.error(err);
      alert('حدث خطأ بالاتصال بقاعدة البيانات.');
    }
  };

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
          <p style={{ color: 'rgba(255,255,255,0.6)' }}>هذه الصفحة مخصصة للمسؤولين فقط لإدارة وتحديث حالات الطلبات.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      
      {/* If an order is selected, show details layout, else show list */}
      {selectedOrder ? (
         <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', height: '100%' }}>
            <button 
              onClick={() => setSelectedOrder(null)} 
              className="flex items-center gap-2" 
              style={{ color: 'var(--brand-secondary)', width: 'fit-content', background: 'none', padding: 0 }}
            >
              <ChevronRight size={20} /> العودة للطلبات
            </button>

            <div className="glass-panel" style={{ padding: '2rem', flex: 1 }}>
              <div className="flex justify-between items-center" style={{ marginBottom: '2rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '1rem' }}>
                <div>
                  <h2 style={{ margin: 0, color: 'var(--brand-secondary)' }}>طلب رقم {selectedOrder.id}</h2>
                  <p style={{ margin: 0, color: 'var(--text-secondary)' }}>{selectedOrder.date}</p>
                </div>
                
                <div className="flex items-center gap-2" style={{ 
                  background: `color-mix(in srgb, ${getStatusColor(selectedOrder.mainStatus)} 20%, transparent)`,
                  color: getStatusColor(selectedOrder.mainStatus),
                  padding: '8px 16px', borderRadius: '20px', fontWeight: 'bold'
                }}>
                  {getStatusIcon(selectedOrder.mainStatus)} {selectedOrder.mainStatus} - {selectedOrder.subStatus}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem' }}>
                {/* Information Column */}
                <div>
                  <h3 style={{ marginBottom: '1.5rem', color: 'var(--brand-primary)' }}>معلومات الطالب وبيانات الطلب</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                    <div>
                      <p className="input-label" style={{ margin: 0 }}>اسم الطالب</p>
                      <p style={{ fontSize: '1.1rem', marginTop: '0.2rem', fontWeight: 'bold' }}>{selectedOrder.studentName}</p>
                    </div>
                    <div>
                      <p className="input-label" style={{ margin: 0 }}>رقم الهاتف</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginTop: '0.2rem' }}>
                        <p style={{ fontSize: '1.1rem', margin: 0 }} dir="ltr">{selectedOrder.phone}</p>
                        {selectedOrder.phone !== 'غير مسجل' && (
                          <a href={`https://wa.me/${selectedOrder.phone.replace(/\+/g,'')}`} target="_blank" rel="noopener noreferrer" style={{ padding: '0.2rem 0.6rem', borderRadius: '20px', background: 'rgba(37, 211, 102, 0.1)', color: '#25D366', fontSize: '0.75rem', fontWeight: 'bold', border: '1px solid currentColor', textDecoration: 'none' }}>
                            تواصل واتساب
                          </a>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="input-label" style={{ margin: 0 }}>الجامعة</p>
                      <p style={{ fontSize: '1.1rem', marginTop: '0.2rem' }}>{selectedOrder.university}</p>
                    </div>
                    <div>
                      <p className="input-label" style={{ margin: 0 }}>التخصص</p>
                      <p style={{ fontSize: '1.1rem', marginTop: '0.2rem' }}>{selectedOrder.major}</p>
                    </div>
                  </div>
                  {selectedOrder.details && (
                    <div style={{ marginBottom: '1.5rem' }}>
                      <p className="input-label" style={{ margin: 0 }}>تفاصيل إضافية للطلب</p>
                      <p style={{ fontSize: '1rem', marginTop: '0.4rem', background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '8px', lineHeight: '1.6' }}>{selectedOrder.details}</p>
                    </div>
                  )}
                  {selectedOrder.mainStatus === 'إنسحاب' && selectedOrder.withdrawReason && (
                    <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '1.2rem', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.3)' }}>
                      <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><AlertCircle size={18} /> سبب الإنسحاب المُقدم:</h4>
                      <p style={{ margin: 0, fontSize: '0.95rem', lineHeight: '1.5' }}>{selectedOrder.withdrawReason}</p>
                      
                      {selectedOrder.subStatus === 'قيد المراجعة' && (
                        <div style={{ display: 'flex', gap: '1rem', marginTop: '1.2rem', flexWrap: 'wrap' }}>
                           <button className="btn-primary" style={{ background: 'var(--danger)', padding: '0.5rem 1rem', fontSize: '0.85rem' }} onClick={() => handleDirectStatusSave('إنسحاب', 'تم قبول الإنسحاب')}>تأكيد الانسحاب وإنهاء الطلب</button>
                           <button style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.2)', padding: '0.5rem 1rem', borderRadius: '8px', color: '#fff', fontSize: '0.85rem' }} onClick={() => handleDirectStatusSave('إنسحاب', 'تم رفض الإنسحاب')}>رفض الانسحاب ومتابعة العميل</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Status Update Column */}
                <div style={{ background: 'rgba(15, 23, 42, 0.4)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                  <h3 style={{ marginBottom: '1.5rem' }}>تحديث حالة الطلب</h3>
                  
                  <div className="flex-col gap-4">
                    <div>
                      <label className="input-label">الحالة الرئيسية</label>
                      <select 
                        className="input-base" 
                        value={editMainStatus} 
                        onChange={handleMainStatusChange}
                        style={{ cursor: 'pointer' }}
                      >
                        {Object.keys(STATUS_MAP).map(status => (
                          <option key={status} value={status} style={{ background: 'var(--bg-secondary)' }}>{status}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="input-label">الحالة الفرعية</label>
                      <select 
                        className="input-base" 
                        value={editSubStatus} 
                        onChange={(e) => setEditSubStatus(e.target.value)}
                        style={{ cursor: 'pointer' }}
                      >
                        {(STATUS_MAP[editMainStatus] || [editSubStatus]).map(sub => (
                          <option key={sub} value={sub} style={{ background: 'var(--bg-secondary)' }}>{sub}</option>
                        ))}
                      </select>
                    </div>

                    <button className="btn-primary w-full" style={{ marginTop: '1rem' }} onClick={handleSaveStatus}>
                      حفظ التغييرات
                    </button>
                  </div>
                </div>
              </div>
            </div>
         </div>
      ) : (
         <>
          <div className="flex items-center justify-between" style={{ marginBottom: '2rem' }}>
            <h1 style={{ margin: 0 }}>إدارة الطلبات</h1>
            
            <div className="flex gap-2" style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '0.3rem', borderRadius: '10px' }}>
              {['الكل', 'جديد', 'انتظار', 'مكتمل', 'مرفوض', 'إنسحاب'].map(tab => (
                <button 
                  key={tab}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '8px',
                    background: activeTab === tab ? 'var(--brand-primary)' : 'transparent',
                    color: activeTab === tab ? '#fff' : 'var(--text-secondary)',
                    fontWeight: activeTab === tab ? 600 : 400
                  }}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          <div className="glass-panel" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between' }}>
              <div style={{ position: 'relative', width: '300px' }}>
                <input type="text" className="input-base" placeholder="البحث بالاسم، رقم الطلب أو الجوال..." style={{ paddingRight: '2rem', padding: '0.5rem 2.5rem 0.5rem 0.5rem', width: '100%' }} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                <Filter size={16} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.02)', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--glass-border)', fontWeight: 600 }}>رقم الطلب</th>
                    <th style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--glass-border)', fontWeight: 600 }}>الطالب</th>
                    <th style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--glass-border)', fontWeight: 600 }}>التاريخ</th>
                    <th style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--glass-border)', fontWeight: 600 }}>الحالة</th>
                    <th style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--glass-border)', fontWeight: 600 }}>تفاصيل</th>
                  </tr>
                </thead>
                <tbody>
                  {ordersData
                    .filter(o => activeTab === 'الكل' || o.mainStatus === activeTab)
                    .filter(o => searchTerm === '' || o.studentName.includes(searchTerm) || o.id.includes(searchTerm) || o.phone.includes(searchTerm))
                    .map(order => (
                    <tr key={order.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', transition: 'background 0.2s' }} className="hover:bg-slate-800/30">
                      <td style={{ padding: '1rem 1.5rem', fontWeight: 600, color: 'var(--brand-secondary)' }}>
                         {order.id.substring(0, 6).toUpperCase()}
                      </td>
                      <td style={{ padding: '1rem 1.5rem' }}>{order.studentName}</td>
                      <td style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)' }}>{order.date}</td>
                      <td style={{ padding: '1rem 1.5rem' }}>
                        <span style={{ 
                          background: `color-mix(in srgb, ${getStatusColor(order.mainStatus)} 15%, transparent)`,
                          color: getStatusColor(order.mainStatus),
                          padding: '4px 12px', borderRadius: '12px', fontSize: '0.85rem', fontWeight: 'bold',
                          display: 'inline-flex', alignItems: 'center', gap: '4px'
                        }}>
                          {getStatusIcon(order.mainStatus)}
                          {order.mainStatus} - {order.subStatus}
                        </span>
                      </td>
                      <td style={{ padding: '1rem 1.5rem' }}>
                        <button 
                          style={{ background: 'rgba(255,255,255,0.1)', padding: '0.5rem', borderRadius: '8px', color: '#fff' }}
                          onClick={() => handleSelectOrder(order)}
                          title="عرض الطلب"
                        >
                          <Eye size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {ordersData.filter(o => activeTab === 'الكل' || o.mainStatus === activeTab).length === 0 && (
                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  لا توجد طلبات تطابق هذا الفلتر
                </div>
              )}
            </div>
          </div>
         </>
      )}
    </div>
  );
}
