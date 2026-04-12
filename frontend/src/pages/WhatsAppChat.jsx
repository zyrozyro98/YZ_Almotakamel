import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageCircle, Search, Send, Paperclip, MoreVertical, 
  Smile, User, CheckCheck, RefreshCw, Phone, Info
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
  const messagesEndRef = useRef(null);
  
  const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

  useEffect(() => {
    const unsubAuth = auth.onAuthStateChanged(user => {
      if (user) setEmployeeId(user.email.split('@')[0].replace(/[^a-zA-Z0-9]/g, ''));
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!employeeId || employeeId === 'emp1') return;
    const unsubStudents = onSnapshot(collection(db, 'students'), (snap) => {
      setStudents(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const activeRef = ref(rtdb, `v2_chats/${employeeId}`);
    const unsubActive = onValue(activeRef, (snap) => {
      if (snap.exists()) {
        const list = Object.entries(snap.val()).map(([id, val]) => ({ phone: id, ...val }));
        setActiveChats(list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));
      }
    });
    return () => { unsubStudents(); unsubActive(); };
  }, [employeeId]);

  useEffect(() => {
    if (!selectedChat || !employeeId) return;
    const cleanId = String(selectedChat.phone).replace(/[^0-9]/g, '').slice(-9);
    const messagesRef = ref(rtdb, `v2_chats/${employeeId}/${cleanId}/messages`);
    const unsubMsg = onValue(messagesRef, (snap) => {
      setMessages(snap.exists() ? Object.entries(snap.val()).map(([id, val]) => ({ id, ...val })) : []);
    });
    return () => unsubMsg();
  }, [selectedChat, employeeId]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const sidebarList = students.map(s => {
    const sId = String(s.phone).replace(/[^0-9]/g, '').slice(-9);
    const active = activeChats.find(c => String(c.phone).slice(-9) === sId);
    return { ...s, lastMessage: active?.lastMessage || 'لا يوجد نشاط', timestamp: active?.timestamp || 0, phone: s.phone };
  }).sort((a, b) => b.timestamp - a.timestamp);

  const filteredSidebar = sidebarList.filter(i => i.name?.toLowerCase().includes(searchQuery.toLowerCase()) || i.phone?.includes(searchQuery));

  const handleSend = async () => {
    if (!message.trim() || !selectedChat || isSending) return;
    const textToSend = message; setMessage(''); setIsSending(true);
    try {
      await axios.post(`${BASE_URL}/api/whatsapp/send`, { employeeId, phoneNumber: selectedChat.phone, message: textToSend });
    } catch (err) { console.error(err); } finally { setIsSending(false); }
  };

  return (
    <div className="glass-panel" style={{ display: 'flex', height: 'calc(100vh - 120px)', borderRadius: '24px', overflow: 'hidden', border: 'none' }}>
      <div style={{ width: '350px', borderLeft: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '24px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff' }}>الدردشات V2</h2>
          <div style={{ position: 'relative' }}>
            <Search style={{ position: 'absolute', right: '12px', top: '12px', opacity: 0.3 }} size={18} />
            <input type="text" placeholder="ابحث..." className="input-base" style={{ paddingRight: '45px' }} value={searchQuery} onChange={(e)=>setSearchQuery(e.target.value)} />
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filteredSidebar.map(item => (
            <div key={item.id} onClick={()=>setSelectedChat(item)} className={`chat-sidebar-item ${selectedChat?.id === item.id ? 'active' : ''}`} style={{ padding: '15px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '15px' }}>
              <div style={{ width: '45px', height: '45px', borderRadius: '12px', background: 'var(--brand-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>{item.name?.[0]}</div>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                   <h4 style={{ margin: 0, fontSize: '0.9rem', color: '#fff' }}>{item.name}</h4>
                   <span style={{ fontSize: '10px', opacity: 0.3 }}>{item.timestamp ? new Date(item.timestamp).toLocaleTimeString('ar-SA') : ''}</span>
                </div>
                <p style={{ margin: 0, fontSize: '0.75rem', opacity: 0.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.lastMessage}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.1)' }}>
        {selectedChat ? (
          <>
            <div style={{ padding: '15px 30px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.02)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
               <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                  <div style={{ color: 'var(--brand-primary)' }}><User size={24} /></div>
                  <div><h3 style={{ margin: 0, fontSize: '1rem' }}>{selectedChat.name}</h3><p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--brand-primary)' }}>{selectedChat.phone}</p></div>
               </div>
               <RefreshCw size={20} style={{ opacity: 0.3, cursor: 'pointer' }} onClick={()=>window.location.reload()} />
            </div>
            <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '30px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
               {messages.length === 0 ? <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.1 }}><MessageCircle size={80} /></div> : 
                 messages.map((m, i) => (
                   <div key={i} style={{ display: 'flex', justifyContent: m.sender === 'me' ? 'flex-start' : 'flex-end' }}>
                     <div className={m.sender === 'me' ? 'chat-message-me' : 'chat-message-them'} style={{ padding: '10px 15px', borderRadius: '15px', maxWidth: '80%' }}>
                        <p style={{ margin: 0 }}>{m.text}</p>
                        <div style={{ fontSize: '9px', opacity: 0.5, marginTop: '5px', textAlign: 'right' }}>{m.time ? new Date(m.time).toLocaleTimeString('ar-SA') : ''}</div>
                     </div>
                   </div>
                 ))
               }
               <div ref={messagesEndRef} />
            </div>
            <div style={{ padding: '20px 30px', background: 'rgba(0,0,0,0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px', background: 'rgba(255,255,255,0.05)', padding: '10px 15px', borderRadius: '15px' }}>
                <Smile size={24} style={{ opacity: 0.3 }} onClick={()=>setShowEmojiPicker(!showEmojiPicker)} />
                <input type="text" placeholder="اكتب رسالتك..." style={{ flex: 1, background: 'none', border: 'none', color: '#fff', outline: 'none' }} value={message} onChange={(e)=>setMessage(e.target.value)} onKeyDown={(e)=>e.key === 'Enter' && handleSend()} />
                <button onClick={handleSend} className="btn-primary" style={{ padding: '10px 20px', borderRadius: '10px' }}>{isSending ? 'جاري...' : 'إرسال'}</button>
              </div>
              {showEmojiPicker && <div style={{ position: 'absolute', bottom: '100px', right: '30px' }}><Picker data={async () => (await import('@emoji-mart/data')).default} onEmojiSelect={(e)=>setMessage(p=>p+e.native)} theme="dark" /></div>}
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.2 }}><MessageCircle size={100} /></div>
        )}
      </div>
    </div>
  );
}
