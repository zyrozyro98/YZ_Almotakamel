import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageCircle, Search, Send, User, CheckCheck, RefreshCw, 
  Info, AlertCircle, Smile, ChevronRight, ArrowRight, Phone, MessageSquare
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
  
  // Responsive State
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [view, setView] = useState('list'); // 'list' or 'chat'

  const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const unsubAuth = auth.onAuthStateChanged(user => {
      if (user) setEmployeeId(user.uid);
      else setEmployeeId('emp1');
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!employeeId || employeeId === 'emp1') return;
    const unsubStudents = onSnapshot(collection(db, 'students'), (snap) => {
      setStudents(snap.docs.map(doc => ({ id: doc.id, ...doc.data(), isStudent: true })));
    });
    const activeRef = ref(rtdb, `chats/${employeeId}`);
    const unsubActive = onValue(activeRef, (snapshot) => {
      const data = snapshot.val();
      if (data) setActiveChats(Object.entries(data).map(([id, val]) => ({ phone: id, ...val, isUnknown: true })));
      else setActiveChats([]);
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
      } else setMessages([]);
    });
    return () => unsubMsg();
  }, [selectedChat, employeeId]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const getMatchKey = (p) => String(p || '').replace(/[^0-9]/g, '').slice(-9);
  
  // Combine Students and Unknown Active Chats
  const combinedList = () => {
    const list = [...students];
    activeChats.forEach(chat => {
      const exists = students.find(s => getMatchKey(s.phone) === getMatchKey(chat.phone));
      if (!exists) {
        list.push({
          id: chat.phone,
          name: chat.name || `رقم: ${chat.phone}`,
          phone: chat.phone,
          isUnknown: true,
          lastMessage: chat.lastMessage,
          timestamp: chat.timestamp
        });
      }
    });

    return list.map(item => {
      const active = activeChats.find(c => getMatchKey(c.phone) === getMatchKey(item.phone));
      return {
        ...item,
        lastMessage: active?.lastMessage || item.lastMessage || 'لا توجد رسائل',
        timestamp: active?.timestamp || item.timestamp || 0
      };
    }).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  };

  const filteredSidebar = combinedList().filter(item => {
    const q = searchQuery.toLowerCase();
    return item.name?.toLowerCase().includes(q) || item.phone?.includes(q);
  });

  const selectChat = (chat) => {
    setSelectedChat(chat);
    if (isMobile) setView('chat');
  };

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
    <div className="whatsapp-container" style={{ 
      display: 'flex', height: 'calc(100vh - 120px)', borderRadius: isMobile ? '0' : '30px', 
      overflow: 'hidden', background: '#0f172a', direction: 'rtl',
      boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
      position: isMobile ? 'fixed' : 'relative',
      top: isMobile ? '0' : 'auto', left: 0, right: 0, bottom: 0, zIndex: 1000
    }}>
      
      {/* Sidebar - Visible on Desktop or when View is 'list' on Mobile */}
      <div className={`sidebar ${isMobile && view === 'chat' ? 'hidden' : 'visible'}`} style={{ 
        width: isMobile ? '100%' : '380px', borderLeft: '1px solid rgba(255,255,255,0.05)', 
        display: 'flex', flexDirection: 'column', background: '#1e293b', transition: '0.3s'
      }}>
        <div style={{ padding: '25px', background: 'rgba(0,0,0,0.2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '1.6rem', fontWeight: 900, color: '#fff', margin: 0 }}>المحادثات</h2>
            {isMobile && <button className="btn-secondary" onClick={() => window.location.reload()}><RefreshCw size={18}/></button>}
          </div>
          <div style={{ position: 'relative' }}>
            <Search style={{ position: 'absolute', right: '12px', top: '12px', color: 'rgba(255,255,255,0.2)' }} size={18} />
            <input 
              type="text" placeholder="بحث عن طالب أو رقم..." 
              style={{ width: '100%', padding: '12px 45px 12px 15px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '15px', color: '#fff', outline: 'none' }}
              value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto' }}>
          {filteredSidebar.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', opacity: 0.2 }}>
              <MessageSquare size={50} style={{ margin: '0 auto 15px' }} />
              <p>لا توجد محادثات نشطة</p>
            </div>
          ) : (
            filteredSidebar.map(item => (
              <div 
                key={item.id} onClick={() => selectChat(item)}
                style={{ 
                  padding: '18px 25px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '15px', 
                  background: selectedChat?.id === item.id ? 'rgba(59, 130, 246, 0.15)' : 'transparent', 
                  borderRight: selectedChat?.id === item.id ? '4px solid #3b82f6' : '4px solid transparent',
                  transition: '0.2s', borderBottom: '1px solid rgba(255,255,255,0.02)'
                }}
              >
                <div style={{ 
                  width: '50px', height: '50px', borderRadius: '16px', 
                  background: item.isUnknown ? 'linear-gradient(135deg, #64748b, #475569)' : 'linear-gradient(135deg, #3b82f6, #06b6d4)', 
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: '#fff' 
                }}>
                  {item.name?.substring(0, 1)}
                </div>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#fff' }}>{item.name}</h4>
                    {item.timestamp > 0 && <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>{new Date(item.timestamp).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}</span>}
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: selectedChat?.id === item.id ? '#3b82f6' : 'rgba(255,255,255,0.3)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                    {item.isUnknown && <span style={{ fontSize: '9px', background: '#475569', padding: '1px 5px', borderRadius: '4px', marginLeft: '5px' }}>جديد</span>}
                    {item.lastMessage}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Chat Area - Visible on Desktop or when View is 'chat' on Mobile */}
      <div className={`chat-area ${isMobile && view === 'list' ? 'hidden' : 'visible'}`} style={{ 
        flex: 1, display: 'flex', flexDirection: 'column', background: '#020617', 
        width: isMobile ? '100%' : 'auto', transition: '0.3s'
      }}>
        {selectedChat ? (
          <>
            <div style={{ padding: isMobile ? '15px' : '20px 35px', background: '#1e293b', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                {isMobile && <button style={{ background: 'none', border: 'none', color: '#fff', padding: '5px' }} onClick={() => setView('list')}><ArrowRight size={24} /></button>}
                <div style={{ width: '45px', height: '45px', borderRadius: '12px', background: 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6' }}><User size={24} /></div>
                <div>
                  <h3 style={{ margin: 0, fontSize: isMobile ? '0.95rem' : '1.1rem', fontWeight: 800, color: '#fff' }}>{selectedChat.name}</h3>
                  <p style={{ margin: 0, fontSize: '0.7rem', color: '#3b82f6', fontWeight: 700 }}>{selectedChat.phone}</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '15px' }}>
                {!isMobile && <RefreshCw size={20} style={{ color: 'rgba(255,255,255,0.3)', cursor: 'pointer' }} onClick={() => window.location.reload()} />}
                <button onClick={() => setShowDetails(!showDetails)} style={{ background: 'none', border: 'none', color: '#3b82f6' }}><Info size={20} /></button>
              </div>
            </div>

            <div className="custom-scrollbar" style={{ 
              flex: 1, overflowY: 'auto', padding: isMobile ? '15px' : '30px', 
              display: 'flex', flexDirection: 'column', gap: '15px', 
              background: 'radial-gradient(circle at center, #0f172a 0%, #020617 100%)' 
            }}>
              {messages.map((msg, idx) => {
                const isMe = msg.sender === 'me';
                return (
                  <div key={msg.id || idx} style={{ display: 'flex', justifyContent: isMe ? 'flex-start' : 'flex-end', width: '100%' }}>
                    <div style={{ 
                      maxWidth: '85%', width: 'fit-content', padding: '12px 18px', borderRadius: '22px', 
                      background: isMe ? '#059669' : '#1e293b', color: '#fff',
                      borderTopRightRadius: isMe ? '4px' : '22px', borderTopLeftRadius: isMe ? '22px' : '4px',
                      boxShadow: '0 4px 15px rgba(0,0,0,0.2)', position: 'relative'
                    }}>
                      <p style={{ margin: 0, fontSize: isMobile ? '0.9rem' : '1rem', lineHeight: 1.6 }}>{msg.text}</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '6px', fontSize: '9px', color: 'rgba(255,255,255,0.5)', justifyContent: 'flex-start' }}>
                        {msg.time ? new Date(msg.time).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) : ''}
                        {isMe && <CheckCheck size={12} />}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <div style={{ padding: isMobile ? '15px' : '25px 35px', background: '#1e293b' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px', background: 'rgba(255,255,255,0.05)', padding: '8px 15px', borderRadius: '18px', border: '1px solid rgba(255,255,255,0.1)' }}>
                {!isMobile && <Smile size={24} style={{ color: 'rgba(255,255,255,0.3)', cursor: 'pointer' }} onClick={() => setShowEmojiPicker(!showEmojiPicker)} />}
                <input 
                  type="text" placeholder="اكتب..." 
                  style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: '#fff', padding: '10px 0', fontSize: isMobile ? '0.9rem' : '1rem' }}
                  value={message} onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                />
                <button 
                  onClick={handleSend} disabled={isSending || !message.trim()} 
                  style={{ background: '#3b82f6', color: '#fff', border: 'none', width: '45px', height: '45px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  {isSending ? <RefreshCw size={20} className="animate-spin" /> : <Send size={20} />}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', textAlign: 'center' }}>
            <div style={{ width: '120px', height: '120px', borderRadius: '40px', background: 'rgba(59,130,246,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '30px' }}>
              <MessageSquare size={60} color="#3b82f6" style={{ opacity: 0.3 }} />
            </div>
            <h2 style={{ color: '#fff', fontSize: '1.8rem', fontWeight: 900 }}>حدد محادثة للبدء</h2>
            <p style={{ color: 'rgba(255,255,255,0.2)', maxWidth: '300px', marginTop: '10px' }}>اختر طالباً من القائمة اليمنى أو راقب الرسائل الجديدة من أرقام غير مسجلة.</p>
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 767px) {
          .sidebar.hidden { display: none; }
          .chat-area.hidden { display: none; }
        }
      `}} />
    </div>
  );
}
