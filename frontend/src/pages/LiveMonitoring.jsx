import React, { useState, useEffect } from 'react';
import { Activity, MessageSquare, User, Clock, Shield, Filter, Search, BarChart3, Radio } from 'lucide-react';
import { rtdb, db as firestoreDb, auth } from '../firebase';
import { ref, onValue, limitToLast, query as rtdbQuery } from 'firebase/database';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, onSnapshot, query as firestoreQuery } from 'firebase/firestore';

export default function LiveMonitoring() {
  const [liveMessages, setLiveMessages] = useState([]);
  const [stats, setStats] = useState({
    totalToday: 0,
    activeEmployees: 0,
    activeChats: 0
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('all');
  const [employeesMap, setEmployeesMap] = useState({});
  const [studentsMap, setStudentsMap] = useState({}); // JID -> Name mapping
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, user => {
      if (user) {
        const adminStatus = user.email === 'yazans95@gmail.com' || user.email === 'zyrozyro98@gmail.com';
        setIsAdmin(adminStatus);
      } else setIsAdmin(false);
    });

    const unsubEmp = onSnapshot(collection(firestoreDb, 'employees'), (snap) => {
      const map = {};
      snap.docs.forEach(doc => { map[doc.id] = doc.data().name; });
      setEmployeesMap(map);
    });

    const unsubStudents = onSnapshot(collection(firestoreDb, 'students'), (snap) => {
      const map = {};
      snap.docs.forEach(doc => {
        const data = doc.data();
        if (data.phone) map[data.phone] = data.name;
        if (data.fullJid) {
           const jidId = data.fullJid.split('@')[0].split(':')[0];
           map[jidId] = data.name;
        }
      });
      setStudentsMap(map);
    });

    return () => { unsubAuth(); unsubEmp(); unsubStudents(); };
  }, []);

  useEffect(() => {
    const chatsRef = ref(rtdb, 'chats');
    const unsubscribe = onValue(chatsRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) return;

      const allMessages = [];
      const employees = new Set();
      const chats = new Set();

      Object.entries(data).forEach(([empId, empChats]) => {
        employees.add(empId);
        Object.entries(empChats).forEach(([chatId, chatData]) => {
          chats.add(`${empId}_${chatId}`);
          if (chatData.messages) {
            Object.entries(chatData.messages).forEach(([msgId, msg]) => {
              allMessages.push({
                id: msgId,
                employeeId: empId,
                chatId: chatId,
                ...msg,
                timestamp: msg.time ? new Date(msg.time).getTime() : 0
              });
            });
          }
        });
      });

      const sorted = allMessages.sort((a, b) => b.timestamp - a.timestamp).slice(0, 50);
      setLiveMessages(sorted);

      setStats({
        totalToday: allMessages.length,
        activeEmployees: employees.size,
        activeChats: chats.size
      });
    });

    return () => unsubscribe();
  }, []);

  const filteredMessages = liveMessages.filter(m => {
    const studentName = studentsMap[m.chatId] || '';
    const matchesSearch = 
      m.text?.toLowerCase().includes(searchQuery.toLowerCase()) || 
      studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.chatId?.includes(searchQuery);
    
    const matchesEmployee = selectedEmployeeId === 'all' || m.employeeId === selectedEmployeeId;
    const isVisible = !m.isDeleted || isAdmin;
    
    return matchesSearch && matchesEmployee && isVisible;
  });

  return (
    <div className="animate-fade-in" style={{ padding: '1rem' }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '2.5rem',
        background: 'linear-gradient(90deg, rgba(30,41,59,0.5), transparent)',
        padding: '2rem',
        borderRadius: '24px',
        border: '1px solid rgba(255,255,255,0.05)'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 15px #ef4444', animation: 'pulse 1.5s infinite' }}></div>
            <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 900, letterSpacing: '-0.02em' }}>الرقابة الحية</h1>
          </div>
          <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '1.1rem' }}>بث مباشر وفوري لجميع محادثات واتساب عبر النظام</p>
        </div>

        <div style={{ display: 'flex', gap: '15px' }}>
          <div style={{ position: 'relative' }}>
             <Search size={20} style={{ position: 'absolute', right: '15px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
             <input 
                type="text" className="input-base" placeholder="بحث سريع..." 
                value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                style={{ paddingRight: '45px', width: '250px', background: 'rgba(15,23,42,0.8)', borderRadius: '14px' }}
             />
          </div>
          <select 
             className="input-base" value={selectedEmployeeId} onChange={(e) => setSelectedEmployeeId(e.target.value)}
             style={{ width: '200px', background: 'rgba(15,23,42,0.8)', borderRadius: '14px' }}
          >
             <option value="all">كل الموظفين</option>
             {Object.entries(employeesMap).map(([id, name]) => (
               <option key={id} value={id}>{name}</option>
             ))}
          </select>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', marginBottom: '3rem' }}>
        {[
          { label: 'إجمالي العمليات', value: stats.totalToday, icon: <MessageSquare />, color: '#3b82f6' },
          { label: 'موظفين متصلين', value: stats.activeEmployees, icon: <User />, color: '#10b981' },
          { label: 'محادثات نشطة', value: stats.activeChats, icon: <Activity />, color: '#f59e0b' },
          { label: 'استقرار النظام', value: '100%', icon: <Shield />, color: '#8b5cf6' }
        ].map((stat, i) => (
          <div key={i} className="glass-panel" style={{ padding: '1.5rem', position: 'relative', overflow: 'hidden' }}>
            <div style={{ fontSize: '0.9rem', color: '#94a3b8', fontWeight: 600, marginBottom: '0.5rem' }}>{stat.label}</div>
            <div style={{ fontSize: '2rem', fontWeight: 900, color: '#fff' }}>{stat.value}</div>
            <div style={{ position: 'absolute', right: '-10px', bottom: '-10px', opacity: 0.1, transform: 'scale(2) rotate(-15deg)', color: stat.color }}>
              {stat.icon}
            </div>
            <div style={{ position: 'absolute', left: 0, bottom: 0, width: '100%', height: '3px', background: stat.color }}></div>
          </div>
        ))}
      </div>

      <div className="glass-panel" style={{ padding: 0, borderRadius: '24px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ padding: '1.5rem 2rem', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: '10px' }}>
           <Clock size={18} color="#3b82f6" />
           <span style={{ fontWeight: 800, fontSize: '0.9rem' }}>آخر 50 نشاطاً تم رصدها</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'right', color: '#64748b', fontSize: '0.85rem' }}>
                <th style={{ padding: '1.25rem 2rem' }}>الموظف</th>
                <th style={{ padding: '1.25rem 2rem' }}>الجهة الأخرى (الطالب)</th>
                <th style={{ padding: '1.25rem 2rem', width: '40%' }}>المحتوى</th>
                <th style={{ padding: '1.25rem 2rem' }}>الوقت</th>
                <th style={{ padding: '1.25rem 2rem' }}>الحالة</th>
              </tr>
            </thead>
            <tbody style={{ direction: 'rtl' }}>
              {filteredMessages.map((msg) => (
                <tr key={msg.id} className="table-row-hover" style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', transition: '0.2s' }}>
                  <td style={{ padding: '1.25rem 2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '12px', background: 'linear-gradient(135deg, #3b82f6, #06b6d4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.9rem', fontWeight: 900 }}>
                        {employeesMap[msg.employeeId]?.charAt(0) || 'M'}
                      </div>
                      <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#fff' }}>{employeesMap[msg.employeeId] || 'موظف'}</span>
                    </div>
                  </td>
                  <td style={{ padding: '1.25rem 2rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                       <span style={{ fontWeight: 800, color: '#3b82f6' }}>{studentsMap[msg.chatId] || 'مجهول / غير مسجل'}</span>
                       <span style={{ fontSize: '0.75rem', color: '#64748b' }}>JID: {msg.chatId}</span>
                    </div>
                  </td>
                  <td style={{ padding: '1.25rem 2rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      {msg.quoted && (
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', background: 'rgba(255,255,255,0.03)', padding: '5px 10px', borderRadius: '6px', borderLeft: '3px solid #3b82f6' }}>
                          رد على: {msg.quoted.text?.substring(0, 40)}...
                        </div>
                      )}
                      {msg.type === 'image' && msg.mediaData ? (
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                          <img src={msg.mediaData} alt="thumb" style={{ width: '40px', height: '40px', borderRadius: '8px', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.1)' }} />
                          <span style={{ fontSize: '0.9rem', color: '#e2e8f0' }}>{msg.text || '📷 صورة'}</span>
                        </div>
                      ) : (
                        <p style={{ margin: 0, fontSize: '0.95rem', color: msg.isDeleted ? '#ef4444' : '#e2e8f0', fontStyle: msg.isDeleted ? 'italic' : 'normal' }}>
                          {msg.isDeleted ? '🗑️ رسالة محذوفة' : (msg.text || `[${msg.type}]`)}
                        </p>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '1.25rem 2rem' }}>
                    <div style={{ color: '#94a3b8', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                       <Clock size={14} />
                       {new Date(msg.timestamp).toLocaleTimeString('ar-SA')}
                    </div>
                  </td>
                  <td style={{ padding: '1.25rem 2rem' }}>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <span style={{ 
                        padding: '4px 10px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 800,
                        background: msg.sender === 'me' ? 'rgba(59,130,246,0.1)' : 'rgba(16,185,129,0.1)',
                        color: msg.sender === 'me' ? '#3b82f6' : '#10b981'
                      }}>
                        {msg.sender === 'me' ? 'صادرة' : 'واردة'}
                      </span>
                      <button 
                        onClick={() => window.location.href = `/chat?select=${msg.chatId}`}
                        style={{ padding: '6px', borderRadius: '8px', border: 'none', background: 'rgba(255,255,255,0.05)', color: '#fff', cursor: 'pointer', transition: '0.2s' }}
                        className="hover:bg-blue-500" title="الذهاب للدردشة"
                      >
                        <MessageCircle size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      <style>{`
        @keyframes pulse {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.2); opacity: 0.7; }
          100% { transform: scale(1); opacity: 1; }
        }
        .table-row-hover:hover {
          background: rgba(59,130,246,0.05) !important;
        }
      `}</style>
    </div>
  );
}
