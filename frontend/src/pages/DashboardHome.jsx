import React, { useState, useEffect } from 'react';
import { Users, ClipboardCheck, Clock, MessageSquare, ArrowUpRight, TrendingUp, Star, Calendar } from 'lucide-react';
import { db, auth } from '../firebase';
import { collection, query, where, getDocs, onSnapshot, limit, orderBy } from 'firebase/firestore';

export default function DashboardHome() {
  const [userProfile, setUserProfile] = useState(null);
  const [stats, setStats] = useState([
    { label: 'إجمالي الطلاب', value: '0', icon: <Users size={26} />, color: 'var(--brand-primary)', trend: '+0%' },
    { label: 'الطلبات النشطة', value: '0', icon: <ClipboardCheck size={26} />, color: 'var(--warning)', trend: '+0%' },
    { label: 'إجمالي المسجلين', value: '0', icon: <Star size={26} />, color: 'var(--success)', trend: '+0%' },
    { label: 'المهام اليومية', value: '5', icon: <Calendar size={26} />, color: 'var(--info)', trend: 'ثابت' },
  ]);
  const [recentStudents, setRecentStudents] = useState([]);

  useEffect(() => {
    // 1. Fetch User Role/Profile
    if (auth.currentUser) {
      const unsubUser = onSnapshot(collection(db, 'employees'), (snap) => {
        const matching = snap.docs.find(d => d.data().email === auth.currentUser.email);
        if (matching) setUserProfile(matching.data());
      });

      // 2. Real-time Stats
      const unsubStudents = onSnapshot(collection(db, 'students'), (snap) => {
        const count = snap.size;
        setStats(prev => {
          const newStats = [...prev];
          newStats[0].value = count.toLocaleString();
          return newStats;
        });
        
        // Latest Students
        const latest = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
          .slice(0, 5);
        setRecentStudents(latest);
      });

      const unsubOrders = onSnapshot(collection(db, 'orders'), (snap) => {
        const count = snap.size;
        setStats(prev => {
          const newStats = [...prev];
          newStats[1].value = count.toLocaleString();
          return newStats;
        });
      });

      return () => { unsubUser(); unsubStudents(); unsubOrders(); };
    }
  }, []);

  return (
    <div className="animate-fade-in-up">
      <div className="flex justify-between items-center" style={{ marginBottom: '2rem' }}>
        <div>
          <h1 style={{ marginBottom: '0.25rem', fontSize: '1.8rem' }}>
            مرحباً بك، {userProfile?.name || 'زميلنا العزيز'} 👋
          </h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            {auth.currentUser?.email === 'admin@system.com' 
              ? 'إليك نظرة سريعة على أداء المنصة الشامل.' 
              : 'إليك ملخص مهامك وطلابك المسجلين لليوم.'}
          </p>
        </div>
        <div className="flex gap-3">
          <div className="glass-panel" style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
            <Clock size={16} color="var(--brand-secondary)" />
            <span>{new Date().toLocaleDateString('ar-SA', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 md-grid-cols-2 sm-grid-cols-1" style={{ marginBottom: '2.5rem' }}>
        {stats.map((s, i) => (
          <div key={i} className="glass-panel hover-card" style={{ 
            padding: '1.75rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
            position: 'relative',
            overflow: 'hidden',
            transition: 'transform 0.3s ease'
          }}>
            <div style={{ 
              position: 'absolute', top: '-20px', left: '-20px', 
              width: '100px', height: '100px', 
              background: s.color, opacity: 0.05, filter: 'blur(40px)',
              pointerEvents: 'none'
            }}></div>

            <div className="flex justify-between items-start">
              <div style={{ 
                width: '56px', height: '56px', 
                borderRadius: '16px', 
                background: `color-mix(in srgb, ${s.color} 15%, rgba(255,255,255,0.05))`,
                color: s.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: `0 8px 20px -5px color-mix(in srgb, ${s.color} 30%, transparent)`
              }}>
                {s.icon}
              </div>
              <span className="badge" style={{ 
                background: 'rgba(255, 255, 255, 0.05)',
                color: 'var(--text-secondary)',
                fontSize: '0.75rem'
              }}>
                {s.trend}
              </span>
            </div>
            
            <div>
              <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', marginBottom: '0.25rem', fontWeight: 500 }}>{s.label}</p>
              <h3 style={{ fontSize: '2.2rem', margin: 0, fontWeight: 800 }}>{s.value}</h3>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 md-grid-cols-1" style={{ gap: '2rem' }}>
        <div className="glass-panel" style={{ padding: '2rem', gridColumn: 'span 2' }}>
          <div className="flex justify-between items-center" style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ margin: 0 }}>آخر الطلاب المضافين</h3>
            <button className="btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>مشاهدة الكل</button>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {recentStudents.map((student, idx) => (
              <div key={student.id} className="flex items-center justify-between" style={{ padding: '1rem', borderRadius: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="flex items-center gap-4">
                  <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'var(--brand-primary)' }}>
                    {student.name?.charAt(0)}
                  </div>
                  <div>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem' }}>{student.name}</p>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{student.university} - {student.major}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                   <span className="badge badge-info" style={{ fontSize: '0.7rem' }}>{student.mainStatus || 'جديد'}</span>
                </div>
              </div>
            ))}
            {recentStudents.length === 0 && (
               <div style={{ textAlign: 'center', padding: '2rem', opacity: 0.5 }}>لا توجد بيانات متاحة حالياً.</div>
            )}
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '2rem' }}>
          <div className="flex items-center gap-2" style={{ marginBottom: '1.5rem' }}>
            <TrendingUp size={20} style={{ color: 'var(--brand-secondary)' }} />
            <h3 style={{ margin: 0 }}>إجراءات سريعة</h3>
          </div>
          
          <div className="flex-col gap-3">
             <button className="btn-secondary" style={{ width: '100%', textAlign: 'right', padding: '1rem' }}>
                <Users size={18} /> إضافة طالب جديد
             </button>
             <button className="btn-secondary" style={{ width: '100%', textAlign: 'right', padding: '1rem' }}>
                <MessageSquare size={18} /> الرد على المحادثات
             </button>
             <button className="btn-secondary" style={{ width: '100%', textAlign: 'right', padding: '1rem' }}>
                <ClipboardCheck size={18} /> إدارة الطلبات المفتوحة
             </button>
          </div>
        </div>
      </div>
    </div>
  );
}
