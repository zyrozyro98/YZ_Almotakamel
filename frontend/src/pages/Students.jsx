import React, { useState, useEffect } from 'react';
import { UserPlus, Search, Edit, Trash2, GraduationCap, Phone, User, Lock } from 'lucide-react';
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp, onSnapshot, doc, deleteDoc, updateDoc } from 'firebase/firestore';

export default function Students() {
  const [activeTab, setActiveTab] = useState('list');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [studentsList, setStudentsList] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    username: '',
    password: '',
    university: '',
    major: '',
    notes: ''
  });

  const [errors, setErrors] = useState({});

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'students'), (snapshot) => {
      const data = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      }));
      setStudentsList(data);
    });
    return () => unsubscribe();
  }, []);

  const validateForm = () => {
    let newErrors = {};
    if (formData.name.trim().length < 2) newErrors.name = 'اسم الطالب مطلوب.';
    if (formData.phone.trim().length < 9) newErrors.phone = 'رقم الهاتف مطلوب.';
    if (!formData.username.trim()) newErrors.username = 'اليوزر مطلوب.';
    if (!formData.password.trim()) newErrors.password = 'الباسوورد مطلوب.';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleEditClick = (student) => {
    setFormData({
      name: student.name || '',
      phone: student.phone || '',
      username: student.username || '',
      password: student.password || '',
      university: student.university || '',
      major: student.major || '',
      notes: student.notes || ''
    });
    setEditingId(student.id);
    setActiveTab('add');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (validateForm()) {
      setIsSubmitting(true);
      try {
        if (editingId) {
          await updateDoc(doc(db, 'students', editingId), { ...formData });
          setEditingId(null);
          setActiveTab('list');
        } else {
          await addDoc(collection(db, 'students'), {
            ...formData,
            createdAt: serverTimestamp(),
            mainStatus: 'جديد',
            subStatus: 'لم يتم التواصل'
          });
          setActiveTab('list');
        }
        setFormData({ name: '', phone: '', username: '', password: '', university: '', major: '', notes: '' });
      } catch (err) {
        console.error(err);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('هل أنت متأكد من الحذف؟')) {
      try {
        await deleteDoc(doc(db, 'students', id));
      } catch (err) {
        console.error(err);
      }
    }
  };

  const filteredStudents = studentsList.filter(s => 
    s.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.phone?.includes(searchQuery) ||
    s.university?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="animate-fade-in-up">
      <div className="flex justify-between items-center responsive-flex" style={{ marginBottom: '2.5rem' }}>
        <div>
          <h1 style={{ marginBottom: '0.25rem' }}>إدارة الطلاب والمسجلين</h1>
          <p style={{ color: 'var(--text-secondary)' }}>إضافة وتعديل ومتابعة بيانات الطلاب في النظام</p>
        </div>
        <div className="flex gap-3">
          <button 
            className={activeTab === 'list' ? 'btn-primary' : 'btn-secondary'} 
            onClick={() => setActiveTab('list')}
          >
            <Search size={18} /> قائمة الطلاب
          </button>
          <button 
            className={activeTab === 'add' ? 'btn-primary' : 'btn-secondary'} 
            onClick={() => { setActiveTab('add'); setEditingId(null); setFormData({ name: '', phone: '', username: '', password: '', university: '', major: '', notes: '' }); }}
          >
            <UserPlus size={18} /> {editingId ? 'تعديل طالب' : 'طالب جديد'}
          </button>
        </div>
      </div>

      {activeTab === 'add' ? (
        <div className="glass-panel" style={{ padding: '2.5rem', maxWidth: '900px', margin: '0 auto' }}>
          <div className="flex items-center gap-3" style={{ marginBottom: '2rem' }}>
            <div style={{ padding: '0.75rem', background: 'var(--brand-primary)', borderRadius: '12px', color: '#fff' }}>
              <UserPlus size={24} />
            </div>
            <h2 style={{ margin: 0 }}>{editingId ? 'تحديث بيانات الطالب' : 'تسجيل طالب جديد في المنصة'}</h2>
          </div>
          
          <form onSubmit={handleSubmit} className="grid grid-cols-2 sm-grid-cols-1 gap-6">
            <div className="flex-col gap-2">
              <label className="input-label">اسم الطالب الرباعي</label>
              <div style={{ position: 'relative' }}>
                <User size={18} style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                <input type="text" className="input-base" style={{ paddingRight: '2.8rem' }} placeholder="الاسم الكامل كما في الهوية" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
              </div>
              {errors.name && <p style={{ color: 'var(--danger)', fontSize: '0.75rem', fontWeight: 600 }}>{errors.name}</p>}
            </div>

            <div className="flex-col gap-2">
              <label className="input-label">رقم التواصل (واتساب)</label>
              <div style={{ position: 'relative' }}>
                <Phone size={18} style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                <input type="tel" className="input-base" dir="ltr" style={{ paddingRight: '2.8rem', textAlign: 'right' }} placeholder="05XXXXXXXX" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
              </div>
              {errors.phone && <p style={{ color: 'var(--danger)', fontSize: '0.75rem', fontWeight: 600 }}>{errors.phone}</p>}
            </div>

            <div className="flex-col gap-2">
              <label className="input-label">اسم المستخدم (الموقع الرسمي)</label>
              <div style={{ position: 'relative' }}>
                <User size={18} style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                <input type="text" className="input-base" style={{ paddingRight: '2.8rem' }} placeholder="Username" value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} />
              </div>
              {errors.username && <p style={{ color: 'var(--danger)', fontSize: '0.75rem', fontWeight: 600 }}>{errors.username}</p>}
            </div>

            <div className="flex-col gap-2">
              <label className="input-label">كلمة المرور</label>
              <div style={{ position: 'relative' }}>
                <Lock size={18} style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                <input type="password" className="input-base" style={{ paddingRight: '2.8rem' }} placeholder="••••••••" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
              </div>
              {errors.password && <p style={{ color: 'var(--danger)', fontSize: '0.75rem', fontWeight: 600 }}>{errors.password}</p>}
            </div>

            <div className="flex-col gap-2">
              <label className="input-label">الجامعة المراد التسجيل بها</label>
              <div style={{ position: 'relative' }}>
                <GraduationCap size={18} style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                <input type="text" className="input-base" style={{ paddingRight: '2.8rem' }} placeholder="اسم الجامعة" value={formData.university} onChange={e => setFormData({...formData, university: e.target.value})} />
              </div>
            </div>

            <div className="flex-col gap-2">
              <label className="input-label">التخصص</label>
              <input type="text" className="input-base" placeholder="التخصص الدراسي" value={formData.major} onChange={e => setFormData({...formData, major: e.target.value})} />
            </div>

            <div className="flex-col gap-2" style={{ gridColumn: 'span 2' }}>
              <label className="input-label">ملاحظات إضافية</label>
              <textarea className="input-base" rows="3" placeholder="أي معلومات أخرى..." value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})}></textarea>
            </div>

            <div className="flex gap-4 justify-end" style={{ gridColumn: 'span 2', marginTop: '1rem' }}>
              {editingId && (
                <button type="button" className="btn-secondary" onClick={() => { setEditingId(null); setActiveTab('list'); }}>إلغاء</button>
              )}
              <button type="submit" className="btn-primary" disabled={isSubmitting} style={{ padding: '1rem 3rem' }}>
                {isSubmitting ? 'جاري المعالجة...' : editingId ? 'تحديث البيانات' : 'تأكيد وحفظ الطالب'}
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
                placeholder="ابحث عن طالب بالاسم، الهاتف، أو الجامعة..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.03)', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '1.25rem 1.5rem', fontWeight: 700 }}>اسم الطالب</th>
                    <th style={{ padding: '1.25rem 1.5rem', fontWeight: 700 }}>التواصل</th>
                    <th style={{ padding: '1.25rem 1.5rem', fontWeight: 700 }}>الأكاديميا</th>
                    <th style={{ padding: '1.25rem 1.5rem', fontWeight: 700 }} className="hide-on-mobile">الحالة</th>
                    <th style={{ padding: '1.25rem 1.5rem', fontWeight: 700 }}>إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.length === 0 ? (
                    <tr>
                      <td colSpan="5" style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        لم يتم العثور على أي طلاب مطابقين للبحث.
                      </td>
                    </tr>
                  ) : (
                    filteredStudents.map(student => (
                      <tr key={student.id} className="hover:bg-white/5 transition-colors" style={{ borderBottom: '1px solid var(--glass-border)' }}>
                        <td style={{ padding: '1.25rem 1.5rem' }}>
                          <div className="flex items-center gap-3">
                            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(59, 130, 246, 0.1)', color: 'var(--brand-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                              {student.name?.charAt(0)}
                            </div>
                            <div>
                              <p style={{ margin: 0, fontWeight: 700 }}>{student.name}</p>
                              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{student.username}</p>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '1.25rem 1.5rem' }}>
                          <p style={{ margin: 0, fontWeight: 600, dir: 'ltr' }}>{student.phone}</p>
                          <span className="badge badge-success" style={{ fontSize: '0.65rem', marginTop: '0.25rem' }}>واتساب متاح</span>
                        </td>
                        <td style={{ padding: '1.25rem 1.5rem' }}>
                          <p style={{ margin: 0, fontWeight: 600 }}>{student.university}</p>
                          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{student.major}</p>
                        </td>
                        <td style={{ padding: '1.25rem 1.5rem' }} className="hide-on-mobile">
                          <span className="badge badge-info">{student.mainStatus || 'جديد'}</span>
                        </td>
                        <td style={{ padding: '1.25rem 1.5rem' }}>
                          <div className="flex gap-2">
                            <button onClick={() => handleEditClick(student)} className="btn-secondary" style={{ padding: '0.5rem', borderRadius: '10px', color: 'var(--brand-primary)' }}>
                              <Edit size={18} />
                            </button>
                            <button onClick={() => handleDelete(student.id)} className="btn-secondary" style={{ padding: '0.5rem', borderRadius: '10px', color: 'var(--danger)' }}>
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
