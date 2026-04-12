import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageCircle, Search, Send, Paperclip, MoreVertical, 
  Smile, User, CheckCheck, Clock, Shield, RefreshCw, 
  Info, Phone
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
        setEmployeeId(user.email.split('@')[0].replace(/[^a-zA-Z0-9]/g, ''));
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
      }
    });
    return () => { unsubStudents(); unsubActive(); };
  }, [employeeId]);

  useEffect(() => {
    if (!selectedChat || !employeeId) return;
    
    // Unified ID: Last 9 digits
    const cleanId = String(selectedChat.phone).replace(/[^0-9]/g, '').slice(-9);
    console.log(`[DEBUG] Syncing messages for path: chats/${employeeId}/${cleanId}/messages`);

    const messagesRef = ref(rtdb, `chats/${employeeId}/${cleanId}/messages`);
    const unsubMsg = onValue(messagesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        // Convert object to array and sort by time
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
      timestamp: active?.timestamp || 0,
      phone: s.phone // Priority to Firestore phone
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
        employeeId, 
        phoneNumber: selectedChat.phone.replace(/[^0-9]/g, ''), 
        message: textToSend
      });
    } catch (err) { console.error(err); } finally { setIsSending(false); }
  };

  return (
    <div className="glass-panel" style={{ display: 'flex', height: 'calc(100vh - 120px)', borderRadius: '24px', overflow: 'hidden', border: 'none' }}>
      
      {/* Sidebar */}
      <div style={{ width: '350px', borderLeft: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '24px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: '0 0 20px', color: '#fff' }}>الدردشات</h2>
          <div style={{ position: 'relative' }}>
            <Search style={{ position: 'absolute', right: '12px', top: '12px', color: 'rgba(255,255,255,0.3)' }} size={18} />
            <input 
              type="text" placeholder="ابحث..." className="input-base" style={{ paddingRight: '45px', background: 'rgba(255,255,255,0.05)' }}
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
                style={{ padding: '16px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '15px' }}
              >
                <div style={{ width: '45px', height: '45px', borderRadius: '12px', background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-secondary))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#fff' }}>
                  {item.name?.substring(0, 1)}
                </div>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#fff', truncate: 'true' }}>{item.name}</h4>
                    {item.timestamp > 0 && <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>{new Date(item.timestamp).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}</span>}
                  </div>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{item.lastMessage}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Chat Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.1)', position: 'relative' }}>
        {selectedChat ? (
          <>
            <div style={{ padding: '15px 30px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.03)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <div style={{ width: '45px', height: '45px', borderRadius: '12px', background: 'rgba(59, 130, 246, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand-primary)' }}><User size={24} /></div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>{selectedChat.name}</h3>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--brand-primary)', fontWeight: 600 }}>{selectedChat.phone}</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '15px' }}>
                <RefreshCw size={20} style={{ color: 'rgba(255,255,255,0.3)', cursor: 'pointer' }} onClick={() => window.location.reload()} />
                <Info size={20} style={{ color: showDetails ? 'var(--brand-primary)' : 'rgba(255,255,255,0.3)', cursor: 'pointer' }} onClick={() => setShowDetails(!showDetails)} />
              </div>
            </div>

            <div className="custom-scrollbar chat-bg-pattern" style={{ flex: 1, overflowY: 'auto', padding: '30px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {messages.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.2 }}>
                  <MessageCircle size={80} style={{ color: '#fff', marginBottom: '15px' }} />
                  <h3 style={{ color: '#fff' }}>بداية المحادثة</h3>
                </div>
              ) : (
                messages.map((msg, idx) => {
                  const isMe = msg.sender === 'me';
                  return (
                    <div key={msg.id || idx} style={{ display: 'flex', justifyContent: isMe ? 'flex-start' : 'flex-end' }}>
                      <div className={`chat-message-bubble ${isMe ? 'chat-message-me' : 'chat-message-them'}`} style={{ maxWidth: '70%', padding: '12px 18px', borderRadius: '18px' }}>
                        <p style={{ margin: 0, fontSize: '0.95rem', lineHeight: 1.5 }}>{msg.text}</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '6px', fontSize: '10px', opacity: 0.6, justifyContent: isMe ? 'flex-start' : 'flex-end' }}>
                          {msg.time ? new Date(msg.time).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) : ''}
                          {isMe && <CheckCheck size={12} />}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            <div style={{ padding: '20px 30px', background: 'rgba(0,0,0,0.2)', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px', background: 'rgba(255,255,255,0.05)', padding: '10px 15px', borderRadius: '18px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <Smile size={24} style={{ color: 'rgba(255,255,255,0.3)', cursor: 'pointer' }} onClick={() => setShowEmojiPicker(!showEmojiPicker)} />
                <input 
                  type="text" placeholder="اكتب رسالتك..."
                  style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: '#fff', fontSize: '0.95rem' }}
                  value={message} onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                />
                <button 
                  onClick={handleSend} disabled={!message.trim() || isSending}
                  className="btn-primary" style={{ padding: '8px 18px', borderRadius: '12px' }}
                >
                  <Send size={18} />
                </button>
              </div>
              {showEmojiPicker && (
                <div style={{ position: 'absolute', bottom: '100px', right: '30px', zIndex: 100 }}>
                  <Picker data={async () => (await import('@emoji-mart/data')).default} onEmojiSelect={(emoji) => setMessage(prev => prev + emoji.native)} theme="dark" />
                </div>
              )}
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', opacity: 0.3 }}>
            <MessageCircle size={100} style={{ color: '#fff', marginBottom: '20px' }} />
            <h2 style={{ color: '#fff' }}>مرحباً بك في الدردشة</h2>
            <p style={{ color: '#fff' }}>اختر طالباً من القائمة للبدء.</p>
          </div>
        )}
      </div>

      {showDetails && selectedChat && (
        <div style={{ width: '300px', borderRight: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.2)', padding: '30px' }}>
          <div style={{ textAlign: 'center', marginBottom: '30px' }}>
            <div style={{ width: '80px', height: '80px', borderRadius: '25px', background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-secondary))', margin: '0 auto 15px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', fontWeight: 900, color: '#fff' }}>{selectedChat.name?.substring(0, 1)}</div>
            <h3 style={{ margin: 0, color: '#fff' }}>{selectedChat.name}</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '15px', borderRadius: '15px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <p style={{ margin: 0, fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>رقم الهاتف</p>
              <p style={{ margin: '4px 0 0', color: '#fff', fontWeight: 700 }}>{selectedChat.phone}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
