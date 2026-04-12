import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageCircle, Search, Send, User, CheckCheck, RefreshCw, 
  Info, AlertCircle, Smile
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
      if (user) setEmployeeId(user.uid);
      else setEmployeeId('emp1');
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
      if (data) setActiveChats(Object.entries(data).map(([id, val]) => ({ phone: id, ...val })));
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
    <div className="glass-panel" style={{ display: 'flex', height: 'calc(100vh - 120px)', borderRadius: '24px', overflow: 'hidden', border: 'none', background: '#0f172a', direction: 'rtl' }}>
      
      {/* Sidebar */}
      <div style={{ width: '350px', borderLeft: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', background: '#1e293b' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fff', marginBottom: '15px' }}>المحادثات</h2>
          <input 
            type="text" placeholder="بحث..." 
            style={{ width: '100%', padding: '10px 15px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', outline: 'none' }}
            value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto' }}>
          {filteredSidebar.map(item => {
            const isActive = selectedChat?.id === item.id;
            return (
              <div 
                key={item.id} onClick={() => setSelectedChat(item)}
                style={{ padding: '15px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', background: isActive ? 'rgba(59, 130, 246, 0.2)' : 'transparent', borderRight: isActive ? '4px solid #3b82f6' : '4px solid transparent', transition: '0.2s' }}
              >
                <div style={{ width: '45px', height: '45px', borderRadius: '12px', background: 'linear-gradient(135deg, #3b82f6, #2dd4bf)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#fff' }}>{item.name?.substring(0, 1)}</div>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#fff' }}>{item.name}</h4>
                    {item.timestamp > 0 && <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>{new Date(item.timestamp).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}</span>}
                  </div>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{item.lastMessage}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Chat */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#020617' }}>
        {selectedChat ? (
          <>
            <div style={{ padding: '15px 25px', background: '#1e293b', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6' }}><User size={22} /></div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#fff' }}>{selectedChat.name}</h3>
                  <p style={{ margin: 0, fontSize: '0.7rem', color: '#3b82f6' }}>{selectedChat.phone}</p>
                </div>
              </div>
              <button onClick={() => setShowDetails(!showDetails)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer' }}><Info size={20} /></button>
            </div>

            <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '25px', display: 'flex', flexDirection: 'column', gap: '20px', background: '#020617' }}>
              {messages.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.1 }}><MessageCircle size={80} color="#fff" /></div>
              ) : (
                messages.map((msg, idx) => {
                  const isMe = msg.sender === 'me';
                  return (
                    <div key={msg.id || idx} style={{ 
                      display: 'flex', 
                      justifyContent: isMe ? 'flex-start' : 'flex-end', // In RTL, flex-start is RIGHT
                      width: '100%', 
                      padding: '0 5px'
                    }}>
                      <div style={{ 
                        maxWidth: '70%', 
                        width: 'auto', // Important: Don't stretch
                        minWidth: '100px',
                        padding: '12px 16px', 
                        borderRadius: '18px', 
                        background: isMe ? '#059669' : '#334155', // Me: Emerald Green, Them: Slate
                        color: '#fff',
                        borderTopRightRadius: isMe ? '4px' : '18px',
                        borderTopLeftRadius: isMe ? '18px' : '4px',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                        textAlign: 'right'
                      }}>
                        <p style={{ margin: 0, fontSize: '0.95rem', lineHeight: 1.5, wordBreak: 'break-word' }}>{msg.text}</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '5px', fontSize: '10px', color: 'rgba(255,255,255,0.5)', justifyContent: 'flex-start' }}>
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

            <div style={{ padding: '20px', background: '#1e293b' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(255,255,255,0.03)', padding: '5px 15px', borderRadius: '15px' }}>
                <Smile size={22} style={{ color: 'rgba(255,255,255,0.2)', cursor: 'pointer' }} onClick={() => setShowEmojiPicker(!showEmojiPicker)} />
                <input 
                  type="text" placeholder="اكتب رسالة..."
                  style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: '#fff', padding: '10px 0' }}
                  value={message} onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                />
                <button onClick={handleSend} disabled={isSending || !message.trim()} style={{ background: '#3b82f6', color: '#fff', border: 'none', width: '40px', height: '40px', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {isSending ? <RefreshCw size={18} className="animate-spin" /> : <Send size={18} />}
                </button>
              </div>
              {showEmojiPicker && (
                <div style={{ position: 'absolute', bottom: '90px', right: '30px', zIndex: 100 }}>
                  <Picker data={async () => (await import('@emoji-mart/data')).default} onEmojiSelect={(e) => setMessage(p => p + e.native)} theme="dark" />
                </div>
              )}
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.1 }}><MessageCircle size={100} color="#fff" /></div>
        )}
      </div>

      {showDetails && selectedChat && (
        <div style={{ width: '300px', background: '#1e293b', padding: '30px', borderRight: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: '80px', height: '80px', borderRadius: '25px', background: 'linear-gradient(135deg, #3b82f6, #2dd4bf)', margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', fontWeight: 900, color: '#fff' }}>{selectedChat.name?.substring(0, 1)}</div>
            <h4 style={{ color: '#fff', margin: 0 }}>{selectedChat.name}</h4>
          </div>
        </div>
      )}
    </div>
  );
}
