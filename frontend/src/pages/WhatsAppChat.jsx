import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageCircle, Search, Send, Paperclip, MoreVertical, 
  Smile, User, CheckCheck, Clock, Shield, RefreshCw 
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
  const messagesEndRef = useRef(null);
  
  const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

  // 1. Auth Listener
  useEffect(() => {
    const unsubAuth = auth.onAuthStateChanged(user => {
      if (user) {
        const id = user.email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');
        setEmployeeId(id);
      }
    });
    return () => unsubAuth();
  }, []);

  // 2. Data Listeners (Students & Global Chats)
  useEffect(() => {
    if (!employeeId || employeeId === 'emp1') return;

    // Listen to Firestore Students
    const unsubStudents = onSnapshot(collection(db, 'students'), (snap) => {
      setStudents(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // Listen to RTDB Active Chats (Recent conversations)
    const activeRef = ref(rtdb, `chats/${employeeId}`);
    const unsubActive = onValue(activeRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list = Object.entries(data).map(([id, val]) => ({
          phone: id,
          ...val
        }));
        setActiveChats(list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));
      }
    });

    return () => { unsubStudents(); unsubActive(); };
  }, [employeeId]);

  // 3. Message Listener for Selected Chat
  useEffect(() => {
    if (!selectedChat || !employeeId) return;

    const rawPhone = selectedChat.phone || '';
    const cleanId = rawPhone.replace(/[^0-9]/g, '').slice(-9); // Unified 9-digit key
    
    if (!cleanId) return;

    const messagesRef = ref(rtdb, `chats/${employeeId}/${cleanId}/messages`);
    console.log(`[LISTEN] chats/${employeeId}/${cleanId}/messages`);

    const unsubMsg = onValue(messagesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setMessages(Object.entries(data).map(([id, val]) => ({ id, ...val })));
      } else {
        setMessages([]);
      }
    }, (err) => console.error('[RTDB ERROR]', err));

    return () => unsubMsg();
  }, [selectedChat, employeeId]);

  // 4. Auto-Scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Utility: Normalize matching
  const getMatchKey = (p) => String(p || '').replace(/[^0-9]/g, '').slice(-9);

  // Merge Students and Active Chats for the Sidebar
  const sidebarList = students.map(s => {
    const active = activeChats.find(c => getMatchKey(c.phone) === getMatchKey(s.phone));
    return {
      ...s,
      lastMessage: active?.lastMessage || 'لا توجد رسائل',
      timestamp: active?.timestamp || 0,
      phone: s.phone // Priority to Firestore phone
    };
  }).sort((a, b) => b.timestamp - a.timestamp);

  const filteredSidebar = sidebarList.filter(item => 
    item.name?.includes(searchQuery) || item.phone?.includes(searchQuery)
  );

  const handleSend = async () => {
    if (!message.trim() || !selectedChat || isSending) return;

    const textToSend = message;
    setMessage('');
    setShowEmojiPicker(false);
    setIsSending(true);

    try {
      const cleanPhone = selectedChat.phone.replace(/[^0-9]/g, '');
      await axios.post(`${BASE_URL}/api/whatsapp/send`, {
        employeeId,
        phoneNumber: cleanPhone,
        message: textToSend
      }, { timeout: 15000 });
      // Backend handles saving to RTDB
    } catch (err) {
      console.error('[SEND ERROR]', err);
      alert('تأخر الرد، يرجى التحقق من الرسالة بعد قليل.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex glass-panel overflow-hidden" style={{ height: 'calc(100vh - 120px)', borderRadius: '24px' }}>
      
      {/* Sidebar */}
      <div className="w-1/3 border-l border-white/5 flex flex-col bg-black/20 backdrop-blur-xl">
        <div className="p-4 border-b border-white/5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">الدردشة</h2>
            <div className="flex gap-2">
              <span className="text-[10px] bg-brand-primary/20 text-brand-primary px-2 py-1 rounded-full border border-brand-primary/30">
                {employeeId}
              </span>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute right-3 top-3 text-white/30" size={18} />
            <input 
              type="text" 
              placeholder="ابحث عن طالب أو رقم..."
              className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pr-10 pl-4 text-white placeholder:text-white/20 focus:border-brand-primary transition-all outline-none"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {filteredSidebar.map(item => {
            const isActive = selectedChat?.id === item.id;
            return (
              <div 
                key={item.id}
                onClick={() => setSelectedChat(item)}
                className={`p-4 flex items-center gap-4 cursor-pointer transition-all hover:bg-white/5 border-b border-white/5 ${isActive ? 'bg-brand-primary/10 border-r-4 border-r-brand-primary' : ''}`}
              >
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-brand-primary to-brand-secondary flex items-center justify-center text-white font-bold shadow-lg">
                  {item.name?.substring(0, 1)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-1">
                    <h4 className="text-white font-semibold truncate text-sm">{item.name}</h4>
                    {item.timestamp > 0 && (
                      <span className="text-[10px] text-white/30">
                        {new Date(item.timestamp).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-white/40 truncate">{item.lastMessage}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Chat Window */}
      <div className="flex-1 flex flex-col bg-black/40 relative">
        {selectedChat ? (
          <>
            {/* Header */}
            <div className="p-4 border-b border-white/5 flex items-center justify-between backdrop-blur-md bg-white/5 z-10">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-brand-primary/20 flex items-center justify-center text-brand-primary">
                  <User size={20} />
                </div>
                <div>
                  <h3 className="text-white font-bold leading-none mb-1">{selectedChat.name}</h3>
                  <p className="text-[10px] text-brand-primary flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-primary animate-pulse"></span>
                    {selectedChat.phone}
                  </p>
                </div>
              </div>
              <div className="flex gap-4 text-white/40">
                <RefreshCw size={20} className="cursor-pointer hover:text-white transition-colors" onClick={() => window.location.reload()} />
                <MoreVertical size={20} className="cursor-pointer hover:text-white transition-colors" />
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 chat-background custom-scrollbar">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full opacity-20 text-white text-center">
                  <MessageCircle size={80} className="mb-4" />
                  <p className="text-xl">لا توجد رسائل سابقة</p>
                  <p className="text-sm">ابدأ بإرسال أول رسالة لهذا الطالب الآن</p>
                </div>
              ) : (
                messages.map((msg, idx) => {
                  const isMe = msg.sender === 'me';
                  return (
                    <div key={msg.id || idx} className={`flex ${isMe ? 'justify-start' : 'justify-end'}`}>
                      <div className={`max-w-[70%] p-4 rounded-2xl relative shadow-xl ${
                        isMe 
                          ? 'bg-brand-primary text-white rounded-tr-none' 
                          : 'bg-white/10 text-white backdrop-blur-lg border border-white/5 rounded-tl-none'
                      }`}>
                        <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                        <div className={`flex items-center justify-end gap-1 mt-1 text-[10px] ${isMe ? 'text-white/60' : 'text-white/30'}`}>
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

            {/* Input */}
            <div className="p-4 border-t border-white/5 bg-black/40 backdrop-blur-md">
              <div className="flex items-center gap-2 max-w-4xl mx-auto bg-white/5 rounded-2xl p-2 border border-white/10 focus-within:border-brand-primary/50 transition-all">
                <button className="p-2 text-white/40 hover:text-white transition-colors" onClick={() => setShowEmojiPicker(!showEmojiPicker)}>
                  <Smile size={24} />
                </button>
                <input 
                  type="text" 
                  placeholder="اكتب رسالتك هنا..."
                  className="flex-1 bg-transparent border-none text-white outline-none px-2 py-2 text-sm placeholder:text-white/20"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                />
                <button className="p-2 text-white/40 hover:text-white transition-colors">
                  <Paperclip size={24} />
                </button>
                <button 
                  onClick={handleSend}
                  disabled={!message.trim() || isSending}
                  className={`p-3 rounded-xl transition-all ${!message.trim() || isSending ? 'bg-white/5 text-white/10' : 'bg-brand-primary text-white shadow-lg shadow-brand-primary/20 hover:scale-105 active:scale-95'}`}
                >
                  <Send size={20} />
                </button>
              </div>
              {showEmojiPicker && (
                <div className="absolute bottom-24 right-4 z-50">
                  <Picker 
                    data={async () => (await import('@emoji-mart/data')).default} 
                    onEmojiSelect={(emoji) => setMessage(prev => prev + emoji.native)}
                    theme="dark"
                  />
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-white/20 p-10 text-center">
            <div className="w-24 h-24 rounded-full border-4 border-dashed border-white/10 flex items-center justify-center mb-6">
              <MessageCircle size={48} />
            </div>
            <h3 className="text-2xl font-bold mb-2">مرحباً بك في دردشة دبلومالاين</h3>
            <p className="max-w-md">اختر طالباً من القائمة الجانبية لبدء المحادثة ومراقبة حالة الطلب بشكل فوري.</p>
            <div className="mt-8 flex gap-4 text-xs font-semibold">
              <div className="flex items-center gap-2 bg-white/5 px-4 py-2 rounded-lg border border-white/5">
                <Shield size={14} className="text-brand-primary" /> نظام مشفر وآمن
              </div>
              <div className="flex items-center gap-2 bg-white/5 px-4 py-2 rounded-lg border border-white/5">
                <Clock size={14} className="text-brand-primary" /> مزامنة لحظية
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
