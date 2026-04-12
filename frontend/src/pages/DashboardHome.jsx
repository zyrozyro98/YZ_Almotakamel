import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, ClipboardCheck, Clock, MessageSquare, 
  ArrowUpRight, TrendingUp, Star, Calendar, 
  ChevronLeft, Plus, MessageCircle
} from 'lucide-react';
import { db, auth } from '../firebase';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';

export default function DashboardHome() {
  const navigate = useNavigate();
  const [userProfile, setUserProfile] = useState(null);
  const [stats, setStats] = useState([
    { label: 'إجمالي الطلاب', value: '0', icon: <Users size={24} />, color: '#3b82f6', path: '/students' },
    { label: 'الطلبات النشطة', value: '0', icon: <ClipboardCheck size={24} />, color: '#f59e0b', path: '/orders' },
    { label: 'المتصلين حالياً', value: '0', icon: <Star size={24} />, color: '#10b981', path: '/live-monitoring' },
    { label: 'رسائل اليوم', value: '0', icon: <MessageSquare size={24} />, color: '#6366f1', path: '/chat' },
  ]);
  const [recentStudents, setRecentStudents] = useState([]);
  const [employeeId, setEmployeeId] = useState('emp1');

  useEffect(() => {
    if (!auth.currentUser) return;
    const id = auth.currentUser.email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');
    setEmployeeId(id);

    // Fetch Stats & Recent Data
    const unsubStudents = onSnapshot(collection(db, 'students'), (snap) => {
      setStats(prev => {
        const next = [...prev];
        next[0].value = snap.size.toLocaleString();
        return next;
      });
      const latest = snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
        .slice(0, 4);
      setRecentStudents(latest);
    });

    const unsubOrders = onSnapshot(collection(db, 'orders'), (snap) => {
      setStats(prev => {
        const next = [...prev];
        next[1].value = snap.size.toLocaleString();
        return next;
      });
    });

    return () => { unsubStudents(); unsubOrders(); };
  }, []);

  return (
    <div className="space-y-8 animate-fade-in-up">
      {/* Welcome Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-white mb-2">
            مرحباً بك، <span className="text-brand-primary">@{employeeId}</span> 👋
          </h1>
          <p className="text-white/50 text-sm font-medium">
            لديك اليوم نشاط ملحوظ في قاعدة البيانات. إليك ملخص سريع.
          </p>
        </div>
        <div className="flex gap-3">
          <div className="glass-panel px-4 py-2 flex items-center gap-2 text-xs font-bold text-white/70">
            <Clock size={16} className="text-brand-secondary" />
            {new Date().toLocaleDateString('ar-SA', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((s, i) => (
          <div 
            key={i} 
            onClick={() => navigate(s.path)}
            className="glass-panel p-6 group cursor-pointer hover:bg-white/5 transition-all relative overflow-hidden active:scale-95"
          >
            <div className="absolute -right-8 -top-8 w-24 h-24 rounded-full opacity-10 group-hover:scale-150 transition-transform duration-700" style={{ backgroundColor: s.color }}></div>
            <div className="flex justify-between items-start mb-4">
              <div 
                className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg" 
                style={{ backgroundColor: `${s.color}20`, color: s.color }}
              >
                {s.icon}
              </div>
              <ArrowUpRight size={16} className="text-white/20 group-hover:text-white transition-colors" />
            </div>
            <div>
              <p className="text-white/40 text-xs font-bold mb-1 uppercase tracking-wider">{s.label}</p>
              <h3 className="text-3xl font-black text-white">{s.value}</h3>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Students Table */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex justify-between items-center px-2">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Users size={20} className="text-brand-primary" /> طلاب أضيفوا حديثاً
            </h3>
            <button 
              onClick={() => navigate('/students')}
              className="text-brand-secondary text-xs font-bold hover:underline flex items-center gap-1"
            >
              مشاهدة الكل <ChevronLeft size={14} />
            </button>
          </div>
          
          <div className="glass-panel overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right">
                <thead>
                  <tr className="bg-white/5 text-white/30 text-[10px] uppercase font-black">
                    <th className="p-4">الاسم</th>
                    <th className="p-4">الجامعة</th>
                    <th className="p-4">الحالة</th>
                    <th className="p-4 text-left">الإجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {recentStudents.map((student) => (
                    <tr key={student.id} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="p-4 text-sm font-bold text-white flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-brand-primary/20 text-brand-primary flex items-center justify-center text-xs">
                          {student.name?.charAt(0)}
                        </div>
                        {student.name}
                      </td>
                      <td className="p-4 text-xs text-white/50">{student.university}</td>
                      <td className="p-4">
                        <span className="bg-brand-secondary/10 text-brand-secondary text-[10px] px-2 py-1 rounded-md border border-brand-secondary/20">
                          {student.mainStatus || 'جديد'}
                        </span>
                      </td>
                      <td className="p-4 text-left">
                        <button className="p-2 hover:text-white text-white/20 transition-colors">
                          <MessageCircle size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Quick Actions & Tips */}
        <div className="space-y-6">
          <h3 className="text-lg font-bold text-white flex items-center gap-2 px-2">
            <TrendingUp size={20} className="text-brand-secondary" /> اختصارات سريعة
          </h3>
          <div className="grid gap-3">
            <button 
              onClick={() => navigate('/students')}
              className="glass-panel p-4 flex items-center gap-3 hover:bg-white/5 transition-all text-sm font-bold text-white/70 active:scale-95 text-right w-full"
            >
              <div className="w-10 h-10 rounded-xl bg-green-500/10 text-green-500 flex items-center justify-center">
                <Plus size={20} />
              </div>
              إضافة طالب جديد للمنظومة
            </button>
            <button 
              onClick={() => navigate('/chat')}
              className="glass-panel p-4 flex items-center gap-3 hover:bg-white/5 transition-all text-sm font-bold text-white/70 active:scale-95 text-right w-full"
            >
              <div className="w-10 h-10 rounded-xl bg-brand-primary/10 text-brand-primary flex items-center justify-center">
                <MessageCircle size={20} />
              </div>
              الرد على استفسارات الطلاب
            </button>
            <button 
              onClick={() => navigate('/whatsapp-config')}
              className="glass-panel p-4 flex items-center gap-3 hover:bg-white/5 transition-all text-sm font-bold text-white/70 active:scale-95 text-right w-full"
            >
              <div className="w-10 h-10 rounded-xl bg-orange-500/10 text-orange-500 flex items-center justify-center">
                <Calendar size={20} />
              </div>
              تحقق من حالة الاتصال
            </button>
          </div>

          {/* Tips Box */}
          <div className="glass-panel p-6 bg-gradient-to-br from-brand-primary/10 to-transparent border-brand-primary/20">
            <h4 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
              <Star size={16} className="text-yellow-400" /> نصيحة اليوم
            </h4>
            <p className="text-xs text-white/50 leading-relaxed font-medium">
              تأكد دائماً من تحديث "الحالة الفرعية" للطلاب لضمان وصول الإشعارات الصحيحة لهم عبر واتساب تلقائياً.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
