import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { UserPlus, Search, Edit, Trash2, Shield, Mail, Phone, UserCheck, UserX } from 'lucide-react';
import { db } from '../firebase';
import { collection, serverTimestamp, onSnapshot, doc, deleteDoc, query, orderBy } from 'firebase/firestore';

export default function Employees() {
  const [activeTab, setActiveTab] = useState('list');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [employeesList, setEmployeesList] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    role: 'employee',
    status: 'active'
  });

  const [filters, setFilters] = useState({
    role: '',
    status: ''
  });

  useEffect(() => {
    const q = query(collection(db, 'employees'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      }));
      setEmployeesList(data);
    });
    return () => unsubscribe();
  }, []);

  const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      console.log('Sending request to:', `${BASE_URL}/api/employees/${editingId ? 'update/' + editingId : 'create'}`);
      
      const response = await axios.post(`${BASE_URL}/api/employees/${editingId ? 'update/' + editingId : 'create'}`, formData);
      
      if (editingId) {
        setEditingId(null);
        setActiveTab('list');
      } else {
        setActiveTab('list');
      }
      setFormData({ name: '', email: '', password: '', phone: '', role: 'employee', status: 'active' });
      alert('تمت العملية بنجاح');
    } catch (err) {
      console.error('[SUBMIT ERROR]', err);
      
      if (!err.response) {
        alert('لا يمكن الاتصال بالخادم. إذا كنت تستخدم الرابط العام (https)، يرجى التأكد من تشغيل الخادم المحلي واستخدام الرابط المحلي (http://localhost:5173) لتتمكن من الاتصال بالـ Backend المحلي.');
      } else {
        alert(err.response?.data?.error || 'حدث خطأ أثناء المعالجة');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditClick = (emp) => {
    setFormData({
      name: emp.name || '',
      email: emp.email || '',
      phone: emp.phone || '',
      role: emp.role || 'employee',
      status: emp.status || 'active'
    });
    setEditingId(emp.id);
    setActiveTab('add');
  };

  const handleDelete = async (id) => {
    if (window.confirm('هل أنت متأكد من حذف هذا الموظف؟')) {
      try {
        await deleteDoc(doc(db, 'employees', id));
      } catch (err) {
        console.error(err);
      }
    }
  };

  const filteredEmployees = employeesList.filter(emp => {
    const matchSearch = emp.name?.toLowerCase().includes(searchQuery.toLowerCase()) || emp.email?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchRole = !filters.role || emp.role === filters.role;
    const matchStatus = !filters.status || emp.status === filters.status;
    return matchSearch && matchRole && matchStatus;
  });

  const getRoleIcon = (role) => {
    switch(role) {
      case 'admin': return <Shield size={18} className="text-rose-500" />;
      case 'supervisor': return <UserCheck size={18} className="text-amber-500" />;
      default: return <UserPlus size={18} className="text-blue-500" />;
    }
  };

  const getRoleLabel = (role) => {
    switch(role) {
      case 'admin': return 'مدير النظام';
      case 'supervisor': return 'مشرف عام';
      default: return 'موظف دعم';
    }
  };

  return (
    <div className="animate-fade-in-up">
      <div className="flex justify-between items-center responsive-flex" style={{ marginBottom: '2.5rem' }}>
        <div>
          <h1 style={{ marginBottom: '0.25rem' }}>إدارة فريق العمل</h1>
          <p style={{ color: 'var(--text-secondary)' }}>إضافة وتعديل صلاحيات الموظفين في النظام</p>
        </div>
        <div className="flex gap-3">
          <button 
            className={activeTab === 'list' ? 'btn-primary' : 'btn-secondary'} 
            onClick={() => setActiveTab('list')}
          >
            <Search size={18} /> قائمة الموظفين
          </button>
          <button 
            className={activeTab === 'add' ? 'btn-primary' : 'btn-secondary'} 
            onClick={() => { 
                setActiveTab('add'); 
                setEditingId(null); 
                setFormData({ name: '', email: '', password: '', phone: '', role: 'employee', status: 'active' }); 
            }}
          >
            <UserPlus size={18} /> {editingId ? 'تعديل موظف' : 'إضافة موظف'}
          </button>
        </div>
      </div>

      {activeTab === 'add' ? (
        <div className="glass-panel" style={{ padding: '2.5rem', maxWidth: '800px', margin: '0 auto' }}>
          <h2 style={{ marginBottom: '2rem' }}>{editingId ? 'تحديث بيانات الموظف' : 'بيانات الموظف الجديد'}</h2>
          
          <form onSubmit={handleSubmit} className="grid grid-cols-2 sm-grid-cols-1 gap-6">
            <div className="flex-col gap-2">
              <label className="input-label">الاسم الكامل</label>
              <input type="text" className="input-base" placeholder="اسم الموظف" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
            </div>

            <div className="flex-col gap-2">
              <label className="input-label">البريد الإلكتروني (لتسجيل الدخول)</label>
              <input type="email" className="input-base" placeholder="email@example.com" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} required />
            </div>

            {!editingId && (
              <div className="flex-col gap-2">
                <label className="input-label">كلمة المرور المؤقتة</label>
                <div style={{ position: 'relative' }}>
                  <Shield size={18} style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} />
                  <input type="text" className="input-base" style={{ paddingRight: '2.8rem' }} placeholder="أدخل كلمة مرور قوية" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} required />
                </div>
              </div>
            )}

            <div className="flex-col gap-2">
              <label className="input-label">رقم الهاتف</label>
              <input type="tel" className="input-base" placeholder="05XXXXXXXX" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
            </div>

            <div className="flex-col gap-2">
              <label className="input-label">الدور الوظيفي</label>
              <select className="input-base" value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})}>
                <option value="employee">موظف (Employee)</option>
                <option value="admin">مدير (Admin)</option>
                <option value="supervisor">مشرف (Supervisor)</option>
              </select>
            </div>

            <div className="flex gap-4 justify-end" style={{ gridColumn: 'span 2', marginTop: '1rem' }}>
              <button type="submit" className="btn-primary" disabled={isSubmitting} style={{ padding: '1rem 3rem' }}>
                {isSubmitting ? 'جاري المعالجة...' : editingId ? 'تحديث البيانات' : 'إنشاء حساب الموظف'}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="flex-col gap-6">
          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <div className="flex flex-col gap-4">
              <div style={{ position: 'relative' }}>
                <Search size={22} style={{ position: 'absolute', right: '18px', top: '50%', transform: 'translateY(-50%)', opacity: 0.3 }} />
                <input 
                  type="text" 
                  className="input-base" 
                  style={{ paddingRight: '3.5rem' }} 
                  placeholder="ابحث عن موظف بالاسم أو البريد..." 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
              
              <div className="grid grid-cols-3 sm-grid-cols-1 gap-3">
                <select className="input-base" value={filters.role} onChange={e => setFilters({...filters, role: e.target.value})}>
                  <option value="">كل الأدوار الوظيفية</option>
                  <option value="admin">المدراء</option>
                  <option value="supervisor">المشرفين</option>
                  <option value="employee">الموظفين</option>
                </select>
                <select className="input-base" value={filters.status} onChange={e => setFilters({...filters, status: e.target.value})}>
                  <option value="">كل الحالات</option>
                  <option value="active">نشط</option>
                  <option value="inactive">غير نشط</option>
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 md-grid-cols-2 sm-grid-cols-1 gap-6">
            {filteredEmployees.map(emp => (
              <div key={emp.id} className="group relative glass-panel hover:bg-white/[0.03] transition-all duration-500" style={{ padding: '1.75rem', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, right: 0, width: '4px', height: '100%', background: emp.role === 'admin' ? 'var(--danger)' : 'var(--brand-primary)' }}></div>
                
                <div className="flex justify-between items-start mb-6">
                  <div className="relative">
                    <div style={{ width: '60px', height: '60px', borderRadius: '18px', background: 'linear-gradient(135deg, var(--bg-secondary), var(--bg-primary))', border: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: '1.4rem', boxShadow: '0 8px 20px rgba(0,0,0,0.2)' }}>
                      {emp.name?.charAt(0)}
                    </div>
                    <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-4 border-[#1e293b] ${emp.status === 'active' ? 'bg-emerald-500' : 'bg-slate-500'}`}></div>
                  </div>
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => handleEditClick(emp)} className="p-2.5 bg-white/5 hover:bg-blue-500/20 text-blue-400 rounded-xl border border-white/10 transition-colors"><Edit size={16} /></button>
                    <button onClick={() => handleDelete(emp.id)} className="p-2.5 bg-white/5 hover:bg-red-500/20 text-red-400 rounded-xl border border-white/10 transition-colors"><Trash2 size={16} /></button>
                  </div>
                </div>
                
                <h3 className="text-xl font-extrabold text-white mb-2 leading-tight">{emp.name}</h3>
                
                <div className="flex flex-col gap-3 mt-4 text-sm font-medium text-slate-400">
                  <div className="flex items-center gap-3 bg-white/5 p-2 rounded-lg">
                    <Mail size={16} className="text-slate-500" /> 
                    <span className="truncate">{emp.email}</span>
                  </div>
                  <div className="flex items-center gap-3 bg-white/5 p-2 rounded-lg">
                    {getRoleIcon(emp.role)}
                    <span className="text-white">{getRoleLabel(emp.role)}</span>
                  </div>
                  <div className="flex items-center gap-3 bg-white/5 p-2 rounded-lg">
                    <Phone size={16} className="text-slate-500" /> 
                    <span>{emp.phone || 'بدون رقم هاتف'}</span>
                  </div>
                </div>

                <div className="mt-6 flex gap-2">
                   <div className={`flex-1 py-2 rounded-xl text-center text-xs font-bold border ${emp.status === 'active' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-slate-500/10 text-slate-500 border-slate-500/20'}`}>
                      {emp.status === 'active' ? 'حساب نشط' : 'حساب معطل'}
                   </div>
                </div>
              </div>
            ))}
            {filteredEmployees.length === 0 && (
              <div style={{ gridColumn: 'span 3', textAlign: 'center', padding: '5rem opacity-40' }}>
                 <p>لا يوجد موظفون يطابقون خيارات البحث الحالية.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
