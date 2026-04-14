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
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, user => {
      if (user) {
        const adminStatus = user.email === 'yazans95@gmail.com' || user.email === 'zyrozyro98@gmail.com';
        setIsAdmin(adminStatus);
      } else {
        setIsAdmin(false);
      }
    });

    const unsubEmp = onSnapshot(collection(firestoreDb, 'employees'), (snap) => {
      const map = {};
      snap.docs.forEach(doc => {
        map[doc.id] = doc.data().name;
      });
      setEmployeesMap(map);
    });
    return () => { unsubAuth(); unsubEmp(); };
  }, []);

  useEffect(() => {
    // Listen to ALL chats for real-time monitoring
    const chatsRef = ref(rtdb, 'chats');
    
    const unsubscribe = onValue(chatsRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) return;

      const allMessages = [];
      let totalChats = 0;
      const employees = new Set();

      Object.entries(data).forEach(([empId, empChats]) => {
        employees.add(empId);
        Object.entries(empChats).forEach(([chatId, chatData]) => {
          totalChats++;
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

      // Sort by time descending and take last 50
      const sorted = allMessages.sort((a, b) => b.timestamp - a.timestamp).slice(0, 50);
      setLiveMessages(sorted);

      setStats({
        totalToday: allMessages.length,
        activeEmployees: employees.size,
        activeChats: totalChats
      });
    });

    return () => unsubscribe();
  }, []);

  const filteredMessages = liveMessages.filter(m => {
    const matchesSearch = 
      m.text?.toLowerCase().includes(searchQuery.toLowerCase()) || 
      m.employeeId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.senderName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.chatId?.includes(searchQuery);
    
    const matchesEmployee = selectedEmployeeId === 'all' || m.employeeId === selectedEmployeeId;
    const isVisible = !m.isDeleted || isAdmin;
    
    return matchesSearch && matchesEmployee && isVisible;
  });

  return (
    <div className="animate-fade-in-up">
      <div className="flex justify-between items-center responsive-flex" style={{ marginBottom: '2.5rem' }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
            <Radio className="animate-pulse" color="var(--danger)" size={28} /> الرقابة الحية (Live Feed)
          </h1>
          <p style={{ color: 'var(--text-secondary)' }}>مراقبة فورية لجميع المحادثات الصادرة والواردة عبر النظام</p>
        </div>
        <div className="flex gap-4 items-center">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.05)', padding: '5px 15px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
            <User size={16} color="var(--brand-primary)" />
            <select 
              value={selectedEmployeeId} 
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
              className="input-base"
              style={{ padding: '5px', border: 'none', background: 'transparent', fontSize: '0.85rem', width: '150px' }}
            >
              <option value="all">كل الموظفين</option>
              {Object.entries(employeesMap).map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          </div>
          <div style={{ position: 'relative' }}>
            <Search size={18} color="var(--text-secondary)" style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)' }} />
            <input 
              type="text" 
              className="input-base" 
              placeholder="تصفية المحادثات..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingRight: '2.5rem', width: '200px' }} 
            />
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-4 sm-grid-cols-2 gap-4" style={{ marginBottom: '2rem' }}>
        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '0.75rem', borderRadius: '12px', color: 'var(--brand-primary)' }}>
            <MessageSquare size={24} />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>إجمالي الرسائل</p>
            <h3 style={{ margin: 0 }}>{stats.totalToday}</h3>
          </div>
        </div>
        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '0.75rem', borderRadius: '12px', color: 'var(--success)' }}>
            <User size={24} />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>موظفين نشطين</p>
            <h3 style={{ margin: 0 }}>{stats.activeEmployees}</h3>
          </div>
        </div>
        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: 'rgba(245, 158, 11, 0.1)', padding: '0.75rem', borderRadius: '12px', color: 'var(--warning)' }}>
            <Activity size={24} />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>محادثات جارية</p>
            <h3 style={{ margin: 0 }}>{stats.activeChats}</h3>
          </div>
        </div>
        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: 'rgba(139, 92, 246, 0.1)', padding: '0.75rem', borderRadius: '12px', color: '#8b5cf6' }}>
            <BarChart3 size={24} />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>حالة النظام</p>
            <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--success)' }}>مستقر</h3>
          </div>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right' }}>
          <thead style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--glass-border)' }}>
            <tr>
              <th style={{ padding: '1.25rem' }}>المسؤول عن المحادثة</th>
              <th style={{ padding: '1.25rem' }}>الطرف الآخر</th>
              <th style={{ padding: '1.25rem', width: '35%' }}>محتوى الرسالة</th>
              <th style={{ padding: '1.25rem' }}>المرسل</th>
              <th style={{ padding: '1.25rem' }}>الوقت</th>
              <th style={{ padding: '1.25rem' }}>إجراء</th>
            </tr>
          </thead>
          <tbody>
            {filteredMessages.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  لا توجد رسائل مسجلة حالياً في النظام.
                </td>
              </tr>
            ) : (
              filteredMessages.map((msg) => (
                <tr key={msg.id} className="table-row-hover" style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  <td style={{ padding: '1.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-secondary))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.8rem', fontWeight: 800 }}>
                        {employeesMap[msg.employeeId]?.charAt(0) || msg.employeeId?.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{employeesMap[msg.employeeId] || 'موظف مجهول'}</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>ID: {msg.employeeId?.substring(0,8)}</span>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '1.25rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{msg.chatId}</td>
                  <td style={{ padding: '1.25rem' }}>
                    <p style={{ 
                      margin: 0, 
                      fontSize: '0.9rem', 
                      whiteSpace: 'nowrap', 
                      overflow: 'hidden', 
                      textOverflow: 'ellipsis', 
                      maxWidth: '350px',
                      opacity: msg.isDeleted ? 0.5 : 1,
                      fontStyle: msg.isDeleted ? 'italic' : 'normal'
                    }}>
                      {msg.quoted && <span style={{ color: 'var(--brand-primary)', fontWeight: 600, fontSize: '0.75rem', marginLeft: '5px' }}>↩️ {msg.quoted.text.substring(0, 20)}... |</span>}
                      {msg.isDeleted && <Shield size={12} style={{ display: 'inline', marginLeft: '5px' }} />}
                      {msg.text || (msg.type === 'image' ? '🖼️ صورة' : (msg.type === 'video' ? '🎥 فيديو' : '📎 ملف'))}
                      {msg.isDeleted && ' (محذوفة)'}
                    </p>
                  </td>
                  <td style={{ padding: '1.25rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span className={`badge ${msg.sender === 'me' ? 'badge-info' : 'badge-success'}`} style={{ fontSize: '0.7rem', width: 'fit-content' }}>
                        {msg.sender === 'me' ? 'صادرة (نحن)' : 'واردة (الطالب)'}
                      </span>
                      {msg.sender === 'me' && msg.senderName && (
                        <span style={{ fontSize: '0.7rem', color: 'var(--brand-primary)', fontWeight: 600 }}>بواسطة: {msg.senderName}</span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '1.25rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    <div className="flex items-center gap-2">
                      <Clock size={14} />
                      {new Date(msg.timestamp).toLocaleTimeString('ar-SA')}
                    </div>
                  </td>
                  <td style={{ padding: '1.25rem' }}>
                    <button 
                      onClick={() => window.location.href = `/chat?select=${msg.chatId}`}
                      className="btn-secondary" 
                      style={{ padding: '6px 12px', fontSize: '0.75rem', borderRadius: '8px' }}
                    >
                      عرض المحادثة
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
