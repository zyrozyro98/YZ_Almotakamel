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
        employeeId, 
        phoneNumber: selectedChat.phone.replace(/[^0-9]/g, ''), 
        message: textToSend
      });
    } catch (err) { console.error(err); } finally { setIsSending(false); }
  };

  return (
    <div className="glass-panel" style={{ display: 'flex', height: 'calc(100vh - 120px)', borderRadius: '32px', overflow: 'hidden', border: 'none', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
      
      {/* Sidebar */}
      <div style={{ width: '380px', borderLeft: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(20px)' }}>
        <div style={{ padding: '30px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
            <h2 style={{ fontSize: '1.6rem', fontWeight: 900, margin: 0, color: '#fff', letterSpacing: '-0.5px' }}>المحادثات</h2>
            <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '5px 12px', borderRadius: '10px', fontSize: '10px', fontWeight: 800, color: 'var(--brand-primary)', border: '1px solid rgba(59,130,246,0.2)' }}>
              {employeeId.toUpperCase()}
            </div>
          </div>
          <div style={{ position: 'relative', group: 'true' }}>
            <Search style={{ position: 'absolute', right: '15px', top: '14px', color: 'rgba(255,255,255,0.2)' }} size={18} />
            <input 
              type="text" placeholder="ابحث عن اسم أو رقم..." 
              style={{ width: '100%', padding: '12px 45px 12px 15px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '15px', color: '#fff', outline: 'none', fontSize: '0.9rem', transition: 'all 0.3s' }}
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
                  padding: '20px 25px', 
                  cursor: 'pointer', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '18px',
                  transition: 'all 0.2s',
                  background: isActive ? 'linear-gradient(to left, rgba(59, 130, 246, 0.1), transparent)' : 'transparent',
                  borderRight: isActive ? '4px solid var(--brand-primary)' : '4px solid transparent'
                }}
              >
                <div style={{ 
                  width: '55px', height: '55px', borderRadius: '18px', 
                  background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-secondary))', 
                  display: 'flex', alignItems: 'center', justifyContent: 'center', 
                  fontSize: '1.3rem', fontWeight: 900, color: '#fff',
                  boxShadow: isActive ? '0 8px 20px rgba(59,130,246,0.3)' : 'none'
                }}>
                  {item.name?.substring(0, 1)}
                </div>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                    <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: isActive ? '#fff' : 'rgba(255,255,255,0.8)', truncate: 'true' }}>{item.name}</h4>
                    {item.timestamp > 0 && <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', fontWeight: 600 }}>{new Date(item.timestamp).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}</span>}
                  </div>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: isActive ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.3)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{item.lastMessage}</p>
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
            <div style={{ padding: '20px 40px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', backdropFilter: 'blur(10px)', zIndex: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <div style={{ width: '50px', height: '50px', borderRadius: '15px', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59,130,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand-primary)' }}><User size={28} /></div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900, color: '#fff' }}>{selectedChat.name}</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 10px #22c55e' }}></span>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>{selectedChat.phone}</p>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '20px' }}>
                <button onClick={() => window.location.reload()} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: 'rgba(255,255,255,0.4)', padding: '10px', borderRadius: '12px', cursor: 'pointer', transition: 'all 0.3s' }} className="hover-white"><RefreshCw size={20} /></button>
                <button onClick={() => setShowDetails(!showDetails)} style={{ background: showDetails ? 'var(--brand-primary)' : 'rgba(255,255,255,0.05)', border: 'none', color: showDetails ? '#fff' : 'rgba(255,255,255,0.4)', padding: '10px', borderRadius: '12px', cursor: 'pointer' }}><Info size={20} /></button>
              </div>
            </div>

            <div className="custom-scrollbar chat-bg-pattern" style={{ flex: 1, overflowY: 'auto', padding: '40px', display: 'flex', flexDirection: 'column', gap: '25px', scrollBehavior: 'smooth' }}>
              {messages.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.1, filter: 'grayscale(1)' }}>
                  <MessageCircle size={120} style={{ color: '#fff', marginBottom: '20px' }} />
                  <h2 style={{ color: '#fff', fontSize: '2rem', fontWeight: 900 }}>لا توجد رسائل</h2>
                </div>
              ) : (
                messages.map((msg, idx) => {
                  const isMe = msg.sender === 'me';
                  return (
                    <div key={msg.id || idx} style={{ display: 'flex', justifyContent: isMe ? 'flex-start' : 'flex-end', width: '100%' }}>
                      <div className={isMe ? 'chat-message-me' : 'chat-message-them'} style={{ 
                        maxWidth: '70%', 
                        padding: '16px 20px', 
                        borderRadius: '24px', 
                        position: 'relative',
                        boxShadow: isMe ? '0 10px 25px rgba(59,130,246,0.2)' : '0 10px 25px rgba(0,0,0,0.1)',
                        borderTopRightRadius: isMe ? '4px' : '24px',
                        borderTopLeftRadius: isMe ? '24px' : '4px',
                        animation: 'messageIn 0.3s ease-out'
                      }}>
                        <p style={{ margin: 0, fontSize: '1rem', lineHeight: 1.6, fontWeight: 500 }}>{msg.text}</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', fontSize: '10px', opacity: 0.6, justifyContent: isMe ? 'flex-start' : 'flex-end' }}>
                          {msg.time ? new Date(msg.time).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) : ''}
                          {isMe && <CheckCheck size={14} style={{ opacity: 0.8 }} />}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div style={{ padding: '30px 40px', background: 'rgba(15, 23, 42, 0.4)', borderTop: '1px solid rgba(255,255,255,0.05)', backdropFilter: 'blur(20px)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px', background: 'rgba(255,255,255,0.03)', padding: '10px 20px', borderRadius: '22px', border: '1px solid rgba(255,255,255,0.05)', boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.2)' }}>
                <button style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.2)', cursor: 'pointer', padding: '10px' }} onClick={() => setShowEmojiPicker(!showEmojiPicker)}><Smile size={26} /></button>
                <input 
                  type="text" placeholder="اكتب رسالتك الذكية هنا..."
                  style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: '#fff', fontSize: '1rem', fontWeight: 500, padding: '10px 0' }}
                  value={message} onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                />
                <button style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.2)', cursor: 'pointer', padding: '10px' }}><Paperclip size={24} /></button>
                <button 
                  onClick={handleSend} disabled={!message.trim() || isSending}
                  style={{ 
                    background: isSending || !message.trim() ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, var(--brand-primary), var(--brand-secondary))',
                    border: 'none', color: isSending || !message.trim() ? 'rgba(255,255,255,0.1)' : '#fff',
                    width: '50px', height: '50px', borderRadius: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                    transition: 'all 0.3s', boxShadow: !message.trim() ? 'none' : '0 8px 20px rgba(59,130,246,0.3)'
                  }}
                >
                  {isSending ? <RefreshCw size={24} className="animate-spin" /> : <Send size={24} />}
                </button>
              </div>
              {showEmojiPicker && (
                <div style={{ position: 'absolute', bottom: '120px', right: '40px', zIndex: 100, boxShadow: '0 20px 50px rgba(0,0,0,0.5)', borderRadius: '20px', overflow: 'hidden' }}>
                  <Picker data={async () => (await import('@emoji-mart/data')).default} onEmojiSelect={(emoji) => setMessage(prev => prev + emoji.native)} theme="dark" />
                </div>
              )}
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '100px' }}>
            <div style={{ width: '140px', height: '140px', borderRadius: '50px', background: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '40px', border: '1px solid rgba(255,255,255,0.05)', boxShadow: 'inset 0 0 40px rgba(59,130,246,0.05)' }}>
              <MessageCircle size={70} style={{ color: 'var(--brand-primary)', opacity: 0.6 }} />
            </div>
            <h2 style={{ fontSize: '3rem', fontWeight: 1000, color: '#fff', marginBottom: '20px', letterSpacing: '-1px' }}>نظام الدردشة الذكي</h2>
            <p style={{ maxWidth: '450px', fontSize: '1.2rem', color: 'rgba(255,255,255,0.2)', fontWeight: 600, lineHeight: 1.6 }}>اختر طالباً من القائمة الجانبية لبدء المحادثة بشكل احترافي ومراقبة حالة الطلبات فوراً.</p>
          </div>
        )}
      </div>

      {showDetails && selectedChat && (
        <div style={{ width: '350px', borderRight: '1px solid rgba(255,255,255,0.05)', background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(30px)', padding: '40px', display: 'flex', flexDirection: 'column', gap: '40px', animation: 'slideIn 0.3s ease-out' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: '100px', height: '100px', borderRadius: '30px', background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-secondary))', margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', fontWeight: 1000, color: '#fff', boxShadow: '0 15px 35px rgba(59,130,246,0.3)' }}>{selectedChat.name?.substring(0, 1)}</div>
            <h3 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900, color: '#fff', marginBottom: '5px' }}>{selectedChat.name}</h3>
            <p style={{ margin: 0, color: 'var(--brand-primary)', fontSize: '0.9rem', fontWeight: 800 }}>طالب مسجل في النظام</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '20px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>رقم التواصل</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Phone size={18} style={{ color: 'var(--brand-primary)' }} />
                <span style={{ fontSize: '1.1rem', color: '#fff', fontWeight: 700 }}>{selectedChat.phone}</span>
              </div>
            </div>
            <div style={{ background: 'rgba(59, 130, 246, 0.05)', padding: '20px', borderRadius: '20px', border: '1px solid rgba(59,130,246,0.1)' }}>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--brand-primary)', fontWeight: 800, textAlign: 'center' }}>الدردشة مشفرة وآمنة تماماً</p>
            </div>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes messageIn {
          from { opacity: 0; transform: translateY(15px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes slideIn {
          from { transform: translateX(-50px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        .hover-white:hover { color: #fff !important; background: rgba(255,255,255,0.1) !important; }
        .chat-bg-pattern {
          background-image: radial-gradient(rgba(59, 130, 246, 0.03) 1px, transparent 1px);
          background-size: 30px 30px;
        }
      `}} />
    </div>
  );
}
