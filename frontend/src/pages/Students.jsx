import React, { useState, useEffect } from 'react';
import { 
  UserPlus, Search, Edit, Trash2, GraduationCap, 
  Phone, User, Lock, ChevronLeft, Filter, 
  MoreHorizontal, MessageCircle, FileText
} from 'lucide-react';
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp, onSnapshot, doc, deleteDoc, updateDoc, query, orderBy } from 'firebase/firestore';

export default function Students() {
  const [activeTab, setActiveTab] = useState('list');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [studentsList, setStudentsList] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [formData, setFormData] = useState({
    name: '', phone: '', username: '', password: '', 
    university: '', major: '', notes: ''
  });

  const [filters, setFilters] = useState({
    university: '', major: '', sortBy: 'newest'
  });

  const [univs, setUnivs] = useState([]);
  const [majors, setMajors] = useState([]);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    const q = query(collection(db, 'students'), orderBy('createdAt', 'desc'));
    const unsubStudents = onSnapshot(q, (snapshot) => {
      setStudentsList(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    
    // Fetch unique lists for filters
    const unsubUniv = onSnapshot(collection(db, 'universities'), (snap) => setUnivs(snap.docs.map(d => d.data().name)));
    const unsubMaj = onSnapshot(collection(db, 'majors'), (snap) => setMajors(snap.docs.map(d => d.data().name)));

    return () => { unsubStudents(); unsubUniv(); unsubMaj(); };
  }, []);

  const validate = () => {
    let errs = {};
    if (!formData.name) errs.name = 'الاسم مطلوب';
    if (!formData.phone) errs.phone = 'الرقم مطلوب';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      if (editingId) {
        await updateDoc(doc(db, 'students', editingId), formData);
      } else {
        await addDoc(collection(db, 'students'), {
          ...formData,
          createdAt: serverTimestamp(),
          mainStatus: 'جديد'
        });
      }
      setActiveTab('list');
      setFormData({ name: '', phone: '', username: '', password: '', university: '', major: '', notes: '' });
      setEditingId(null);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (s) => {
    setFormData({ ...s });
    setEditingId(s.id);
    setActiveTab('add');
  };

  const handleDelete = async (id) => {
    if (window.confirm('هل أنت متأكد من الحذف؟')) {
      await deleteDoc(doc(db, 'students', id));
    }
  };

  const filtered = studentsList.filter(s => {
    const matchSearch = s.name?.toLowerCase().includes(searchQuery.toLowerCase()) || s.phone?.includes(searchQuery);
    const matchUniv = !filters.university || s.university === filters.university;
    const matchMajor = !filters.major || s.major === filters.major;
    return matchSearch && matchUniv && matchMajor;
  });

  return (
    <div className="space-y-8 animate-fade-in-up">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-3xl font-extrabold text-white mb-2">شؤون الطلاب</h1>
          <p className="text-white/50 text-sm font-medium">إدارة شاملة لبيانات الطلاب، الحسابات، والحالات الأكاديمية.</p>
        </div>
        <div className="flex gap-3">
          <button className={activeTab === 'list' ? 'btn-primary' : 'btn-secondary'} onClick={() => setActiveTab('list')}>
            <FileText size={18} /> قائمة الطلاب
          </button>
          <button className={activeTab === 'add' ? 'btn-primary' : 'btn-secondary'} onClick={() => { setActiveTab('add'); setEditingId(null); setFormData({name: '', phone: '', username: '', password: '', university: '', major: '', notes: ''}); }}>
            <UserPlus size={18} /> {editingId ? 'تعديل طالب' : 'طالب جديد'}
          </button>
        </div>
      </div>

      {activeTab === 'add' ? (
        <div className="glass-panel p-8 max-w-4xl mx-auto">
          <h2 className="text-xl font-bold text-white mb-8 flex items-center gap-3">
             <div className="p-2 bg-brand-primary/20 rounded-lg text-brand-primary"><UserPlus size={20} /></div>
             {editingId ? 'تحديث ملف الطالب' : 'تسجيل طالب جديد'}
          </h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="input-label">الاسم الكامل</label>
              <input type="text" className="input-base" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} maxLength={50} />
              {errors.name && <p className="text-danger text-[10px] font-bold">{errors.name}</p>}
            </div>
            <div className="space-y-2">
              <label className="input-label">رقم الواتساب</label>
              <input type="tel" className="input-base text-right" dir="ltr" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
              {errors.phone && <p className="text-danger text-[10px] font-bold">{errors.phone}</p>}
            </div>
            <div className="space-y-2">
              <label className="input-label">اليوزر (الموقع الرسمي)</label>
              <input type="text" className="input-base" value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} />
            </div>
            <div className="space-y-2">
              <label className="input-label">الباسوورد</label>
              <input type="text" className="input-base" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
            </div>
            <div className="space-y-2">
              <label className="input-label">الجامعة</label>
              <input type="text" className="input-base" value={formData.university} onChange={e => setFormData({...formData, university: e.target.value})} />
            </div>
            <div className="space-y-2">
              <label className="input-label">التخصص</label>
              <input type="text" className="input-base" value={formData.major} onChange={e => setFormData({...formData, major: e.target.value})} />
            </div>
            <div className="md:col-span-2 space-y-2">
              <label className="input-label">ملاحظات خاصة</label>
              <textarea className="input-base" rows="3" value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})}></textarea>
            </div>
            <div className="md:col-span-2 flex justify-end gap-3 pt-4">
               <button type="submit" className="btn-primary px-12" disabled={isSubmitting}>{isSubmitting ? 'جاري المعالجة...' : 'حفظ البيانات'}</button>
            </div>
          </form>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="glass-panel p-4 flex flex-col lg:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-white/20" size={20} />
              <input type="text" className="input-base pr-12" placeholder="بحث بالاسم أو الرقم..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            </div>
            <div className="flex gap-4">
              <div className="flex items-center gap-2 bg-white/5 px-4 rounded-xl border border-white/5">
                <Filter size={16} className="text-brand-primary" />
                <select className="bg-transparent text-white text-xs font-bold outline-none py-2" value={filters.university} onChange={e => setFilters({...filters, university: e.target.value})}>
                  <option value="">كل الجامعات</option>
                  {univs.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <select className="input-base text-xs font-bold min-w-[140px]" value={filters.sortBy} onChange={e => setFilters({...filters, sortBy: e.target.value})}>
                <option value="newest">الأحدث أولاً</option>
                <option value="oldest">الأقدم</option>
              </select>
            </div>
          </div>

          <div className="glass-panel overflow-hidden border-white/5">
            <div className="overflow-x-auto">
              <table className="w-full text-right">
                <thead>
                  <tr className="bg-white/5 text-white/30 text-[10px] uppercase font-black tracking-widest">
                    <th className="p-5">الطالب</th>
                    <th className="p-5">بيانات الدخول</th>
                    <th className="p-5">الجامعة / التخصص</th>
                    <th className="p-5">الحالة</th>
                    <th className="p-5 text-left">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filtered.map(s => (
                    <tr key={s.id} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="p-5">
                        <div className="flex items-center gap-4">
                          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-brand-primary/20 to-brand-secondary/20 text-brand-primary flex items-center justify-center font-black shadow-inner">
                            {s.name?.charAt(0)}
                          </div>
                          <div>
                            <p className="text-sm font-black text-white">{s.name}</p>
                            <p className="text-[10px] text-white/30 font-bold flex items-center gap-1 mt-1">
                              <Phone size={10} /> {s.phone}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="p-5">
                        <div className="text-[11px] font-bold space-y-1">
                          <p className="text-white/60 flex items-center gap-2 bg-white/5 px-2 py-1 rounded-md border border-white/5">
                            <User size={12} className="text-brand-primary" /> {s.username || '---'}
                          </p>
                          <p className="text-white/40 flex items-center gap-2 px-2">
                             <Lock size={12} className="text-white/20" /> {s.password || '---'}
                          </p>
                        </div>
                      </td>
                      <td className="p-5">
                        <p className="text-xs font-bold text-white mb-1 flex items-center gap-2">
                          <GraduationCap size={14} className="text-brand-secondary" /> {s.university || '---'}
                        </p>
                        <p className="text-[10px] text-white/30 font-medium pr-6">{s.major || '---'}</p>
                      </td>
                      <td className="p-5">
                        <span className={`badge ${s.mainStatus === 'جديد' ? 'badge-info' : 'badge-success'}`}>
                           {s.mainStatus || 'جديد'}
                        </span>
                      </td>
                      <td className="p-5 text-left">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => handleEdit(s)} className="p-2.5 hover:bg-brand-primary/20 text-brand-primary rounded-xl transition-all border border-transparent hover:border-brand-primary/20"><Edit size={16} /></button>
                          <button onClick={() => handleDelete(s.id)} className="p-2.5 hover:bg-danger/20 text-danger rounded-xl transition-all border border-transparent hover:border-danger/20"><Trash2 size={16} /></button>
                          <button className="p-2.5 hover:bg-white/10 text-white/20 hover:text-white rounded-xl transition-all"><MoreHorizontal size={16} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {filtered.length === 0 && (
            <div className="glass-panel p-20 text-center opacity-30">
               <User size={64} className="mx-auto mb-4" />
               <p className="font-bold">لا يوجد طلاب مطابقين للبحث حالياً.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
