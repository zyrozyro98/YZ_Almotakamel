import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageCircle, Search, Send, Paperclip, MoreVertical, 
  Smile, User, CheckCheck, Clock, Shield, RefreshCw, 
  Info, Phone, ChevronRight, AlertCircle
} from 'lucide-react';
import axios from 'axios';
import { auth, rtdb, db } from '../firebase';
import { ref, onValue } from 'firebase/database';
import { collection, onSnapshot } from 'firebase/firestore';
import Picker from '@emoji-mart/react';

export default function WhatsAppChat() {
  const [employeeId, setEmployeeId] = useState('emp1'); 
  const [selectedChat, setSelectedChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [activeChats, setActiveChats] = useState([]);
  const [students, setStudents] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const messagesEndRef = useRef(null);
  
  const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

  useEffect(() => {
    const unsubAuth = auth.onAuthStateChanged(user => {
      if (user) {
        setEmployeeId(user.uid);
      } else {
        setEmployeeId('emp1');
      }
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!employeeId || employeeId === 'emp1') return;
    const unsubStudents = onSnapshot(collection(db, 'students'), (snap) => {
      setStudents(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const activeRef = ref(rtdb, `chats/${employeeId}`);
    const unsubActive = onValue(activeRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setActiveChats(Object.entries(data).map(([id, val]) => ({ phone: id, ...val })));
      } else {
        setActiveChats([]);
      }
    });
    return () => { unsubStudents(); unsubActive(); };
  }, [employeeId]);

  useEffect(() => {
    if (!selectedChat || !employeeId || employeeId === 'emp1') return;
    const cleanId = String(selectedChat.phone).replace(/[^0-9]/g, '').slice(-9);
    const messagesRef = ref(rtdb, `chats/${employeeId}/${cleanId}/messages`);
    const unsubMsg = onValue(messagesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list = Object.entries(data).map(([id, val]) => ({ id, ...val }));
        setMessages(list.sort((a, b) => (a.time || 0) - (b.time || 0)));
      } else {
        setMessages([]);
      }
    });
    return () => unsubMsg();
  }, [selectedChat, employeeId]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const getMatchKey = (p) => String(p || '').replace(/[^0-9]/g, '').slice(-9);
  
  const sidebarList = students.map(s => {
    const active = activeChats.find(c => getMatchKey(c.phone) === getMatchKey(s.phone));
    return { ...s, lastMessage: active?.lastMessage || 'لا توجد محادثات', timestamp: active?.timestamp || 0 };
  }).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  const filteredSidebar = sidebarList.filter(item => {
    const q = searchQuery.toLowerCase();
    return item.name?.toLowerCase().includes(q) || item.phone?.includes(q);
  });

  const handleSend = async () => {
    if (!message.trim() || !selectedChat || isSending) return;
    const textToSend = message; setMessage(''); setShowEmojiPicker(false); setIsSending(true);
    try {
      await axios.post(`${BASE_URL}/api/whatsapp/send`, {
        employeeId, phoneNumber: selectedChat.phone.replace(/[^0-9]/g, ''), message: textToSend
      });
    } catch (err) { console.error(err); } finally { setIsSending(false); }
  };

  return (
    <div className="glass-panel" style={{ display: 'flex', height: 'calc(100vh - 120px)', borderRadius: '32px', overflow: 'hidden', border: 'none', background: '#0f172a' }}>
      
      {/* Sidebar */}
      <div style={{ width: '380px', borderLeft: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', background: '#1e293b' }}>
        <div style={{ padding: '30px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#fff', marginBottom: '20px' }}>الدردشات</h2>
          <div style={{ position: 'relative' }}>
            <Search style={{ position: 'absolute', right: '15px', top: '14px', color: 'rgba(255,255,255,0.3)' }} size={18} />
            <input 
              type="text" placeholder="بحث..." 
              style={{ width: '100%', padding: '12px 45px 12px 15px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '15px', color: '#fff', outline: 'none' }}
              value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto' }}>
          {filteredSidebar.map(item => {
            const isActive = selectedChat?.id === item.id;
            return (
              <div 
                key={item.id} onClick={() => setSelectedChat(item)}
                style={{ padding: '20px 25px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '15px', background: isActive ? 'rgba(59, 130, 246, 0.1)' : 'transparent', borderRight: isActive ? '4px solid #3b82f6' : '4px solid transparent', transition: '0.2s' }}
              >
                <div style={{ width: '50px', height: '50px', borderRadius: '15px', background: 'linear-gradient(135deg, #3b82f6, #06b6d4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: '#fff' }}>{item.name?.substring(0, 1)}</div>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#fff' }}>{item.name}</h4>
                    {item.timestamp > 0 && <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>{new Date(item.timestamp).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}</span>}
                  </div>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{item.lastMessage}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Chat */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#0f172a', position: 'relative' }}>
        {selectedChat ? (
          <>
            <div style={{ padding: '15px 35px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1e293b' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <div style={{ width: '45px', height: '45px', borderRadius: '12px', background: 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6' }}><User size={24} /></div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#fff' }}>{selectedChat.name}</h3>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: '#3b82f6', fontWeight: 700 }}>{selectedChat.phone}</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                <RefreshCw size={20} style={{ color: 'rgba(255,255,255,0.4)', cursor: 'pointer' }} onClick={() => window.location.reload()} />
                <button onClick={() => setShowDetails(!showDetails)} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem' }}>التفاصيل</button>
              </div>
            </div>

            <div className="custom-scrollbar chat-bg-pattern" style={{ flex: 1, overflowY: 'auto', padding: '35px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {messages.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.1)' }}>
                  <AlertCircle size={60} style={{ marginBottom: '15px' }} />
                  <p style={{ fontWeight: 800 }}>لا توجد رسائل محملة</p>
                  <p style={{ fontSize: '0.75rem', maxWidth: '250px', textAlign: 'center', marginTop: '10px' }}>إذا كنت قد قمت بالربط للتو، يرجى الانتظار قليلاً أو إرسال رسالة لتفعيل المحادثة.</p>
                </div>
              ) : (
                messages.map((msg, idx) => {
                  const isMe = msg.sender === 'me';
                  return (
                    <div key={msg.id || idx} style={{ display: 'flex', justifyContent: isMe ? 'flex-start' : 'flex-end' }}>
                      <div style={{ 
                        maxWidth: '75%', 
                        padding: '14px 20px', 
                        borderRadius: '20px', 
                        background: isMe ? '#3b82f6' : '#334155', // Solid colors for high contrast
                        color: '#fff', // Pure white text
                        borderTopRightRadius: isMe ? '4px' : '20px',
                        borderTopLeftRadius: isMe ? '20px' : '4px',
                        boxShadow: '0 4px 15px rgba(0,0,0,0.2)'
                      }}>
                        <p style={{ margin: 0, fontSize: '0.98rem', lineHeight: 1.5, fontWeight: 500 }}>{msg.text}</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', fontSize: '10px', color: 'rgba(255,255,255,0.6)', justifyContent: isMe ? 'flex-start' : 'flex-end' }}>
                          {msg.time ? new Date(msg.time).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) : ''}
                          {isMe && <CheckCheck size={14} />}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            <div style={{ padding: '25px 35px', background: '#1e293b', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px', background: 'rgba(255,255,255,0.05)', padding: '10px 18px', borderRadius: '18px', border: '1px solid rgba(255,255,255,0.1)' }}>
                <Smile size={24} style={{ color: 'rgba(255,255,255,0.3)', cursor: 'pointer' }} onClick={() => setShowEmojiPicker(!showEmojiPicker)} />
                <input 
                  type="text" placeholder="اكتب رسالتك..."
                  style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: '#fff', fontSize: '1rem' }}
                  value={message} onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                />
                <button 
                  onClick={handleSend} disabled={!message.trim() || isSending}
                  style={{ background: '#3b82f6', border: 'none', color: '#fff', width: '45px', height: '45px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                >
                  {isSending ? <RefreshCw size={20} className="animate-spin" /> : <Send size={20} />}
                </button>
              </div>
              {showEmojiPicker && (
                <div style={{ position: 'absolute', bottom: '110px', right: '40px', zIndex: 100 }}>
                  <Picker data={async () => (await import('@emoji-mart/data')).default} onEmojiSelect={(emoji) => setMessage(prev => prev + emoji.native)} theme="dark" />
                </div>
              )}
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.2 }}>
            <MessageCircle size={100} style={{ color: '#fff' }} />
            <h2 style={{ color: '#fff', fontWeight: 900, marginTop: '20px' }}>اختر محادثة للبدء</h2>
          </div>
        )}
      </div>

      {showDetails && selectedChat && (
        <div style={{ width: '320px', background: '#1e293b', padding: '40px', borderRight: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            <div style={{ width: '90px', height: '90px', borderRadius: '30px', background: 'linear-gradient(135deg, #3b82f6, #06b6d4)', margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', fontWeight: 900, color: '#fff' }}>{selectedChat.name?.substring(0, 1)}</div>
            <h3 style={{ color: '#fff', margin: 0 }}>{selectedChat.name}</h3>
            <p style={{ color: '#3b82f6', fontWeight: 700, marginTop: '10px' }}>{selectedChat.phone}</p>
          </div>
        </div>
      )}
    </div>
  );
}
