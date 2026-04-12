import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageCircle, Search, Send, Paperclip, MoreVertical, 
  Smile, User, CheckCheck, Clock, Shield, RefreshCw, 
  ChevronRight, Hash, Phone, Info
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
    const unsubMsg = onValue(messagesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setMessages(Object.entries(data).map(([id, val]) => ({ id, ...val })));
      } else {
        setMessages([]);
      }
    });

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
      lastMessage: active?.lastMessage || 'لا توجد رسائل سابقة',
      timestamp: active?.timestamp || 0,
      phone: s.phone 
    };
  }).sort((a, b) => b.timestamp - a.timestamp);

  const filteredSidebar = sidebarList.filter(item => {
    const q = searchQuery.toLowerCase();
    return item.name?.toLowerCase().includes(q) || item.phone?.includes(q);
  });

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
    } catch (err) {
      console.error('[SEND ERROR]', err);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex glass-panel overflow-hidden border-none" style={{ height: 'calc(100vh - 120px)', borderRadius: '32px' }}>
      
      {/* Sidebar - Modern List */}
      <div className="w-1/3 border-l border-white/5 flex flex-col bg-bg-secondary/30 backdrop-blur-2xl">
        <div className="p-6 border-b border-white/5">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-black text-white flex items-center gap-2">
              <MessageCircle size={24} className="text-brand-primary" />
              الدردشات
            </h2>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => window.location.reload()}
                className="p-2 rounded-full hover:bg-white/10 text-white/40 transition-all"
              >
                <RefreshCw size={18} />
              </button>
              <span className="badge badge-info">{employeeId}</span>
            </div>
          </div>
          <div className="relative group">
            <Search className="absolute right-4 top-3.5 text-white/20 group-focus-within:text-brand-primary transition-colors" size={18} />
            <input 
              type="text" 
              placeholder="ابحث عن طالب أو رقم هاتف..."
              className="input-base pr-12 bg-white/5 border-transparent focus:bg-white/10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
          {filteredSidebar.map(item => {
            const isActive = selectedChat?.id === item.id;
            return (
              <div 
                key={item.id}
                onClick={() => setSelectedChat(item)}
                className={`chat-sidebar-item rounded-2xl p-4 flex items-center gap-4 cursor-pointer ${isActive ? 'active' : ''}`}
              >
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-primary to-brand-secondary flex items-center justify-center text-white text-xl font-bold shadow-2xl relative">
                  {item.name?.substring(0, 1)}
                  {item.timestamp > Date.now() - 300000 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-success border-2 border-bg-primary rounded-full"></span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-1">
                    <h4 className="text-white font-bold truncate text-[15px]">{item.name}</h4>
                    {item.timestamp > 0 && (
                      <span className="text-[10px] text-white/30 font-medium">
                        {new Date(item.timestamp).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-white/40 truncate leading-relaxed">
                    {item.lastMessage}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Chat Window - Immersive View */}
      <div className="flex-1 flex flex-col bg-black/20 relative chat-bg-pattern">
        {selectedChat ? (
          <>
            {/* Header */}
            <div className="p-4 px-8 border-b border-white/5 flex items-center justify-between backdrop-blur-3xl bg-white/5 z-20">
              <div className="flex items-center gap-4">
                <div 
                  className="w-12 h-12 rounded-2xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary cursor-pointer hover:scale-105 transition-all"
                  onClick={() => setShowDetails(!showDetails)}
                >
                  <User size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-white mb-0.5">{selectedChat.name}</h3>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-brand-primary font-bold flex items-center gap-1 bg-brand-primary/10 px-2 py-0.5 rounded-full">
                      <Phone size={10} /> {selectedChat.phone}
                    </span>
                    <span className="text-[10px] text-success font-bold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse"></span>
                      متصل الآن
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex gap-4">
                <button 
                  onClick={() => setShowDetails(!showDetails)}
                  className={`p-3 rounded-xl transition-all ${showDetails ? 'bg-brand-primary text-white' : 'bg-white/5 text-white/40 hover:text-white'}`}
                >
                  <Info size={20} />
                </button>
                <button className="p-3 rounded-xl bg-white/5 text-white/40 hover:text-white transition-all">
                  <MoreVertical size={20} />
                </button>
              </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
              {/* Messages Area */}
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar scroll-smooth">
                  {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full opacity-10 blur-[0.5px]">
                      <MessageCircle size={120} className="text-white mb-6" />
                      <h2 className="text-4xl font-black text-white">بداية المحادثة</h2>
                    </div>
                  ) : (
                    messages.map((msg, idx) => {
                      const isMe = msg.sender === 'me';
                      return (
                        <div key={msg.id || idx} className={`flex w-full ${isMe ? 'justify-start' : 'justify-end'}`}>
                          <div className={`chat-message-bubble ${isMe ? 'chat-message-me shadow-brand-primary/20' : 'chat-message-them shadow-black/20'}`}>
                            {msg.type === 'text' ? (
                              <p className="font-medium">{msg.text}</p>
                            ) : msg.type === 'image' ? (
                              <div className="space-y-2">
                                <img src={msg.url} alt="Shared" className="rounded-xl max-w-full border border-white/10 shadow-2xl" />
                                {msg.text && <p className="text-sm opacity-90">{msg.text}</p>}
                              </div>
                            ) : null}
                            <div className={`flex items-center gap-1.5 mt-2 text-[10px] font-bold ${isMe ? 'justify-start text-white/60' : 'justify-end text-white/30'}`}>
                              {msg.time ? new Date(msg.time).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) : ''}
                              {isMe && <CheckCheck size={14} className="text-white/80" />}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input Area - Premium Glow */}
                <div className="p-6 px-10">
                  <div className="flex items-center gap-4 bg-white/5 backdrop-blur-3xl rounded-[24px] p-3 border border-white/5 chat-input-glow transition-all">
                    <div className="flex gap-1 px-2">
                      <button className="p-2.5 text-white/20 hover:text-brand-primary transition-all rounded-xl hover:bg-white/5" onClick={() => setShowEmojiPicker(!showEmojiPicker)}>
                        <Smile size={24} />
                      </button>
                      <button className="p-2.5 text-white/20 hover:text-brand-primary transition-all rounded-xl hover:bg-white/5">
                        <Paperclip size={24} />
                      </button>
                    </div>
                    
                    <input 
                      type="text" 
                      placeholder="اكتب رسالتك الذكية هنا..."
                      className="flex-1 bg-transparent border-none text-white outline-none px-2 font-medium text-[15px] placeholder:text-white/10"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                    />

                    <button 
                      onClick={handleSend}
                      disabled={!message.trim() || isSending}
                      className={`p-4 rounded-2xl transition-all flex items-center justify-center shadow-2xl ${
                        !message.trim() || isSending 
                          ? 'bg-white/5 text-white/10' 
                          : 'bg-gradient-to-r from-brand-primary to-brand-secondary text-white hover:scale-105 active:scale-95'
                      }`}
                    >
                      {isSending ? <RefreshCw size={22} className="animate-spin" /> : <Send size={22} />}
                    </button>
                  </div>
                  
                  {showEmojiPicker && (
                    <div className="absolute bottom-28 right-10 z-50 animate-fade-in-up">
                      <Picker 
                        data={async () => (await import('@emoji-mart/data')).default} 
                        onEmojiSelect={(emoji) => setMessage(prev => prev + emoji.native)}
                        theme="dark"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Side Details - Optional Panel */}
              {showDetails && (
                <div className="w-80 border-r border-white/5 bg-black/20 backdrop-blur-3xl animate-slide-left p-8 space-y-8 flex flex-col">
                  <div className="text-center">
                    <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-brand-primary to-brand-secondary mx-auto mb-4 flex items-center justify-center text-4xl font-black text-white shadow-2xl">
                      {selectedChat.name?.substring(0, 1)}
                    </div>
                    <h4 className="text-xl font-black text-white">{selectedChat.name}</h4>
                    <p className="text-sm text-brand-primary/60 font-medium">طالب مسجل</p>
                  </div>

                  <div className="space-y-4">
                    <h5 className="text-[10px] font-black text-white/20 uppercase tracking-widest">معلومات التواصل</h5>
                    <div className="bg-white/5 rounded-2xl p-4 border border-white/5 space-y-3">
                      <div className="flex items-center gap-3">
                        <Phone size={16} className="text-brand-primary" />
                        <span className="text-xs text-white/80 font-bold">{selectedChat.phone}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <Hash size={16} className="text-brand-secondary" />
                        <span className="text-[10px] text-white/40">ID: {selectedChat.id}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col justify-end">
                    <div className="bg-brand-primary/5 rounded-2xl p-4 border border-brand-primary/10">
                      <p className="text-[10px] text-brand-primary font-black leading-relaxed">
                        نظام الدردشة محمي بتشفير طرف إلى طرف لضمان خصوصية بيانات الطلاب.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-20 animate-fade-in">
            <div className="w-32 h-32 rounded-[40px] bg-gradient-to-br from-brand-primary/10 to-brand-secondary/10 border border-white/5 flex items-center justify-center mb-10 shadow-inner">
              <MessageCircle size={64} className="text-brand-primary opacity-50" />
            </div>
            <h2 className="text-5xl font-black text-white mb-6">مرحباً بك مجدداً</h2>
            <p className="text-white/30 max-w-md text-lg leading-relaxed mb-10 font-bold">
              لوحة إدارة المحادثات المتكاملة لنظام دبلومالاين. اختر طالباً من القائمة الجانبية لإدارة الطلب.
            </p>
            <div className="flex gap-6">
              {[
                { icon: <Shield />, text: 'تشفير كامل' },
                { icon: <Clock />, text: 'استجابة فورية' },
                { icon: <CheckCheck />, text: 'تأكيد القراءة' }
              ].map((m, i) => (
                <div key={i} className="flex flex-col items-center gap-3">
                  <div className="p-4 rounded-2xl bg-white/5 text-brand-primary border border-white/5 shadow-xl">{m.icon}</div>
                  <span className="text-[10px] font-black text-white/20 uppercase tracking-tighter">{m.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
