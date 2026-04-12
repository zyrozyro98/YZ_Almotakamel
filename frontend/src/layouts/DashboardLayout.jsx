import React, { useState, useEffect } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, ClipboardList, MessageCircle, FileText, Bell, ImagePlus, Building, PieChart, Menu, X, LogOut, ChevronLeft, Smartphone, Radio, Wifi } from 'lucide-react';
import { rtdb, auth } from '../firebase';
import { ref, onValue, update } from 'firebase/database';

export default function DashboardLayout() {
  const [notifications, setNotifications] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState('emp1');
  const [isAdmin, setIsAdmin] = useState(false);
  const [dbConnected, setDbConnected] = useState(false);

  // 1. Auth Listener
  useEffect(() => {
    const unsubAuth = auth.onAuthStateChanged(user => {
      if (user) {
        setEmployeeId(user.email.split('@')[0].replace(/[^a-zA-Z0-9]/g, ''));
        setIsAdmin(user.email === 'yazans95@gmail.com' || user.email === 'zyrozyro98@gmail.com');
      }
    });
    return () => unsubAuth();
  }, []);

  // 2. Database Connection Monitor (Heartbeat)
  useEffect(() => {
    const connectedRef = ref(rtdb, '.info/connected');
    const unsub = onValue(connectedRef, (snap) => {
      setDbConnected(snap.val() === true);
    });
    return () => unsub();
  }, []);

  // 3. Notifications Listener (V2)
  useEffect(() => {
    if (!employeeId || employeeId === 'emp1') return;
    const notifsRef = ref(rtdb, `v2_notifications/${employeeId}`);
    const unsub = onValue(notifsRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        setNotifications(Object.keys(data).map(k => ({ id: k, ...data[k] })).reverse());
      } else {
        setNotifications([]);
      }
    });
    return () => unsub();
  }, [employeeId]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAllAsRead = () => {
    if (employeeId === 'emp1') return;
    notifications.forEach(n => {
      if (!n.read) update(ref(rtdb, `v2_notifications/${employeeId}/${n.id}`), { read: true });
    });
  };

  const navItems = [
    { path: '/dashboard', label: 'الرئيسية', icon: <LayoutDashboard size={20} />, adminOnly: false },
    { path: '/students', label: 'الطلاب', icon: <Users size={20} />, adminOnly: false },
    { path: '/employees', label: 'فريق العمل', icon: <Users size={20} />, adminOnly: true },
    { path: '/universities', label: 'الجامعات والتخصصات', icon: <Building size={20} />, adminOnly: true },
    { path: '/orders', label: 'الطلبات', icon: <ClipboardList size={20} />, adminOnly: false },
    { path: '/chat', label: 'دردشة الواتساب', icon: <MessageCircle size={20} />, adminOnly: false },
    { path: '/live-monitoring', label: 'الرقابة الحية', icon: <Radio size={20} />, adminOnly: true },
    { path: '/whatsapp-config', label: 'إعدادات الربط', icon: <Smartphone size={20} />, adminOnly: false },
    { path: '/receipts', label: 'الإيصالات والتقارير', icon: <FileText size={20} />, adminOnly: false },
    { path: '/photosender', label: 'إرسال صور الحضور', icon: <ImagePlus size={20} />, adminOnly: false },
    { path: '/reports', label: 'الرقابة والإحصائيات', icon: <PieChart size={20} />, adminOnly: true },
  ].filter(i => !i.adminOnly || isAdmin);

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {isSidebarOpen && <div className="mobile-overlay" onClick={() => setIsSidebarOpen(false)}></div>}

      <aside className={`glass-panel sidebar-container ${isSidebarOpen ? 'open' : ''}`} style={{ width: '280px', display: 'flex', flexDirection: 'column', background: '#1e293b' }}>
        <div style={{ padding: '24px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#fff', margin: 0 }}>دبلومالاين</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
             <Wifi size={12} style={{ color: dbConnected ? '#10b981' : '#ef4444' }} />
             <span style={{ fontSize: '10px', color: dbConnected ? '#10b981' : '#ef4444', fontWeight: 800 }}>
               {dbConnected ? 'النظام متصل لحظياً' : 'جاري الاتصال...'}
             </span>
          </div>
        </div>

        <nav style={{ flex: 1, padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto' }}>
          {navItems.map(item => (
            <NavLink 
              key={item.path} to={item.path} onClick={() => setIsSidebarOpen(false)}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderRadius: '12px',
                color: isActive ? '#fff' : '#94a3b8', background: isActive ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                textDecoration: 'none', fontWeight: 600, fontSize: '0.9rem'
              })}
            >
              {item.icon} {item.label}
            </NavLink>
          ))}
        </nav>

        <div style={{ padding: '20px', borderTop: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'var(--brand-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>{employeeId[0].toUpperCase()}</div>
              <div><p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700 }}>{employeeId}</p><p style={{ margin: 0, fontSize: '0.7rem', color: '#10b981' }}>نشط</p></div>
            </div>
            <button onClick={() => auth.signOut()} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}><LogOut size={20} /></button>
          </div>
        </div>
      </aside>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#0f172a' }}>
        <header style={{ height: '70px', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <Menu size={24} className="show-on-mobile" style={{ color: '#fff', cursor: 'pointer' }} onClick={() => setIsSidebarOpen(true)} />
            <h3 style={{ margin: 0, color: '#fff' }}>لوحة التحكم</h3>
          </div>
          <div style={{ position: 'relative' }}>
            <button onClick={() => { setShowDropdown(!showDropdown); if(!showDropdown) markAllAsRead(); }} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#fff', padding: '10px', borderRadius: '10px', position: 'relative', cursor: 'pointer' }}>
              <Bell size={20} />
              {unreadCount > 0 && <span style={{ position: 'absolute', top: '5px', right: '5px', width: '8px', height: '8px', background: '#ef4444', borderRadius: '50%' }}></span>}
            </button>
            {showDropdown && (
              <div className="glass-panel" style={{ position: 'absolute', top: '55px', left: 0, width: '300px', maxHeight: '400px', overflowY: 'auto', zIndex: 100, padding: '15px' }}>
                <h4 style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '10px', marginBottom: '10px' }}>الإشعارات</h4>
                {notifications.length === 0 ? <p style={{ textAlign: 'center', opacity: 0.3 }}>لا توجد إشعارات</p> : 
                  notifications.map(n => <div key={n.id} style={{ padding: '10px', background: n.read ? 'none' : 'rgba(59,130,246,0.1)', borderRadius: '8px', marginBottom: '5px' }}>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: '0.85rem' }}>{n.title}</p>
                    <p style={{ margin: '3px 0 0', fontSize: '0.75rem', opacity: 0.7 }}>{n.body}</p>
                  </div>)
                }
              </div>
            )}
          </div>
        </header>
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}><Outlet /></div>
      </main>
    </div>
  );
}
