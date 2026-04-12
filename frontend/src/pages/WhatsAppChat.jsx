import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageCircle, Search, Send, Paperclip, MoreVertical, 
  Smile, User, CheckCheck, Clock, Shield, RefreshCw, 
  Info, Phone, ChevronRight
} from 'lucide-react';
import axios from 'axios';
import { auth, rtdb, db } from '../firebase';
import { ref, onValue } from 'firebase/database';
import { collection, onSnapshot } from 'firebase/firestore';
import Picker from '@emoji-mart/react';

export default function WhatsAppChat() {
  const [employeeId, setEmployeeId] = useState('emp1'); // Now using UID
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

  // 1. GOLDEN KEY: Auth Listener using UID
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

  // 2. Data Listeners using Golden Key
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

  // 3. Message Listener using Golden Key
  useEffect(() => {
    if (!selectedChat || !employeeId || employeeId === 'emp1') return;

    const cleanId = String(selectedChat.phone).replace(/[^0-9]/g, '').slice(-9);
    console.log(`[LISTEN] chats/${employeeId}/${cleanId}/messages`);

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
    return { 
      ...s, 
      lastMessage: active?.lastMessage || 'لا توجد محادثات سابقة', 
      timestamp: active?.timestamp || 0
    };
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
        employeeId, // Sending UID to backend
        phoneNumber: selectedChat.phone.replace(/[^0-9]/g, ''), 
        message: textToSend
      });
    } catch (err) { console.error(err); } finally { setIsSending(false); }
  };

  return (
    <div className="glass-panel" style={{ display: 'flex', height: 'calc(100vh - 120px)', borderRadius: '32px', overflow: 'hidden', border: 'none', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
      
      {/* Sidebar - Same Premium Style */}
      <div style={{ width: '380px', borderLeft: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(20px)' }}>
        <div style={{ padding: '30px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
            <h2 style={{ fontSize: '1.6rem', fontWeight: 900, margin: 0, color: '#fff', letterSpacing: '-0.5px' }}>المحادثات</h2>
          </div>
          <div style={{ position: 'relative' }}>
            <Search style={{ position: 'absolute', right: '15px', top: '14px', color: 'rgba(255,255,255,0.2)' }} size={18} />
            <input 
              type="text" placeholder="ابحث عن اسم أو رقم..." 
              style={{ width: '100%', padding: '12px 45px 12px 15px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '15px', color: '#fff', outline: 'none', fontSize: '0.9rem' }}
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
                className={`chat-sidebar-item ${isActive ? 'active' : ''}`}
                style={{ 
                  padding: '20px 25px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '18px',
                  background: isActive ? 'linear-gradient(to left, rgba(59, 130, 246, 0.1), transparent)' : 'transparent',
                  borderRight: isActive ? '4px solid var(--brand-primary)' : '4px solid transparent'
                }}
              >
                <div style={{ width: '55px', height: '55px', borderRadius: '18px', background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-secondary))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', fontWeight: 900, color: '#fff' }}>{item.name?.substring(0, 1)}</div>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                    <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: isActive ? '#fff' : 'rgba(255,255,255,0.8)', truncate: 'true' }}>{item.name}</h4>
                    {item.timestamp > 0 && <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>{new Date(item.timestamp).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}</span>}
                  </div>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'rgba(255,255,255,0.3)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{item.lastMessage}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Chat Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'rgba(15, 23, 42, 0.2)', position: 'relative' }}>
        {selectedChat ? (
          <>
            <div style={{ padding: '20px 40px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', backdropFilter: 'blur(10px)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <div style={{ width: '50px', height: '50px', borderRadius: '15px', background: 'rgba(59, 130, 246, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand-primary)' }}><User size={28} /></div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900, color: '#fff' }}>{selectedChat.name}</h3>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>{selectedChat.phone}</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '20px' }}>
                <button onClick={() => window.location.reload()} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: 'rgba(255,255,255,0.4)', padding: '10px', borderRadius: '12px', cursor: 'pointer' }}><RefreshCw size={20} /></button>
                <button onClick={() => setShowDetails(!showDetails)} style={{ background: showDetails ? 'var(--brand-primary)' : 'rgba(255,255,255,0.05)', border: 'none', color: showDetails ? '#fff' : 'rgba(255,255,255,0.4)', padding: '10px', borderRadius: '12px', cursor: 'pointer' }}><Info size={20} /></button>
              </div>
            </div>

            <div className="custom-scrollbar chat-bg-pattern" style={{ flex: 1, overflowY: 'auto', padding: '40px', display: 'flex', flexDirection: 'column', gap: '25px' }}>
              {messages.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.1 }}>
                  <MessageCircle size={120} style={{ color: '#fff', marginBottom: '20px' }} />
                  <h2 style={{ color: '#fff', fontSize: '2rem', fontWeight: 900 }}>بداية المحادثة</h2>
                </div>
              ) : (
                messages.map((msg, idx) => {
                  const isMe = msg.sender === 'me';
                  return (
                    <div key={msg.id || idx} style={{ display: 'flex', justifyContent: isMe ? 'flex-start' : 'flex-end', width: '100%' }}>
                      <div className={isMe ? 'chat-message-me' : 'chat-message-them'} style={{ 
                        maxWidth: '70%', padding: '16px 20px', borderRadius: '24px', 
                        borderTopRightRadius: isMe ? '4px' : '24px', borderTopLeftRadius: isMe ? '24px' : '4px',
                        animation: 'messageIn 0.3s ease-out'
                      }}>
                        <p style={{ margin: 0, fontSize: '1rem', lineHeight: 1.6, fontWeight: 500 }}>{msg.text}</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', fontSize: '10px', opacity: 0.6, justifyContent: isMe ? 'flex-start' : 'flex-end' }}>
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

            <div style={{ padding: '30px 40px', background: 'rgba(15, 23, 42, 0.4)', borderTop: '1px solid rgba(255,255,255,0.05)', backdropFilter: 'blur(20px)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px', background: 'rgba(255,255,255,0.03)', padding: '10px 20px', borderRadius: '22px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <button style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.2)', cursor: 'pointer', padding: '10px' }} onClick={() => setShowEmojiPicker(!showEmojiPicker)}><Smile size={26} /></button>
                <input 
                  type="text" placeholder="اكتب رسالتك الذكية هنا..."
                  style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: '#fff', fontSize: '1rem', fontWeight: 500 }}
                  value={message} onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                />
                <button 
                  onClick={handleSend} disabled={!message.trim() || isSending}
                  style={{ background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-secondary))', border: 'none', color: '#fff', width: '50px', height: '50px', borderRadius: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                >
                  {isSending ? <RefreshCw size={24} className="animate-spin" /> : <Send size={24} />}
                </button>
              </div>
              {showEmojiPicker && (
                <div style={{ position: 'absolute', bottom: '120px', right: '40px', zIndex: 100 }}>
                  <Picker data={async () => (await import('@emoji-mart/data')).default} onEmojiSelect={(emoji) => setMessage(prev => prev + emoji.native)} theme="dark" />
                </div>
              )}
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '100px', opacity: 0.3 }}>
            <MessageCircle size={120} style={{ color: '#fff', marginBottom: '40px' }} />
            <h2 style={{ fontSize: '3rem', fontWeight: 1000, color: '#fff' }}>دردشة واتساب المتكاملة</h2>
          </div>
        )}
      </div>

      {showDetails && selectedChat && (
        <div style={{ width: '350px', borderRight: '1px solid rgba(255,255,255,0.05)', background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(30px)', padding: '40px' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: '100px', height: '100px', borderRadius: '30px', background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-secondary))', margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', fontWeight: 1000, color: '#fff' }}>{selectedChat.name?.substring(0, 1)}</div>
            <h3 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900, color: '#fff' }}>{selectedChat.name}</h3>
            <p style={{ color: 'var(--brand-primary)', fontWeight: 800 }}>{selectedChat.phone}</p>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes messageIn { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
        .chat-bg-pattern { background-image: radial-gradient(rgba(59, 130, 246, 0.03) 1px, transparent 1px); background-size: 30px 30px; }
      `}} />
    </div>
  );
}
