import React, { useState, useEffect } from 'react';
import { Users, ClipboardCheck, MessageSquare, ArrowUpRight, TrendingUp, Star, UserPlus, Shield, UserCheck } from 'lucide-react';
import { db, rtdb, auth } from '../firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { ref, onValue } from 'firebase/database';

export default function DashboardHome() {
  const [userProfile, setUserProfile] = useState(null);
  const [waStatus, setWaStatus] = useState('checking');
  const [stats, setStats] = useState([
    { label: 'إجمالي الطلاب', value: '0', icon: <Users size={26} />, color: '#3b82f6', trend: '+12%' },
    { label: 'الطلبات النشطة', value: '0', icon: <ClipboardCheck size={26} />, color: '#f59e0b', trend: '+5%' },
    { label: 'إجمالي المسجلين', value: '0', icon: <Star size={26} />, color: '#10b981', trend: '+8%' },
    { label: 'المهام اليومية', value: '75%', icon: <TrendingUp size={26} />, color: '#0ea5e9', trend: 'نشط' },
  ]);
  const [recentStudents, setRecentStudents] = useState([]);
  const employeeId = auth.currentUser?.email?.split('@')[0].replace(/[^a-zA-Z0-9]/g, '') || 'emp1';

  useEffect(() => {
    if (auth.currentUser) {
      // 1. Fetch User Profile
      const unsubUser = onSnapshot(collection(db, 'employees'), (snap) => {
        const matching = snap.docs.find(d => d.data().email === auth.currentUser.email);
        if (matching) setUserProfile(matching.data());
      });

      // 2. Real-time Message/Stats Logic
      const unsubStudents = onSnapshot(collection(db, 'students'), (snap) => {
        setStats(prev => {
          const newStats = [...prev];
          newStats[0].value = snap.size.toLocaleString();
          return newStats;
        });
        const latest = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
          .slice(0, 5);
        setRecentStudents(latest);
      });

      const unsubOrders = onSnapshot(collection(db, 'orders'), (snap) => {
        setStats(prev => {
          const newStats = [...prev];
          newStats[1].value = snap.size.toLocaleString();
          return newStats;
        });
      });

      // 3. Listen for WhatsApp Status via RTDB
      const statusRef = ref(rtdb, `status/${employeeId}`);
      const unsubStatus = onValue(statusRef, (snapshot) => {
        const data = snapshot.val();
        if (data?.isConnected) setWaStatus('connected');
        else if (data?.qr) setWaStatus('qr_needed');
        else setWaStatus('disconnected');
      });

      return () => { unsubUser(); unsubStudents(); unsubOrders(); unsubStatus(); };
    }
  }, [employeeId]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'صباح الخير';
    if (hour < 18) return 'طاب يومك';
    return 'مساء الخير';
  };

  return (
    <div className="animate-fade-in-up space-y-8 pb-10">
      {/* Welcome Header */}
      <div className="flex justify-between items-end bg-gradient-to-r from-blue-600/10 to-transparent p-8 rounded-[2rem] border-r-4 border-blue-500">
        <div>
          <h1 className="text-4xl font-black text-white mb-2">
            {getGreeting()}، {userProfile?.name?.split(' ')[0] || 'زميلنا'}
          </h1>
          <p className="text-slate-400 text-lg">
            لديك <span className="text-blue-400 font-bold">{recentStudents.length}</span> طلاب جدد بانتظار تواصلك اليوم.
          </p>
        </div>
        <div className="text-left">
           <div className="p-3 glass-panel rounded-2xl flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full animate-pulse ${waStatus === 'connected' ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
              <span className="text-sm font-bold text-slate-300">
                واتساب: {waStatus === 'connected' ? 'متصل ونشط' : 'بانتظار الربط'}
              </span>
           </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 md:grid-cols-2 sm:grid-cols-1 gap-6">
        {stats.map((s, i) => (
          <div key={i} className="glass-panel group hover:bg-white/[0.05] transition-all p-6 relative overflow-hidden">
            <div style={{ position: 'absolute', top: '-20px', left: '-20px', width: '100px', height: '100px', background: s.color, opacity: 0.1, filter: 'blur(40px)' }}></div>
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 rounded-xl bg-white/5 text-white" style={{ color: s.color }}>{s.icon}</div>
              <span className="text-[0.65rem] font-bold bg-white/5 px-2 py-1 rounded-lg text-slate-400">{s.trend}</span>
            </div>
            <p className="text-slate-400 text-sm font-medium mb-1">{s.label}</p>
            <h3 className="text-3xl font-black text-white">{s.value}</h3>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 lg:grid-cols-1 gap-8">
        {/* Recent Students */}
        <div className="glass-panel col-span-2 p-8">
          <div className="flex justify-between items-center mb-8">
            <h3 className="text-2xl font-bold m-0 flex items-center gap-3">
              <Users className="text-blue-500" /> الطلاب الجدد
            </h3>
            <button className="text-blue-400 text-sm font-bold hover:underline">عرض الكل</button>
          </div>
          
          <div className="space-y-4">
            {recentStudents.map((student) => (
              <div key={student.id} className="group flex items-center justify-between p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] transition-all">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center font-bold text-blue-500 text-xl border border-white/5">
                    {student.name?.charAt(0)}
                  </div>
                  <div>
                    <h4 className="text-white font-bold m-0 text-md">{student.name}</h4>
                    <span className="text-[0.7rem] text-slate-500 uppercase">{student.university} | {student.major}</span>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="px-3 py-1 rounded-lg bg-blue-500/10 text-blue-400 text-[0.65rem] font-bold border border-blue-500/20">
                    {student.batch || '2024'}
                  </span>
                  <button className="p-2 rounded-lg bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <ArrowUpRight size={18} />
                  </button>
                </div>
              </div>
            ))}
            {recentStudents.length === 0 && (
               <div className="text-center py-12 text-slate-500 italic">لا توجد اشتراكات جديدة.</div>
            )}
          </div>
        </div>

        {/* Quick Actions & Progress */}
        <div className="space-y-6">
          <div className="glass-panel p-8 bg-gradient-to-br from-blue-600/10 to-transparent">
            <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
               <TrendingUp size={20} className="text-blue-500" /> إجراءات سريعة
            </h3>
            <div className="space-y-3">
               <button className="w-full flex items-center gap-4 p-4 rounded-2xl bg-white/5 hover:bg-blue-500/20 border border-white/5 transition-all text-right">
                  <UserPlus size={18} className="text-blue-400" />
                  <span className="font-bold text-sm">إضافة طالب</span>
               </button>
               <button className="w-full flex items-center gap-4 p-4 rounded-2xl bg-white/5 hover:bg-emerald-500/20 border border-white/5 transition-all text-right">
                  <MessageSquare size={18} className="text-emerald-400" />
                  <span className="font-bold text-sm">فتح الدردشات</span>
               </button>
               <button className="w-full flex items-center gap-4 p-4 rounded-2xl bg-white/5 hover:bg-amber-500/20 border border-white/5 transition-all text-right">
                  <ClipboardCheck size={18} className="text-amber-400" />
                  <span className="font-bold text-sm">الطلبات المعلقة</span>
               </button>
            </div>
          </div>

          <div className="glass-panel p-8">
            <h4 className="text-xs font-bold text-slate-500 mb-4 uppercase tracking-widest text-center">الإنجاز المستهدف اليوم</h4>
            <div className="w-full h-3 bg-white/5 rounded-full overflow-hidden mb-3">
              <div className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full" style={{ width: '65%' }}></div>
            </div>
            <div className="flex justify-between text-[0.7rem] font-bold text-slate-400">
              <span>مكتمل: 65%</span>
              <span>المتبقي: 35%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
