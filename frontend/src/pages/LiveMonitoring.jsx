import React, { useState, useEffect } from 'react';
import { Activity, MessageSquare, User, Clock, Shield, Filter, Search, BarChart3, Radio } from 'lucide-react';
import { rtdb } from '../firebase';
import { ref, onValue, limitToLast, query } from 'firebase/database';

export default function LiveMonitoring() {
  const [liveMessages, setLiveMessages] = useState([]);
  const [stats, setStats] = useState({
    totalToday: 0,
    activeEmployees: 0,
    activeChats: 0
  });
  const [searchQuery, setSearchQuery] = useState('');

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

  const filteredMessages = liveMessages.filter(m => 
    m.text?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    m.employeeId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.chatId?.includes(searchQuery)
  );

  return (
    <div className="animate-fade-in-up">
      <div className="flex justify-between items-center responsive-flex" style={{ marginBottom: '2.5rem' }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
            <Radio className="animate-pulse" color="var(--danger)" size={28} /> الرقابة الحية (Live Feed)
          </h1>
          <p style={{ color: 'var(--text-secondary)' }}>مراقبة فورية لجميع المحادثات الصادرة والواردة عبر النظام</p>
        </div>
        <div className="flex gap-4">
          <div style={{ position: 'relative' }}>
            <Search size={18} color="var(--text-secondary)" style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)' }} />
            <input 
              type="text" 
              className="input-base" 
              placeholder="تصفية المحادثات..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingRight: '2.5rem', width: '250px' }} 
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
              <th style={{ padding: '1.25rem' }}>الموظف</th>
              <th style={{ padding: '1.25rem' }}>الجهة</th>
              <th style={{ padding: '1.25rem', width: '40%' }}>محتوى الرسالة</th>
              <th style={{ padding: '1.25rem' }}>النوع</th>
              <th style={{ padding: '1.25rem' }}>الوقت</th>
              <th style={{ padding: '1.25rem' }}>الحالة</th>
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
                      <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--brand-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.8rem' }}>
                        {msg.employeeId?.charAt(0).toUpperCase()}
                      </div>
                      <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{msg.employeeId}</span>
                    </div>
                  </td>
                  <td style={{ padding: '1.25rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{msg.chatId}</td>
                  <td style={{ padding: '1.25rem' }}>
                    <p style={{ margin: 0, fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '400px' }}>
                      {msg.text || (msg.type === 'image' ? 'ارسل صورة' : 'ارسل ملف')}
                    </p>
                  </td>
                  <td style={{ padding: '1.25rem' }}>
                    <span className={`badge ${msg.sender === 'me' ? 'badge-info' : 'badge-success'}`} style={{ fontSize: '0.75rem' }}>
                      {msg.sender === 'me' ? 'صادرة' : 'واردة'}
                    </span>
                  </td>
                  <td style={{ padding: '1.25rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    <div className="flex items-center gap-2">
                      <Clock size={14} />
                      {new Date(msg.timestamp).toLocaleTimeString('ar-SA')}
                    </div>
                  </td>
                  <td style={{ padding: '1.25rem' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--success)' }}>
                      <Shield size={14} /> آمن
                    </span>
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
