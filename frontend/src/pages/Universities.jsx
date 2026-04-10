import React, { useState, useEffect } from 'react';
import { Building, BookOpen, PlusCircle, Edit, Trash2 } from 'lucide-react';
import { db } from '../firebase';
import { collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';

export default function Universities() {
  const [activeTab, setActiveTab] = useState('جامعات'); // جامعات أو تخصصات
  const [universities, setUniversities] = useState([]);
  const [majors, setMajors] = useState([]);

  useEffect(() => {
    const unsubUniv = onSnapshot(collection(db, 'universities'), (snapshot) => {
      setUniversities(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => console.log('Univ Read Error', err));
    
    const unsubMaj = onSnapshot(collection(db, 'majors'), (snapshot) => {
      setMajors(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => console.log('Major Read Error', err));
    
    return () => { unsubUniv(); unsubMaj(); };
  }, []);

  const handleAdd = async () => {
    try {
      if (activeTab === 'جامعات') {
        const name = window.prompt('أدخل اسم الجامعة الجديدة:');
        if (!name) return;
        const city = window.prompt('أدخل المنطقة / المدينة:') || 'غير محدد';
        await addDoc(collection(db, 'universities'), { name, city, status: 'نشط' });
      } else {
        const name = window.prompt('أدخل اسم التخصص الجديد:');
        if (!name) return;
        const department = window.prompt('أدخل مسار القسم أو الكلية:') || 'غير محدد';
        await addDoc(collection(db, 'majors'), { name, department, status: 'نشط' });
      }
    } catch (error) {
      alert('حدث خطأ أثناء الإضافة. يرجى مراجعة الصلاحيات.');
    }
  };

  const handleEdit = async (item) => {
    try {
      const newName = window.prompt('تعديل الاسم:', item.name);
      if (!newName) return;
      
      if (activeTab === 'جامعات') {
         const newCity = window.prompt('تعديل المدينة:', item.city) || item.city;
         await updateDoc(doc(db, 'universities', item.id), { name: newName, city: newCity });
      } else {
         const newDept = window.prompt('تعديل القسم/الكلية:', item.department) || item.department;
         await updateDoc(doc(db, 'majors', item.id), { name: newName, department: newDept });
      }
    } catch (err) {
      alert('خطأ أثناء التعديل. تأكد من فتح الصلاحيات في فايربيس.');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('متأكد من الحذف؟')) return;
    try {
      const colName = activeTab === 'جامعات' ? 'universities' : 'majors';
      await deleteDoc(doc(db, colName, id));
    } catch (err) {
      console.error(err);
      alert('خطأ أثناء الحذف. يرجى التأكد من صلاحيات فايربيس.');
    }
  };

  return (
    <div className="animate-fade-in-up" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: '2rem' }}>
        <h1 style={{ margin: 0 }}>إدارة الجامعات والتخصصات</h1>
        
        <div className="flex gap-2" style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '0.3rem', borderRadius: '10px' }}>
          <button 
            style={{
              padding: '0.5rem 1.5rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.5rem',
              background: activeTab === 'جامعات' ? 'var(--brand-primary)' : 'transparent',
              color: activeTab === 'جامعات' ? '#fff' : 'var(--text-secondary)'
            }}
            onClick={() => setActiveTab('جامعات')}
          >
            <Building size={18} /> الجامعات
          </button>
          <button 
            style={{
              padding: '0.5rem 1.5rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.5rem',
              background: activeTab === 'تخصصات' ? 'var(--brand-primary)' : 'transparent',
              color: activeTab === 'تخصصات' ? '#fff' : 'var(--text-secondary)'
            }}
            onClick={() => setActiveTab('تخصصات')}
          >
            <BookOpen size={18} /> التخصصات
          </button>
        </div>
      </div>

      <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, color: 'var(--brand-secondary)' }}>
            قائمة {activeTab === 'جامعات' ? 'الجامعات المعتمدة' : 'التخصصات الأكاديمية'}
          </h3>
          <button onClick={handleAdd} className="btn-primary flex items-center gap-2">
            <PlusCircle size={18} /> إضافة {activeTab === 'جامعات' ? 'جامعة' : 'تخصص'} جديد
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.02)', color: 'var(--text-secondary)' }}>
                <th style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--glass-border)' }}>الاسم</th>
                <th style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--glass-border)' }}>
                  {activeTab === 'جامعات' ? 'المدينة' : 'القسم / الكلية'}
                </th>
                <th style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--glass-border)' }}>الحالة</th>
                <th style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--glass-border)' }}>خيارات</th>
              </tr>
            </thead>
            <tbody>
              {(activeTab === 'جامعات' ? universities : majors).map(item => (
                <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }} className="hover:bg-slate-800/30">
                  <td style={{ padding: '1rem 1.5rem', fontWeight: 600 }}>{item.name}</td>
                  <td style={{ padding: '1rem 1.5rem' }}>{item.city || item.department}</td>
                  <td style={{ padding: '1rem 1.5rem' }}>
                    <span style={{ 
                      background: 'rgba(16, 185, 129, 0.15)', color: 'var(--success)',
                      padding: '4px 12px', borderRadius: '12px', fontSize: '0.85rem', fontWeight: 'bold'
                    }}>{item.status || 'نشط'}</span>
                  </td>
                  <td style={{ padding: '1rem 1.5rem', display: 'flex', gap: '0.5rem' }}>
                    <button onClick={() => handleEdit(item)} style={{ background: 'rgba(59, 130, 246, 0.2)', padding: '0.5rem', borderRadius: '8px', color: 'var(--brand-primary)' }}>
                      <Edit size={16} />
                    </button>
                    <button onClick={() => handleDelete(item.id)} style={{ background: 'rgba(239, 68, 68, 0.2)', padding: '0.5rem', borderRadius: '8px', color: 'var(--danger)' }}>
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(activeTab === 'جامعات' ? universities : majors).length === 0 && (
             <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>لا توجد بيانات مسجلة.</div>
          )}
        </div>
      </div>
    </div>
  );
}
