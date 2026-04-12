import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, ClipboardList, MessageCircle, FileText, Bell, ImagePlus, Building, PieChart, Menu, X, LogOut, ChevronLeft, Smartphone, Radio } from 'lucide-react';
import { rtdb, auth } from '../firebase';
import { ref, onValue, update } from 'firebase/database';

export default function DashboardLayout() {
  const [notifications, setNotifications] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState('emp1'); // Now using UID
  const [isAdmin, setIsAdmin] = useState(false);
  const navigate = useNavigate();

  // 1. Reactive Auth Listener - The Golden Key Migration
  useEffect(() => {
    const unsubAuth = auth.onAuthStateChanged(user => {
      if (user) {
        // GOLDEN KEY: Use auth.uid instead of email parts
        const id = user.uid;
        const adminStatus = user.email === 'yazans95@gmail.com' || user.email === 'zyrozyro98@gmail.com';
        setEmployeeId(id);
        setIsAdmin(adminStatus);
      } else {
        setEmployeeId('emp1');
        setIsAdmin(false);
      }
    });
    return () => unsubAuth();
  }, []);

  // 2. Real-time Notifications Listener using Golden Key
  useEffect(() => {
    if (!employeeId || employeeId === 'emp1') return;

    const notifsRef = ref(rtdb, `notifications/${employeeId}`);
    const unsubscribe = onValue(notifsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const parsed = Object.keys(data).map(key => ({ id: key, ...data[key] })).reverse();
        setNotifications(parsed);
      } else {
        setNotifications([]);
      }
    });

    return () => unsubscribe();
  }, [employeeId]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAllAsRead = () => {
    if (employeeId === 'emp1') return;
    notifications.forEach(n => {
      if (!n.read) {
        update(ref(rtdb, `notifications/${employeeId}/${n.id}`), { read: true });
      }
    });
  };

  const handleNotificationClick = async (notif) => {
    if (employeeId === 'emp1' || !notif.chatId) return;

    // 1. Mark all NOTIFS from same student as read
    const sameStudentNotifs = notifications.filter(n => n.chatId === notif.chatId && !n.read);
    for (const n of sameStudentNotifs) {
      update(ref(rtdb, `notifications/${employeeId}/${n.id}`), { read: true });
    }

    // 2. Navigate to chat with the target chatId INSTANTLY
    navigate(`/chat?select=${notif.chatId}`);
    setShowDropdown(false);
  };

  const allNavItems = [
    { path: '/dashboard', label: 'الرئيسية', icon: <LayoutDashboard size={20} />, adminOnly: false },
    { path: '/students', label: 'الطلاب', icon: <Users size={20} />, adminOnly: true },
    { path: '/employees', label: 'فريق العمل', icon: <Users size={20} />, adminOnly: true },
    { path: '/universities', label: 'الجامعات والتخصصات', icon: <Building size={20} />, adminOnly: true },
    { path: '/orders', label: 'الطلبات', icon: <ClipboardList size={20} />, adminOnly: true },
    { path: '/chat', label: 'دردشة الواتساب', icon: <MessageCircle size={20} />, adminOnly: false },
    { path: '/live-monitoring', label: 'الرقابة الحية', icon: <Radio size={20} />, adminOnly: true },
    { path: '/whatsapp-config', label: 'إعدادات الربط', icon: <Smartphone size={20} />, adminOnly: true },
    { path: '/receipts', label: 'الإيصالات والتقارير', icon: <FileText size={20} />, adminOnly: true },
    { path: '/photosender', label: 'إرسال صور الحضور', icon: <ImagePlus size={20} />, adminOnly: true },
    { path: '/reports', label: 'الرقابة والإحصائيات', icon: <PieChart size={20} />, adminOnly: true },
  ];

  const navItems = allNavItems.filter(item => !item.adminOnly || isAdmin);

  return (
    <div className="flex" style={{ height: '100vh', overflow: 'hidden' }}>
      {isSidebarOpen && <div className="mobile-overlay" onClick={() => setIsSidebarOpen(false)}></div>}

      <aside className={`glass-panel sidebar-container ${isSidebarOpen ? 'open' : ''}`} style={{ 
        width: 'var(--sidebar-width)', height: '100%', borderRadius: 0,
        borderLeft: 'none', borderRight: '1px solid var(--glass-border)', borderTop: 'none', borderBottom: 'none',
        display: 'flex', flexDirection: 'column', zIndex: 1000,
        backgroundColor: 'var(--bg-secondary)'
      }}>
        <div style={{ padding: '2rem 1.5rem', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ background: 'linear-gradient(to left, var(--brand-secondary), var(--brand-primary))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0, fontSize: '1.6rem', fontWeight: 800 }}>دبلومالاين</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>نظام الإدارة المتكامل</p>
          </div>
          <button className="show-on-mobile btn-secondary" style={{ padding: '0.5rem', borderRadius: '50%', width: '36px', height: '36px' }} onClick={() => setIsSidebarOpen(false)}>
            <X size={20} />
          </button>
        </div>

        <nav className="flex-col" style={{ padding: '1.5rem 1rem', gap: '0.5rem', flex: 1, overflowY: 'auto' }}>
          {navItems.map((item) => (
            <NavLink
              key={item.path} to={item.path}
              onClick={() => setIsSidebarOpen(false)}
              style={({ isActive }) => ({
                padding: '0.9rem 1.2rem', borderRadius: '14px',
                color: isActive ? '#fff' : 'var(--text-secondary)',
                background: isActive ? 'linear-gradient(to left, rgba(59, 130, 246, 0.25), transparent)' : 'transparent',
                borderRight: isActive ? '4px solid var(--brand-primary)' : '4px solid transparent',
                fontWeight: isActive ? 600 : 500, transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', textDecoration: 'none',
                display: 'flex', alignItems: 'center', gap: '15px'
              })}
            >
              <span style={{ color: 'var(--brand-secondary)', display: 'flex' }}>{item.icon}</span>
              {item.label}
              <ChevronLeft size={16} style={{ marginRight: 'auto', opacity: 0.3 }} className="hide-on-mobile" />
            </NavLink>
          ))}
        </nav>
        
        <div style={{ padding: '1.5rem', borderTop: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
              <div style={{ 
                width: '42px', height: '42px', borderRadius: '12px', 
                background: isAdmin ? 'linear-gradient(135deg, #f59e0b, #ef4444)' : 'linear-gradient(135deg, var(--brand-primary), var(--brand-secondary))', 
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#fff',
                boxShadow: '0 4px 10px rgba(0,0,0,0.2)'
              }}>{employeeId.substring(0, 2).toUpperCase()}</div>
              <div>
                <p style={{ fontSize: '0.9rem', fontWeight: 700, margin: 0, maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {isAdmin ? 'المسؤول' : `هوية: ${employeeId.substring(0,6)}`}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--success)' }}></span>
                  <p style={{ fontSize: '0.7rem', color: 'var(--success)', margin: 0, fontWeight: 600 }}>نشط</p>
                </div>
              </div>
            </div>
            
            <button 
              onClick={() => auth.signOut()} 
              className="btn-secondary"
              style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', padding: '0.5rem', borderRadius: '10px', border: '1px solid rgba(239, 68, 68, 0.2)' }}
              title="تسجيل الخروج"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header className="glass-panel" style={{ height: 'var(--header-height)', borderRadius: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1.5rem', zIndex: 40, borderBottom: '1px solid var(--glass-border)', borderTop: 'none', borderLeft: 'none', borderRight: 'none' }}>
          <div className="flex items-center gap-4">
            <button className="show-on-mobile btn-secondary" style={{ padding: '0.5rem', borderRadius: '10px' }} onClick={() => setIsSidebarOpen(true)}>
              <Menu size={24} />
            </button>
            <h3 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text-primary)', fontWeight: 600 }}>لوحة التحكم</h3>
          </div>
          
          <div className="flex items-center gap-4">
            <div style={{ position: 'relative' }}>
              <button 
                onClick={() => { setShowDropdown(!showDropdown); if(!showDropdown) markAllAsRead(); }}
                className="btn-secondary"
                style={{ borderRadius: '12px', width: '42px', height: '42px', position: 'relative'}}
              >
                <Bell size={20} />
                {unreadCount > 0 && (
                  <span style={{ 
                    position: 'absolute', top: '-5px', right: '-5px', 
                    background: 'var(--danger)', color: '#fff', fontSize: '0.7rem', 
                    minWidth: '20px', height: '20px', borderRadius: '10px', 
                    display: 'flex', alignItems: 'center', justifyContent: 'center', 
                    fontWeight: 800, border: '2px solid var(--bg-primary)', padding: '0 4px'
                  }}>
                    {unreadCount}
                  </span>
                )}
              </button>

              {showDropdown && (
                <div className="glass-panel animate-fade-in-up" style={{ 
                  position: 'absolute', top: '55px', left: 0, width: '320px', 
                  padding: '1.25rem', borderRadius: '18px', display: 'flex', 
                  flexDirection: 'column', gap: '0.75rem', zIndex: 60, 
                  maxHeight: '450px', overflowY: 'auto', boxShadow: '0 15px 50px rgba(0,0,0,0.5)'
                }}>
                  <div className="flex items-center justify-between" style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.75rem', marginBottom: '0.5rem' }}>
                    <h4 style={{ margin: 0, color: 'var(--text-primary)' }}>التنبيهات الفورية</h4>
                    {unreadCount > 0 && <span className="badge badge-info">جديد</span>}
                  </div>
                  {notifications.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                      <Bell size={40} style={{ opacity: 0.1, marginBottom: '1rem' }} />
                      <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', margin: 0 }}>لا توجد تنبيهات</p>
                    </div>
                  ) : (
                    notifications.map(n => (
                      <div 
                        key={n.id} 
                        onClick={() => handleNotificationClick(n)}
                        style={{ 
                          background: n.read ? 'rgba(255,255,255,0.03)' : 'rgba(59, 130, 246, 0.08)', 
                          padding: '1rem', borderRadius: '14px', 
                          borderRight: n.read ? '3px solid transparent' : '3px solid var(--brand-secondary)',
                          transition: 'all 0.2s', marginBottom: '8px',
                          cursor: 'pointer'
                        }}
                      >
                        <p style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                          {isAdmin ? n.title : n.title.replace(/\d{6,}/g, 'طالب مجهول')}
                        </p>
                        <p style={{ margin: '0.3rem 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{n.body}</p>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </header>

        <div style={{ 
          flex: 1, 
          overflowY: 'auto', 
          padding: window.location.pathname === '/chat' ? (isSidebarOpen ? '2rem' : '0') : '2rem' 
        }}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
