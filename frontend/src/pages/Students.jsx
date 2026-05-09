import React, { useState, useEffect } from 'react';
import { UserPlus, Search, Edit, Trash2, GraduationCap, Phone, User, Lock } from 'lucide-react';
import { db, auth } from '../firebase';
import { collection, addDoc, serverTimestamp, onSnapshot, doc, deleteDoc, updateDoc, getDoc } from 'firebase/firestore';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function Students() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(true);

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
  const [activeTab, setActiveTab] = useState('list');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bulkData, setBulkData] = useState({
    university: '',
    major: '',
    names: '',
    phones: '',
    usernames: '',
    passwords: ''
  });
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
    batch: '',
    idNumber: '',
    group: '',
    notes: '',
    platformUrl: ''
  });

  const [filters, setFilters] = useState({
    university: '',
    major: '',
    batch: '',
    group: '',
    sortBy: 'newest' // 'newest', 'oldest'
  });

  const [univs, setUnivs] = useState([]);
  const [majors, setMajors] = useState([]);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    // Merge Firestore + RTDB Students for immediate visibility
    const updateStudents = (fsData, rtdbData) => {
      const merged = [...fsData];
      Object.keys(rtdbData || {}).forEach(id => {
        if (!merged.find(s => s.id === id)) {
          merged.push({ id, ...rtdbData[id], source: 'rtdb' });
        }
      });
      setStudentsList(merged);
    };

    let fsStudents = [];
    let rtdbStudents = {};

    const unsubStudents = onSnapshot(collection(db, 'students'), (snapshot) => {
      fsStudents = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
      updateStudents(fsStudents, rtdbStudents);
    }, (err) => {
      console.warn("Firestore students blocked:", err);
      updateStudents(fsStudents, rtdbStudents);
    });

    const { ref, onValue } = require('firebase/database');
    const { rtdb: rtdbInstance } = require('../firebase');
    const rtdbRef = ref(rtdbInstance, 'active_students');
    const unsubRtdb = onValue(rtdbRef, (snap) => {
      if (snap.exists()) rtdbStudents = snap.val();
      else rtdbStudents = {};
      updateStudents(fsStudents, rtdbStudents);
    });
    
    const unsubUniv = onSnapshot(collection(db, 'universities'), (snapshot) => {
      setUnivs(snapshot.docs.map(doc => doc.data().name));
    });

    const unsubMajors = onSnapshot(collection(db, 'majors'), (snapshot) => {
      setMajors(snapshot.docs.map(doc => doc.data().name));
    });

    return () => { unsubStudents(); unsubRtdb(); unsubUniv(); unsubMajors(); };
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
      batch: student.batch || '',
      idNumber: student.idNumber || '',
      notes: student.notes || '',
      platformUrl: student.platformUrl || ''
    });
    setEditingId(student.id);
    setActiveTab('add');
  };

  const cleanPhone = (phone) => {
    let d = phone.replace(/[^0-9]/g, '');
    if (/^[7][0-9]{8}$/.test(d)) d = '967' + d;
    else if (/^[5][0-9]{8}$/.test(d)) d = '966' + d;
    else if (/^[9][0-9]{8}$/.test(d)) d = '249' + d;
    return d;
  };

  const API_URL = window.location.hostname === 'localhost' ? 'http://localhost:10000' : 'https://yz-almotakamel-backend.onrender.com';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (validateForm()) {
      setIsSubmitting(true);
      const cleanedPhone = cleanPhone(formData.phone);
      const finalDataToSave = { ...formData, phone: cleanedPhone };

      try {
        if (editingId) {
          await updateDoc(doc(db, 'students', editingId), finalDataToSave);
          setEditingId(null);
          setActiveTab('list');
        } else {
          // NEW: Use Backend API to avoid Firestore hangs
          const response = await fetch(`${API_URL}/api/students/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(finalDataToSave)
          });
          
          if (!response.ok) throw new Error('Failed to add student');
          
          setActiveTab('list');
        }
        setFormData({ name: '', phone: '', username: '', password: '', university: '', major: '', notes: '', platformUrl: '' });
      } catch (err) {
        console.error(err);
        alert('حدث خطأ أثناء إضافة الطالب. يرجى المحاولة مرة أخرى.');
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handleBulkSubmit = async (e) => {
    e.preventDefault();
    if (!bulkData.university || !bulkData.major) return alert('يرجى اختيار الجامعة والتخصص.');
    
    const names = bulkData.names.split('\n').map(s => s.trim()).filter(Boolean);
    const phones = bulkData.phones.split('\n').map(s => s.trim()).filter(Boolean);
    const usernames = bulkData.usernames.split('\n').map(s => s.trim()).filter(Boolean);
    const passwords = bulkData.passwords.split('\n').map(s => s.trim()).filter(Boolean);

    if (names.length === 0) return alert('يرجى إدخال أسماء الطلاب.');
    if (names.length !== phones.length || names.length !== usernames.length || names.length !== passwords.length) {
      return alert(`خطأ في توازن البيانات! \nالأسماء: ${names.length}\nالأرقام: ${phones.length}\nاليوزرات: ${usernames.length}\nكلمات المرور: ${passwords.length}\nيجب أن يكون العدد متساوياً في جميع القوائم.`);
    }

    if (!window.confirm(`هل أنت متأكد من إضافة ${names.length} طلاب دفعة واحدة؟`)) return;

    setIsSubmitting(true);
    try {
      const studentObjects = names.map((name, i) => ({
        name,
        phone: cleanPhone(phones[i]),
        username: usernames[i].replace(/\s/g, ''),
        password: passwords[i].replace(/\s/g, ''),
        university: bulkData.university,
        major: bulkData.major
      }));

      // NEW: Use Backend API for bulk addition
      const response = await fetch(`${API_URL}/api/students/bulk-add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ students: studentObjects })
      });

      if (!response.ok) throw new Error('Bulk add failed');

      alert(`تمت إضافة الطلاب بنجاح!`);
      setBulkData({ university: '', major: '', names: '', phones: '', usernames: '', passwords: '' });
      setActiveTab('list');
    } catch (err) {
      console.error(err);
      alert('حدث خطأ أثناء الإضافة الجماعية.');
    } finally {
      setIsSubmitting(false);
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

  const filteredStudents = studentsList
    .filter(s => {
      const matchSearch = (s.name?.toLowerCase().includes(searchQuery.toLowerCase()) || s.phone?.includes(searchQuery));
      const matchUniv = !filters.university || s.university === filters.university;
      const matchMajor = !filters.major || s.major === filters.major;
      const matchBatch = !filters.batch || s.batch === filters.batch;
      const matchGroup = !filters.group || s.group === filters.group;
      return matchSearch && matchUniv && matchMajor && matchBatch && matchGroup;
    })
    .sort((a, b) => {
      const timeA = a.createdAt?.seconds || 0;
      const timeB = b.createdAt?.seconds || 0;
      return filters.sortBy === 'newest' ? timeB - timeA : timeA - timeB;
    });

  // Get unique batches and groups for filters
  const uniqueBatches = [...new Set(studentsList.map(s => s.batch).filter(Boolean))];
  const uniqueGroups = [...new Set(studentsList.map(s => s.group).filter(Boolean))];

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
          <p style={{ color: 'rgba(255,255,255,0.6)' }}>هذه الصفحة مخصصة للمسؤولين فقط لإدارة السجلات الكاملة للطلاب.</p>
        </div>
      </div>
    );
  }

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
            className={activeTab === 'bulk' ? 'btn-primary' : 'btn-secondary'} 
            onClick={() => setActiveTab('bulk')}
          >
            <UserPlus size={18} /> إضافة بالجملة
          </button>
          <button 
            className={activeTab === 'add' ? 'btn-primary' : 'btn-secondary'} 
            onClick={() => { setActiveTab('add'); setEditingId(null); setFormData({ name: '', phone: '', username: '', password: '', university: '', major: '', notes: '' }); }}
          >
            <UserPlus size={18} /> {editingId ? 'تعديل طالب' : 'طالب جديد'}
          </button>
        </div>
      </div>

      {activeTab === 'bulk' && (
        <div className="glass-panel animate-fade-in-up" style={{ padding: '2.5rem', maxWidth: '1000px', margin: '0 auto' }}>
          <div className="flex items-center gap-3" style={{ marginBottom: '2rem' }}>
            <div style={{ padding: '0.75rem', background: 'var(--brand-primary)', borderRadius: '12px', color: '#fff' }}>
              <UserPlus size={24} />
            </div>
            <div>
              <h2 style={{ margin: 0 }}>إضافة طلاب بالجملة (Bulk Import)</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>أدخل البيانات كقوائم، سطر لكل طالب</p>
            </div>
          </div>

          <form onSubmit={handleBulkSubmit}>
            <div className="grid grid-cols-2 sm-grid-cols-1 gap-6 mb-8">
              <div className="flex-col gap-2">
                <label className="input-label">الجامعة المخصصة</label>
                <select className="input-base" value={bulkData.university} onChange={e => setBulkData({...bulkData, university: e.target.value})} required>
                  <option value="">اختر الجامعة...</option>
                  {univs.sort().map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div className="flex-col gap-2">
                <label className="input-label">التخصص المخصص</label>
                <select className="input-base" value={bulkData.major} onChange={e => setBulkData({...bulkData, major: e.target.value})} required>
                  <option value="">اختر التخصص...</option>
                  {majors.sort().map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-4 md-grid-cols-2 sm-grid-cols-1 gap-4">
              <div className="flex-col gap-2">
                <label className="input-label text-brand">1. أسماء الطلاب (سطر لكل اسم)</label>
                <textarea 
                  className="input-base" 
                  rows="12" 
                  placeholder="محمد أحمد&#10;خالد علي&#10;سارة حسن" 
                  value={bulkData.names} 
                  onChange={e => setBulkData({...bulkData, names: e.target.value})}
                  style={{ fontSize: '0.85rem', lineHeight: '1.6' }}
                ></textarea>
              </div>
              <div className="flex-col gap-2">
                <label className="input-label text-brand">2. أرقام التواصل (سطر لكل رقم)</label>
                <textarea 
                  className="input-base" 
                  rows="12" 
                  placeholder="0512345678&#10;0587654321&#10;0599988877" 
                  value={bulkData.phones} 
                  onChange={e => setBulkData({...bulkData, phones: e.target.value})}
                  style={{ fontSize: '0.85rem', lineHeight: '1.6', direction: 'ltr' }}
                ></textarea>
              </div>
              <div className="flex-col gap-2">
                <label className="input-label text-brand">3. أسماء المستخدمين (سطر لكل يوزر)</label>
                <textarea 
                  className="input-base" 
                  rows="12" 
                  placeholder="user123&#10;khalid99&#10;sara_h" 
                  value={bulkData.usernames} 
                  onChange={e => setBulkData({...bulkData, usernames: e.target.value})}
                  style={{ fontSize: '0.85rem', lineHeight: '1.6', direction: 'ltr' }}
                ></textarea>
              </div>
              <div className="flex-col gap-2">
                <label className="input-label text-brand">4. كلمات المرور (سطر لكل كلمة)</label>
                <textarea 
                  className="input-base" 
                  rows="12" 
                  placeholder="pass123&#10;pass456&#10;pass789" 
                  value={bulkData.passwords} 
                  onChange={e => setBulkData({...bulkData, passwords: e.target.value})}
                  style={{ fontSize: '0.85rem', lineHeight: '1.6', direction: 'ltr' }}
                ></textarea>
              </div>
            </div>

            <div className="mt-8 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-start gap-3">
               <AlertTriangle size={20} className="text-blue-400 mt-1" />
               <p className="text-sm text-blue-200">
                 سيقوم النظام بتنظيف المسافات تلقائياً. تأكد أن كل قائمة تحتوي على نفس عدد الأسطر لضمان دقة البيانات.
               </p>
            </div>

            <div className="flex justify-end gap-4 mt-8">
              <button type="button" className="btn-secondary" onClick={() => setActiveTab('list')}>إلغاء</button>
              <button type="submit" className="btn-primary" disabled={isSubmitting} style={{ padding: '1rem 3rem' }}>
                {isSubmitting ? 'جاري المعالجة...' : 'بدء الإضافة الجماعية'}
              </button>
            </div>
          </form>
        </div>
      )}

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

            <div className="flex-col gap-2" style={{ gridColumn: 'span 2' }}>
              <label className="input-label">رابط المنصة التعليمية</label>
              <input type="url" className="input-base" dir="ltr" placeholder="https://lms.university.edu" value={formData.platformUrl || ''} onChange={e => setFormData({...formData, platformUrl: e.target.value})} />
            </div>

            <div className="flex-col gap-2">
              <label className="input-label">الجامعة المراد التسجيل بها</label>
              <select 
                className="input-base" 
                value={formData.university} 
                onChange={e => setFormData({...formData, university: e.target.value})}
                required
              >
                <option value="">اختر الجامعة</option>
                {univs.sort().map((u, i) => (
                  <option key={i} value={u}>{u}</option>
                ))}
              </select>
            </div>

            <div className="flex-col gap-2">
              <label className="input-label">التخصص</label>
              <select 
                className="input-base" 
                value={formData.major} 
                onChange={e => setFormData({...formData, major: e.target.value})}
                required
              >
                <option value="">اختر التخصص</option>
                {majors.sort().map((m, i) => (
                  <option key={i} value={m}>{m}</option>
                ))}
              </select>
            </div>
            
            <div className="flex-col gap-2">
              <label className="input-label">رقم الدفعة</label>
              <input type="text" className="input-base" placeholder="مثلاً: 2024" value={formData.batch} onChange={e => setFormData({...formData, batch: e.target.value})} />
            </div>

            <div className="flex-col gap-2">
              <label className="input-label">رقم الهوية</label>
              <input type="text" className="input-base" placeholder="رقم الهوية الوطنية" value={formData.idNumber} onChange={e => setFormData({...formData, idNumber: e.target.value})} />
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
          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <div className="flex flex-col gap-4">
              {/* Main Search */}
              <div style={{ position: 'relative' }}>
                <Search size={20} style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', opacity: 0.3 }} />
                <input 
                  type="text" 
                  className="input-base" 
                  style={{ paddingRight: '2.8rem' }} 
                  placeholder="ابحث بالاسم أو رقم الهاتف..." 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>

              {/* Filters Bar */}
              <div className="grid grid-cols-5 sm-grid-cols-2 gap-3">
                <select className="input-base" value={filters.university} onChange={e => setFilters({...filters, university: e.target.value})}>
                  <option value="">كل الجامعات</option>
                  {univs.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
                <select className="input-base" value={filters.major} onChange={e => setFilters({...filters, major: e.target.value})}>
                  <option value="">كل التخصصات</option>
                  {majors.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <select className="input-base" value={filters.batch} onChange={e => setFilters({...filters, batch: e.target.value})}>
                  <option value="">كل الدفعات</option>
                  {uniqueBatches.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
                <select className="input-base" value={filters.group} onChange={e => setFilters({...filters, group: e.target.value})}>
                  <option value="">كل المجموعات</option>
                  {uniqueGroups.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
                <select className="input-base" value={filters.sortBy} onChange={e => setFilters({...filters, sortBy: e.target.value})}>
                  <option value="newest">الأحدث تسجيلاً</option>
                  <option value="oldest">الأقدم أولاً</option>
                </select>
              </div>
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
