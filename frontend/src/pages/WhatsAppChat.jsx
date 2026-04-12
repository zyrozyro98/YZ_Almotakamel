import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, Search, Send, User, CheckCheck, RefreshCw } from 'lucide-react';
import axios from 'axios';
import { auth, rtdb, db } from '../firebase';
import { ref, onValue } from 'firebase/database';
import { collection, onSnapshot } from 'firebase/firestore';

export default function WhatsAppChat() {
  const [userId, setUserId] = useState(null);
  const [selectedChat, setSelectedChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [activeChats, setActiveChats] = useState([]);
  const [students, setStudents] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [errorLog, setErrorLog] = useState(null);
  const messagesEndRef = useRef(null);
  
  const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

  useEffect(() => {
    const unsubAuth = auth.onAuthStateChanged(user => {
      if (user) {
        setUserId(user.uid); // USE THE UID AS ROOT
        console.log('[AUTH] My UID is:', user.uid);
      }
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!userId) return;

    // Listen to students
    const unsubStudents = onSnapshot(collection(db, 'students'), (snap) => {
      setStudents(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // Listen to chats at v3_chats/MY_UID
    const activeRef = ref(rtdb, `v3_chats/${userId}`);
    const unsubActive = onValue(activeRef, (snap) => {
      if (snap.exists()) {
        const list = Object.entries(snap.val()).map(([id, val]) => ({ phone: id, ...val }));
        setActiveChats(list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));
        setErrorLog(null);
      }
    }, (err) => {
      setErrorLog(`خطأ في قراءة الدردشات: ${err.message}`);
    });

    return () => { unsubStudents(); unsubActive(); };
  }, [userId]);

  useEffect(() => {
    if (!selectedChat || !userId) return;
    const cleanId = String(selectedChat.phone).replace(/[^0-9]/g, '').slice(-9);
    const messagesRef = ref(rtdb, `v3_chats/${userId}/${cleanId}/messages`);
    const unsubMsg = onValue(messagesRef, (snap) => {
      setMessages(snap.exists() ? Object.entries(snap.val()).map(([id, val]) => ({ id, ...val })) : []);
    });
    return () => unsubMsg();
  }, [selectedChat, userId]);

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
      // We pass the auth.uid to the backend so it knows where to save
      await axios.post(`${BASE_URL}/api/whatsapp/send`, { 
         employeeId: auth.currentUser.email.split('@')[0], // For session
         userId: userId, // FOR RTDB PATH
         phoneNumber: selectedChat.phone, 
         message: textToSend 
      });
    } catch (err) { console.error(err); } finally { setIsSending(false); }
  };

  if (!userId) return <div style={{ padding: '40px', color: '#fff' }}>جاري التحقق من الهوية...</div>;

  return (
    <div className="glass-panel" style={{ display: 'flex', height: 'calc(100vh - 120px)', borderRadius: '24px', overflow: 'hidden', border: 'none' }}>
      <div style={{ width: '350px', borderLeft: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '24px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff', margin: 0 }}>نظام الدردشة V3</h2>
          <p style={{ fontSize: '10px', color: 'var(--brand-primary)' }}>UID: {userId}</p>
          {errorLog && <div style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', padding: '10px', borderRadius: '8px', fontSize: '11px', marginTop: '10px' }}>{errorLog}</div>}
          <div style={{ position: 'relative', marginTop: '10px' }}>
            <Search style={{ position: 'absolute', right: '12px', top: '12px', opacity: 0.3 }} size={18} />
            <input type="text" placeholder="ابحث..." className="input-base" style={{ paddingRight: '45px' }} value={searchQuery} onChange={(e)=>setSearchQuery(e.target.value)} />
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filteredSidebar.map(item => (
            <div key={item.id} onClick={()=>setSelectedChat(item)} className={`chat-sidebar-item ${selectedChat?.id === item.id ? 'active' : ''}`} style={{ padding: '15px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '15px' }}>
              <div style={{ width: '45px', height: '45px', borderRadius: '12px', background: 'var(--brand-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>{item.name?.[0]}</div>
              <div style={{ flex: 1 }}>
                 <h4 style={{ margin: 0, fontSize: '0.9rem', color: '#fff' }}>{item.name}</h4>
                 <p style={{ margin: 0, fontSize: '0.75rem', opacity: 0.4 }}>{item.lastMessage}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.1)' }}>
        {selectedChat ? (
          <>
            <div style={{ padding: '15px 30px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
               <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                  <div style={{ color: 'var(--brand-primary)' }}><User size={24} /></div>
                  <div><h3 style={{ margin: 0, fontSize: '1rem' }}>{selectedChat.name}</h3><p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--brand-primary)' }}>{selectedChat.phone}</p></div>
               </div>
               <RefreshCw size={20} style={{ opacity: 0.3, cursor: 'pointer' }} onClick={()=>window.location.reload()} />
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '30px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
               {messages.map((m, i) => (
                 <div key={i} style={{ display: 'flex', justifyContent: m.sender === 'me' ? 'flex-start' : 'flex-end' }}>
                   <div style={{ background: m.sender === 'me' ? 'var(--brand-primary)' : 'rgba(255,255,255,0.05)', padding: '10px 15px', borderRadius: '15px', maxWidth: '80%' }}>
                      <p style={{ margin: 0 }}>{m.text}</p>
                   </div>
                 </div>
               ))}
               <div ref={messagesEndRef} />
            </div>
            <div style={{ padding: '20px 30px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px', background: 'rgba(255,255,255,0.05)', padding: '10px 15px', borderRadius: '15px' }}>
                <input type="text" placeholder="اكتب رسالتك..." style={{ flex: 1, background: 'none', border: 'none', color: '#fff', outline: 'none' }} value={message} onChange={(e)=>setMessage(e.target.value)} onKeyDown={(e)=>e.key === 'Enter' && handleSend()} />
                <button onClick={handleSend} className="btn-primary" style={{ padding: '10px 20px', borderRadius: '10px' }}>{isSending ? '...' : 'إرسال'}</button>
              </div>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.2 }}><MessageCircle size={100} /></div>
        )}
      </div>
    </div>
  );
}
