import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  UserPlus, Search, Edit, Trash2, Shield, 
  Mail, Phone, UserCheck, UserX, ChevronLeft,
  Briefcase, AtSign, ShieldCheck, Activity
} from 'lucide-react';
import { db } from '../firebase';
import { collection, onSnapshot, doc, deleteDoc, query, orderBy } from 'firebase/firestore';

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

  const [filters, setFilters] = useState({ role: '', status: '' });

  useEffect(() => {
    const q = query(collection(db, 'employees'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setEmployeesList(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const endpoint = editingId ? `update/${editingId}` : 'create';
      await axios.post(`${BASE_URL}/api/employees/${endpoint}`, formData);
      
      setEditingId(null);
      setActiveTab('list');
      setFormData({ name: '', email: '', password: '', phone: '', role: 'employee', status: 'active' });
      alert('تم حفظ بيانات الموظف بنجاح');
    } catch (err) {
      console.error('[SUBMIT ERROR]', err);
      alert(err.response?.data?.error || 'حدث خطأ أثناء معالجة البيانات.');
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
    if (window.confirm('هل أنت متأكد من حذف هذا الحساب نهائياً؟')) {
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

  const getRoleBadge = (role) => {
    switch(role) {
      case 'admin': return <span className="badge badge-danger"><Shield size={12} /> مدير النظام</span>;
      case 'supervisor': return <span className="badge badge-warning"><ShieldCheck size={12} /> مشرف</span>;
      default: return <span className="badge badge-info"><Briefcase size={12} /> موظف دعم</span>;
    }
  };

  return (
    <div className="space-y-8 animate-fade-in-up">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-3xl font-extrabold text-white mb-2">إدارة فريق العمل</h1>
          <p className="text-white/50 text-sm font-medium">التحكم في صلاحيات الوصول وإضافة أعضاء جدد للمنظمة.</p>
        </div>
        <div className="flex gap-3">
          <button 
            className={activeTab === 'list' ? 'btn-primary' : 'btn-secondary'} 
            onClick={() => setActiveTab('list')}
          >
            <Search size={18} /> قائمة الفريق
          </button>
          <button 
            className={activeTab === 'add' ? 'btn-primary' : 'btn-secondary'} 
            onClick={() => { 
                setActiveTab('add'); 
                setEditingId(null); 
                setFormData({ name: '', email: '', password: '', phone: '', role: 'employee', status: 'active' }); 
            }}
          >
            <UserPlus size={18} /> {editingId ? 'تعديل بيانات' : 'إضافة موظف'}
          </button>
        </div>
      </div>

      {activeTab === 'add' ? (
        <div className="glass-panel p-8 max-w-3xl mx-auto">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-12 rounded-2xl bg-brand-primary/20 text-brand-primary flex items-center justify-center">
              <UserPlus size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">{editingId ? 'تعديل الموظف' : 'تسجيل موظف جديد'}</h2>
              <p className="text-white/40 text-xs">تأكد من إدخال بريد إلكتروني صالح لتفعيل الحساب.</p>
            </div>
          </div>
          
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="input-label">الاسم الكامل</label>
              <div className="relative">
                <UserCheck size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/20" />
                <input type="text" className="input-base pr-12" placeholder="اسم الموظف" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
              </div>
            </div>

            <div className="space-y-2">
              <label className="input-label">البريد الإلكتروني</label>
              <div className="relative">
                <AtSign size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/20" />
                <input type="email" className="input-base pr-12" placeholder="mail@example.com" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} required />
              </div>
            </div>

            {!editingId && (
              <div className="space-y-2">
                <label className="input-label">كلمة المرور</label>
                <div className="relative">
                  <Shield size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/20" />
                  <input type="text" className="input-base pr-12" placeholder="باسوورد مؤقت" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} required />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="input-label">رقم الهاتف</label>
              <div className="relative">
                <Phone size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/20" />
                <input type="tel" className="input-base pr-12 text-right" placeholder="05XXXXXXXX" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
              </div>
            </div>

            <div className="space-y-2">
              <label className="input-label">الدور الوظيفي</label>
              <select className="input-base" value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})}>
                <option value="employee">موظف دعم</option>
                <option value="supervisor">مشرف عام</option>
                <option value="admin">مدير نظام</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="input-label">حالة الحساب</label>
              <select className="input-base" value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}>
                <option value="active">نشط (فعال)</option>
                <option value="inactive">معطل (محظور)</option>
              </select>
            </div>

            <div className="md:col-span-2 flex justify-end gap-3 mt-4">
              <button type="button" className="btn-secondary" onClick={() => setActiveTab('list')}>إلغاء</button>
              <button type="submit" className="btn-primary px-12" disabled={isSubmitting}>
                {isSubmitting ? 'جاري الحفظ...' : editingId ? 'تحديث البيانات' : 'إنشاء الحساب'}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="glass-panel p-4 flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-white/20" size={20} />
              <input 
                type="text" 
                className="input-base pr-12" 
                placeholder="ابحث عن اسم أو بريد..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex gap-4">
              <select className="input-base min-w-[150px]" value={filters.role} onChange={e => setFilters({...filters, role: e.target.value})}>
                <option value="">جميع الأدوار</option>
                <option value="admin">المدراء</option>
                <option value="employee">الموظفين</option>
              </select>
              <select className="input-base min-w-[150px]" value={filters.status} onChange={e => setFilters({...filters, status: e.target.value})}>
                <option value="">جميع الحالات</option>
                <option value="active">نشط</option>
                <option value="inactive">معطل</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredEmployees.map(emp => (
              <div key={emp.id} className="glass-panel p-6 group hover-card relative">
                <div 
                  className="absolute top-0 right-0 w-1.5 h-full rounded-l-full" 
                  style={{ backgroundColor: emp.role === 'admin' ? 'var(--danger)' : 'var(--brand-primary)' }}
                ></div>
                
                <div className="flex justify-between items-start mb-6">
                  <div className="relative">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 border border-white/10 flex items-center justify-center text-2xl font-black text-white shadow-2xl">
                      {emp.name?.charAt(0)}
                    </div>
                    <div className={`absolute -bottom-1 -left-1 w-5 h-5 rounded-full border-4 border-[#1e293b] ${emp.status === 'active' ? 'bg-emerald-500 shadow-[0_0_10px_#10b981]' : 'bg-slate-500'}`}></div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleEditClick(emp)} className="p-2.5 bg-white/5 hover:bg-brand-primary/20 text-brand-primary rounded-xl border border-white/10 transition-all"><Edit size={16} /></button>
                    <button onClick={() => handleDelete(emp.id)} className="p-2.5 bg-white/5 hover:bg-danger/20 text-danger rounded-xl border border-white/10 transition-all"><Trash2 size={16} /></button>
                  </div>
                </div>
                
                <div className="mb-4">
                  <h3 className="text-xl font-black text-white mb-1">{emp.name}</h3>
                  <div className="flex items-center gap-1 text-white/30 text-xs font-bold">
                    <AtSign size={12} /> {emp.email}
                  </div>
                </div>

                <div className="space-y-2 mb-6">
                   <div className="flex items-center justify-between text-xs py-2 border-b border-white/5">
                      <span className="text-white/30">الدور الوظيفي</span>
                      {getRoleBadge(emp.role)}
                   </div>
                   <div className="flex items-center justify-between text-xs py-2">
                      <span className="text-white/30">رقم التواصل</span>
                      <span className="text-white font-bold">{emp.phone || 'N/A'}</span>
                   </div>
                </div>

                <button className="w-full btn-secondary text-xs py-2 flex items-center justify-center gap-2 group-hover:bg-brand-primary/10 group-hover:text-brand-primary group-hover:border-brand-primary/20 transition-all">
                  <Activity size={14} /> سجل النشاط
                </button>
              </div>
            ))}
          </div>

          {filteredEmployees.length === 0 && (
            <div className="glass-panel p-20 text-center opacity-40">
              <Search size={48} className="mx-auto mb-4" />
              <p className="font-bold">لم نجد أي موظفين يطابقون هذه الفلاتر.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
