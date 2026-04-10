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

  const filteredEmployees = employeesList.filter(emp => 
    emp.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
          <div className="glass-panel" style={{ padding: '1rem 1.5rem' }}>
            <div style={{ position: 'relative' }}>
              <Search size={22} style={{ position: 'absolute', right: '18px', top: '50%', transform: 'translateY(-50%)', opacity: 0.3 }} />
              <input 
                type="text" 
                className="input-base" 
                style={{ paddingRight: '3.5rem', background: 'transparent', border: 'none', fontSize: '1.2rem' }} 
                placeholder="ابحث عن موظف بالاسم أو البريد..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 md-grid-cols-2 sm-grid-cols-1 gap-6">
            {filteredEmployees.map(emp => (
              <div key={emp.id} className="glass-panel" style={{ padding: '1.5rem', position: 'relative' }}>
                <div className="flex justify-between items-start" style={{ marginBottom: '1.5rem' }}>
                  <div style={{ width: '50px', height: '50px', borderRadius: '14px', background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-secondary))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: '1.2rem' }}>
                    {emp.name?.charAt(0)}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleEditClick(emp)} className="btn-secondary" style={{ padding: '0.4rem', borderRadius: '8px' }}><Edit size={16} /></button>
                    <button onClick={() => handleDelete(emp.id)} className="btn-secondary" style={{ padding: '0.4rem', borderRadius: '8px', color: 'var(--danger)' }}><Trash2 size={16} /></button>
                  </div>
                </div>
                
                <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem' }}>{emp.name}</h3>
                
                <div className="flex-col gap-2" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  <div className="flex items-center gap-2">
                    <Mail size={14} /> {emp.email}
                  </div>
                  <div className="flex items-center gap-2">
                    <Shield size={14} /> {emp.role === 'admin' ? 'مدير النظام' : 'موظف'}
                  </div>
                </div>

                <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--glass-border)' }}>
                   <span className={`badge ${emp.status === 'active' ? 'badge-success' : 'badge-danger'}`} style={{ width: '100%', justifyContent: 'center' }}>
                      {emp.status === 'active' ? 'نشط الآن' : 'غير نشط'}
                   </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
