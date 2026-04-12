import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageCircle, Search, Send, Paperclip, MoreVertical, 
  Smile, User, CheckCheck, Clock, Shield, RefreshCw, 
  ChevronLeft, Hash, Phone, Info
} from 'lucide-react';
import axios from 'axios';
import { auth, rtdb, db } from '../firebase';
import { ref, onValue, push } from 'firebase/database';
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
        const list = Object.entries(data).map(([id, val]) => ({ phone: id, ...val }));
        setActiveChats(list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));
      }
    });
    return () => { unsubStudents(); unsubActive(); };
  }, [employeeId]);

  useEffect(() => {
    if (!selectedChat || !employeeId) return;
    const cleanId = String(selectedChat.phone).replace(/[^0-9]/g, '').slice(-9);
    const messagesRef = ref(rtdb, `chats/${employeeId}/${cleanId}/messages`);
    const unsubMsg = onValue(messagesRef, (snapshot) => {
      const data = snapshot.val();
      setMessages(data ? Object.entries(data).map(([id, val]) => ({ id, ...val })) : []);
    });
    return () => unsubMsg();
  }, [selectedChat, employeeId]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const getMatchKey = (p) => String(p || '').replace(/[^0-9]/g, '').slice(-9);
  const sidebarList = students.map(s => {
    const active = activeChats.find(c => getMatchKey(c.phone) === getMatchKey(s.phone));
    return { ...s, lastMessage: active?.lastMessage || 'لا توجد رسائل سابقة', timestamp: active?.timestamp || 0 };
  }).sort((a, b) => b.timestamp - a.timestamp);

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
    <div className="glass-panel" style={{ display: 'flex', height: 'calc(100vh - 120px)', borderRadius: '24px', overflow: 'hidden', border: 'none' }}>
      
      {/* Sidebar */}
      <div style={{ width: '350px', borderLeft: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '24px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0, color: '#fff' }}>الدردشات</h2>
            <span className="badge badge-info">{employeeId}</span>
          </div>
          <div style={{ position: 'relative' }}>
            <Search style={{ position: 'absolute', right: '12px', top: '12px', color: 'rgba(255,255,255,0.3)' }} size={18} />
            <input 
              type="text" placeholder="ابحث عن طالب..." 
              className="input-base" style={{ paddingRight: '45px', background: 'rgba(255,255,255,0.05)' }}
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
                <div style={{ width: '50px', height: '50px', borderRadius: '15px', background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-secondary))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', fontWeight: 'bold', color: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
                  {item.name?.substring(0, 1)}
                </div>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</h4>
                    {item.timestamp > 0 && <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>{new Date(item.timestamp).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}</span>}
                  </div>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.lastMessage}</p>
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
            <div style={{ padding: '15px 30px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(10px)' }}>
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

            <div className="custom-scrollbar chat-bg-pattern" style={{ flex: 1, overflowY: 'auto', padding: '30px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {messages.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.2 }}>
                  <MessageCircle size={80} style={{ color: '#fff', marginBottom: '15px' }} />
                  <h2 style={{ color: '#fff' }}>لا توجد رسائل</h2>
                </div>
              ) : (
                messages.map((msg, idx) => {
                  const isMe = msg.sender === 'me';
                  return (
                    <div key={msg.id || idx} style={{ display: 'flex', justifyContent: isMe ? 'flex-start' : 'flex-end', width: '100%' }}>
                      <div className={`chat-message-bubble ${isMe ? 'chat-message-me' : 'chat-message-them'}`} style={{ maxWidth: '75%' }}>
                        <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{msg.text}</p>
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
                  type="text" placeholder="اكتب رسالتك الذكية هنا..."
                  style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: '#fff', fontSize: '0.95rem' }}
                  value={message} onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                />
                <Paperclip size={24} style={{ color: 'rgba(255,255,255,0.3)', cursor: 'pointer' }} />
                <button 
                  onClick={handleSend} disabled={!message.trim() || isSending}
                  className="btn-primary" style={{ padding: '10px 20px', borderRadius: '12px' }}
                >
                  {isSending ? <RefreshCw size={20} className="animate-spin" /> : <Send size={20} />}
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
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '40px' }}>
            <div style={{ width: '100px', height: '100px', borderRadius: '35px', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '25px' }}>
              <MessageCircle size={50} style={{ color: 'var(--brand-primary)', opacity: 0.5 }} />
            </div>
            <h2 style={{ fontSize: '2.4rem', fontWeight: 900, color: '#fff', marginBottom: '15px' }}>مرحباً بك مجدداً</h2>
            <p style={{ maxWidth: '400px', fontSize: '1.1rem', color: 'rgba(255,255,255,0.3)', fontWeight: 600 }}>اختر طالباً من القائمة الجانبية لبدء المحادثة وإدارة الطلبات بشكل احترافي.</p>
          </div>
        )}
      </div>

      {showDetails && selectedChat && (
        <div style={{ width: '300px', borderRight: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.2)', padding: '30px', display: 'flex', flexDirection: 'column', gap: '30px' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: '80px', height: '80px', borderRadius: '25px', background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-secondary))', margin: '0 auto 15px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', fontWeight: 900, color: '#fff' }}>{selectedChat.name?.substring(0, 1)}</div>
            <h3 style={{ margin: 0, color: '#fff' }}>{selectedChat.name}</h3>
            <p style={{ margin: 0, color: 'var(--brand-primary)', fontSize: '0.85rem', fontWeight: 700 }}>طالب مسجل</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <h5 style={{ opacity: 0.3, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '2px' }}>تفاصيل التواصل</h5>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '15px', borderRadius: '15px', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><Phone size={14} style={{ color: 'var(--brand-primary)' }} /><span style={{ fontSize: '0.85rem', color: '#fff' }}>{selectedChat.phone}</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
