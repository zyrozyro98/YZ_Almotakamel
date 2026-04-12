import React, { useState, useRef, useEffect } from 'react';
import { Search, MoreVertical, Phone, Video, Smile, Paperclip, Mic, Send, Image as ImageIcon, FileText, Square, ShoppingCart, PlusCircle, X, UserPlus, Edit, CheckCircle, AlertTriangle, UploadCloud, ArrowRight, MessageCircle, QrCode, RefreshCw, User } from 'lucide-react';
import axios from 'axios';
import EmojiPicker from 'emoji-picker-react';
import { db, rtdb, auth } from '../firebase';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { ref, onValue, push, set, serverTimestamp as rtdbTimestamp } from 'firebase/database';

export default function WhatsAppChat() {
  const [selectedChat, setSelectedChat] = useState(null);
  const employeeId = auth.currentUser?.email?.split('@')[0].replace(/[^a-zA-Z0-9]/g, '') || 'emp1';
  const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

  const [message, setMessage] = useState('');
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [qrCode, setQrCode] = useState(null);
  const [waStatus, setWaStatus] = useState('checking'); // 'checking', 'connected', 'qr_needed', 'error'

  // Order modal states
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [orderType, setOrderType] = useState('add_student');
  const [universities, setUniversities] = useState([]);
  const [majors, setMajors] = useState([]);
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [isSelectReceiptMode, setIsSelectReceiptMode] = useState(false);
  const [lastBatchNum, setLastBatchNum] = useState(localStorage.getItem('lastBatchNum') || '');
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  const [students, setStudents] = useState([]);

  const [activeChats, setActiveChats] = useState([]); // From RTDB
  const [mergedChats, setMergedChats] = useState([]);
  const [messages, setMessages] = useState([]);
  const [formData, setFormData] = useState({
    fullName: '',
    university: '',
    major: '',
    username: '',
    password: '',
    idNumber: ''
  });
  const [searchQuery, setSearchQuery] = useState('');
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (!employeeId || employeeId === 'emp1') return;

    // 1. Fetch Universities and Majors
    const unsubUniv = onSnapshot(collection(db, 'universities'), (snap) => {
      setUniversities(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubMaj = onSnapshot(collection(db, 'majors'), (snap) => {
      setMajors(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // 2. Fetch Students
    const unsubStudents = onSnapshot(collection(db, 'students'), (snap) => {
      setStudents(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // 3. Listen to Active Chats from RTDB
    const activeChatsRef = ref(rtdb, `chats/${employeeId}`);
    const unsubActiveChats = onValue(activeChatsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list = Object.entries(data).map(([id, val]) => ({
          phone: id,
          lastMessage: val.lastMessage,
          lastTimestamp: val.timestamp,
          unreadCount: val.unreadCount || 0
        }));
        setActiveChats(list);
      }
    });

    // 4. Listen to WhatsApp Connection Status
    const statusRef = ref(rtdb, `status/${employeeId}`);
    const unsubStatus = onValue(statusRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        if (data.isConnected) {
          setWaStatus('connected');
          setQrCode(null);
        } else if (data.qr) {
          setWaStatus('qr_needed');
          setQrCode(data.qr);
        } else {
          setWaStatus('checking');
        }
      }
    });

    // 5. Check Initial WhatsApp Status
    checkWhatsAppStatus();

    return () => { unsubUniv(); unsubMaj(); unsubStudents(); unsubActiveChats(); unsubStatus(); };
  }, [employeeId]);

  // Advanced Normalization for matching (last 9 digits)
  const getMatchKey = (phone) => {
    if (!phone) return '';
    const clean = phone.replace(/[^0-9]/g, '');
    return clean.slice(-9); // Match by last 9 digits to be country-code agnostic
  };

  // Merge Students and Active Chats
  useEffect(() => {
    const combined = [...activeChats];
    
    // Add students who aren't in active chats yet
    students.forEach(student => {
      const studentSfx = getMatchKey(student.phone);
      if (!studentSfx) return;

      const exists = combined.find(c => getMatchKey(c.phone) === studentSfx);
      if (exists) {
        exists.name = student.name;
        exists.isStudent = true;
        exists.id = student.id;
        exists.university = student.university;
        exists.major = student.major;
        exists.username = student.username;
        exists.password = student.password;
        exists.idNumber = student.idNumber;
      } else {
        combined.push({
          phone: student.phone.replace(/[^0-9]/g, ''),
          name: student.name,
          isStudent: true,
          id: student.id,
          university: student.university,
          major: student.major,
          username: student.username,
          password: student.password,
          idNumber: student.idNumber,
          lastTimestamp: 0
        });
      }
    });

    // Mark those only in activeChats as "New Customer"
    combined.forEach(c => {
      if (!c.name) {
        c.name = 'عميل جديد (واتساب)';
        c.isStudent = false;
        c.id = c.phone;
      }
    });

    // Sort by last activity (timestamp or 0)
    combined.sort((a, b) => (b.lastTimestamp || 0) - (a.lastTimestamp || 0));
    setMergedChats(combined);
  }, [students, activeChats]);

  const filteredChats = mergedChats.filter(c => 
    c.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    c.phone?.includes(searchQuery) ||
    c.university?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.major?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const checkWhatsAppStatus = async () => {
    try {
      const res = await axios.get(`${BASE_URL}/api/whatsapp/status/${employeeId}`);
      if (res.data.isConnected) {
        setWaStatus('connected');
      } else {
        initWhatsApp();
      }
    } catch (err) {
      setWaStatus('error');
    }
  };

  const initWhatsApp = async () => {
    setWaStatus('checking');
    try {
      const res = await axios.post(`${BASE_URL}/api/whatsapp/init`, { employeeId });
      // Status and QR handled by the RTDB listener now
    } catch (err) {
      setWaStatus('error');
    }
  };

  const maskPhone = (phone) => {
    if (!phone) return '***';
    const p = phone.replace(/[^0-9]/g, '');
    if (p.length < 7) return '******';
    return `${p.slice(0, 3)}****${p.slice(-3)}`;
  };

  // Audio Recording Logic
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const handleSend = async () => {
    if (message.trim() && selectedChat) {
      setIsSending(true);
      const phone = selectedChat.phone.replace(/[^0-9]/g, '');
      const textToSend = message;

      try {
        await axios.post(`${BASE_URL}/api/whatsapp/send`, {
          employeeId: employeeId,
          phoneNumber: phone,
          message: textToSend
        }, { timeout: 15000 });

        setMessage('');
        setShowEmojiPicker(false);
      } catch (err) {
        console.error('[SEND ERROR]', err);
        const errorMsg = err.response?.data?.error || 'حدث تأخير بسيط في الرد، غالباً تم الإرسال بنجاح. يرجى التحقق من قائمة الدردشة.';
        alert(`تنبيه: ${errorMsg}`);
      } finally {
        setIsSending(false);
      }
    }
  };

  const onEmojiClick = (emojiObject) => {
    setMessage(prev => prev + emojiObject.emoji);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Audio = reader.result;
          const phone = selectedChat.phone.replace(/[^0-9]/g, '');
          try {
            await axios.post(`${BASE_URL}/api/whatsapp/send-audio`, {
              employeeId,
              phoneNumber: phone,
              base64Audio
            });
          } catch (err) {
            console.error('Audio send failed', err);
          }
        };
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Microphone access error', err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  // 4. Real-time Messages for Selected Chat
  useEffect(() => {
    if (!selectedChat) {
      setMessages([]);
      return;
    }

    const chatId = selectedChat.phone.replace(/[^0-9]/g, '').slice(-9);
    const messagesRef = ref(rtdb, `chats/${employeeId}/${chatId}/messages`);
    
    const unsubRtdb = onValue(messagesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const msgList = Object.entries(data).map(([id, val]) => ({
          id,
          ...val,
          time: val.time ? new Date(val.time).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) : ''
        }));
        setMessages(msgList);
      } else {
        setMessages([]);
      }
    });

    return () => unsubRtdb();
  }, [selectedChat, employeeId]);


  return (
    <>
    <div className="glass-panel animate-fade-in-up whatsapp-chat-container" style={{
      display: 'flex', overflow: 'hidden', padding: 0, height: 'calc(100vh - var(--header-height) - 4rem)', minHeight: '500px'
    }}>

      {/* Sidebar (Merged Chat List) */}
      <div className={`chat-list ${selectedChat ? 'hide-on-mobile-chat' : 'mobile-w-full'}`} style={{ width: '380px', borderLeft: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', background: 'rgba(15, 23, 42, 0.4)' }}>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '1.25rem' }}>المحادثات النشطة</h3>
          <button className="btn-secondary" style={{ padding: '0.4rem', borderRadius: '10px' }}>
            <MoreVertical size={20} />
          </button>
        </div>

        <div style={{ padding: '1rem' }}>
          <div style={{ position: 'relative' }}>
            <Search size={18} color="var(--text-secondary)" style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              className="input-base"
              placeholder="البحث بالاسم أو الرقم..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingRight: '2.8rem', borderRadius: '14px', background: 'rgba(255,255,255,0.03)' }}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
          {filteredChats.map(chat => (
            <div
              key={chat.id}
              onClick={() => {
                setSelectedChat(chat);
                setFormData({
                  fullName: chat.name || '',
                  university: chat.university || '',
                  major: chat.major || '',
                  username: chat.username || '',
                  password: chat.password || '',
                  idNumber: chat.idNumber || ''
                });
              }}
              className={`group relative p-4 rounded-2xl cursor-pointer transition-all duration-300 border ${
                selectedChat?.id === chat.id 
                ? 'bg-blue-500/10 border-blue-500/30' 
                : 'bg-white/5 border-transparent hover:bg-white/10'
              }`}
            >
              <div className="flex gap-4">
                <div className={`relative w-14 h-14 rounded-2xl flex-shrink-0 flex items-center justify-center font-bold text-white text-xl shadow-lg ${
                  chat.isStudent ? 'bg-gradient-to-br from-blue-600 to-indigo-600' : 'bg-slate-700'
                }`}>
                  {chat.isStudent ? chat.name?.charAt(0) : <User size={24} />}
                  <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-slate-900 ${waStatus === 'connected' ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start mb-1">
                    <h4 className="font-bold text-white truncate text-[1.05rem]">{chat.name}</h4>
                    <span className="text-[0.7rem] text-slate-400 font-medium">{maskPhone(chat.phone)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <p className="text-sm text-slate-400 truncate max-w-[150px]">
                      {chat.isStudent ? `${chat.university} | ${chat.major}` : 'عميل غير مسجل بعد'}
                    </p>
                    {(!chat.isStudent || !chat.lastTimestamp) && (
                      <span className="px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 text-[0.6rem] font-bold border border-orange-500/20">جديد</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
          {filteredChats.length === 0 && (
            <div className="text-center py-10 opacity-40">
              <Search size={40} className="mx-auto mb-3" />
              <p>لا توجد نتائج مطابقة</p>
            </div>
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      {selectedChat ? (
        <div className={`chat-area ${selectedChat ? 'mobile-w-full' : 'hide-on-mobile-chat'}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'transparent' }}>
          {/* Main Chat Header */}
          <div style={{
            padding: '1rem 1.5rem', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(15, 23, 42, 0.5)'
          }}>
            <div className="flex items-center gap-4">
              <button 
                className="show-on-mobile btn-secondary" 
                onClick={() => setSelectedChat(null)}
                style={{ padding: '0.5rem', borderRadius: '10px' }}
              >
                <ArrowRight size={22} />
              </button>
              <div style={{ 
                width: '46px', height: '46px', borderRadius: '14px', 
                background: 'var(--brand-primary)', display: 'flex', 
                alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#fff' 
              }}>
                {selectedChat.name?.charAt(0)}
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>{selectedChat.name}</h4>
                <div className="flex items-center gap-2">
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: waStatus === 'connected' ? 'var(--success)' : 'var(--danger)' }}></span>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {maskPhone(selectedChat.phone)}
                  </p>
                </div>
              </div>
            </div>
            <div className="hide-on-mobile flex items-center gap-5" style={{ color: 'var(--text-secondary)' }}>
              {waStatus === 'qr_needed' && (
                <button className="btn-primary" onClick={() => initWhatsApp()} style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}>
                  <QrCode size={16} /> تحديث QR
                </button>
              )}
              <button className="btn-secondary" style={{ padding: '0.5rem', borderRadius: '10px' }}><MoreVertical size={20} /></button>
            </div>
          </div>

          {/* Banner Logic */}
          {isSelectReceiptMode && (
            <div className="animate-fade-in-up" style={{
              background: 'rgba(16, 185, 129, 0.15)', borderBottom: '1px solid rgba(16, 185, 129, 0.3)',
              padding: '0.8rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              color: 'var(--success)'
            }}>
              <div className="flex items-center gap-3">
                <CheckCircle size={20} />
                <span style={{ fontWeight: 600 }}>وضع تحديد الإيصال: اختر أي ملف من الدردشة لتفعيله.</span>
              </div>
              <button className="btn-primary" style={{ padding: '0.4rem 1.2rem', fontSize: '0.85rem' }} onClick={() => { setIsSelectReceiptMode(false); setOrderType('transfer'); setOrderModalOpen(true); }}>تراجع</button>
            </div>
          )}

          {/* Create Order Top Bar */}
          {!isSelectReceiptMode && (
            <div style={{
              padding: '0.75rem 1.5rem', background: 'rgba(59, 130, 246, 0.05)', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div className="flex items-center gap-3">
                <ShoppingCart size={18} color="var(--brand-secondary)" />
                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)' }}>إدارة طلب الطالب</span>
              </div>
              <button className="btn-primary" style={{ padding: '0.5rem 1.25rem', fontSize: '0.85rem' }} onClick={() => setOrderModalOpen(true)}>
                <PlusCircle size={16} />
                إجراء عملية طلب
              </button>
            </div>
          )}

          {/* Messages Area */}
          <div style={{ 
            flex: 1, padding: '2rem', overflowY: 'auto', 
            backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.03) 1px, transparent 0)',
            backgroundSize: '30px 30px',
            backgroundColor: 'rgba(15, 23, 42, 0.2)'
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {waStatus === 'qr_needed' && qrCode && (
                <div className="glass-panel animate-fade-in-up" style={{ textAlign: 'center', padding: '3rem', margin: '2rem auto', maxWidth: '500px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}>
                  <div style={{ marginBottom: '1.5rem', color: 'var(--brand-secondary)' }}><QrCode size={48} /></div>
                  <h3 style={{ marginBottom: '0.5rem', fontSize: '1.5rem', fontWeight: 800 }}>اربط واتساب الخاص بك</h3>
                  <p style={{ marginBottom: '2rem', color: 'var(--text-secondary)' }}>قم بمسح الرمز أدناه باستخدام تطبيق واتساب على هاتفك لتفعيل نظام الدردشة الموحد.</p>
                  <div style={{ background: '#fff', padding: '1.5rem', display: 'inline-block', borderRadius: '24px', boxShadow: '0 0 30px rgba(59, 130, 246, 0.3)', marginBottom: '2rem' }}>
                     <img src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(qrCode)}&size=240x240`} alt="WA QR" style={{ display: 'block' }} />
                  </div>
                  <div className="flex-col gap-3" style={{ textAlign: 'right', fontSize: '0.9rem', color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.1)', padding: '1rem', borderRadius: '15px' }}>
                    <p style={{ margin: 0 }}>1. افتح تطبيق واتساب على هاتفك</p>
                    <p style={{ margin: 0 }}>2. اضغط على <b>الأجهزة المرتبطة</b></p>
                    <p style={{ margin: 0 }}>3. اضغط على <b>ربط جهاز</b> ووجه الكاميرا لهذا الرمز</p>
                  </div>
                  <button className="btn-secondary" onClick={() => initWhatsApp()} style={{ marginTop: '1.5rem', padding: '0.75rem 2rem' }}><RefreshCw size={18} /> تحديث الرمز</button>
                </div>
              )}

              {messages.length === 0 && waStatus === 'connected' && (
                <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
                  <MessageCircle size={48} style={{ opacity: 0.2, margin: '0 auto 1rem' }} />
                  <p>لا توجد رسائل سابقة. ابدأ المحادثة الآن!</p>
                </div>
              )}

              {messages.map((msg, index) => (
                <div key={msg.id || index} style={{ alignSelf: msg.sender === 'me' ? 'flex-start' : 'flex-end', maxWidth: '80%', position: 'relative' }}>
                  <div className="glass-panel" style={{
                    background: msg.sender === 'me' ? 'linear-gradient(135deg, var(--brand-primary), var(--brand-secondary))' : 'rgba(30, 41, 59, 0.95)',
                    color: '#fff', padding: msg.type === 'image' ? '0.25rem' : '0.9rem 1.25rem', 
                    borderRadius: msg.sender === 'me' ? '0 20px 20px 20px' : '20px 0 20px 20px',
                    borderColor: 'transparent', boxShadow: '0 4px 15px rgba(0,0,0,0.15)', position: 'relative'
                  }}>
                    {msg.sender === 'me' && (
                       <div style={{ position: 'absolute', top: 0, right: '-8px', width: 0, height: 0, borderTop: '10px solid var(--brand-primary)', borderRight: '10px solid transparent' }}></div>
                    )}
                    {msg.sender === 'them' && (
                       <div style={{ position: 'absolute', top: 0, left: '-8px', width: 0, height: 0, borderTop: '10px solid rgba(30, 41, 59, 0.95)', borderLeft: '10px solid transparent' }}></div>
                    )}
                    
                    {msg.type === 'text' && (
                      <p style={{ margin: 0, color: '#fff', fontSize: '0.98rem', fontWeight: 500, lineHeight: 1.6 }}>{msg.text}</p>
                    )}
                    {msg.type === 'audio' && <audio controls src={msg.url} style={{ height: '36px', minWidth: '220px' }} />}
                    {msg.type === 'image' && (
                      <div style={{ position: 'relative', borderRadius: '15px', overflow: 'hidden' }}>
                        <img src={msg.url} alt="attachment" style={{ maxWidth: '100%', maxHeight: '400px', display: 'block' }} />
                      </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px', marginTop: '4px', opacity: 0.7 }}>
                      <span style={{ fontSize: '0.65rem' }}>{msg.time}</span>
                      {msg.sender === 'me' && <CheckCircle size={10} />}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Input Area */}
          <div style={{ padding: '1.25rem 1.5rem', borderTop: '1px solid var(--glass-border)', background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', gap: '1rem', position: 'relative' }}>
            <Smile size={24} className="hide-on-mobile" color={showEmojiPicker ? "var(--brand-secondary)" : "var(--text-secondary)"} style={{ cursor: 'pointer' }} onClick={() => setShowEmojiPicker(!showEmojiPicker)} />
            <Paperclip size={24} color={showAttachMenu ? "var(--brand-secondary)" : "var(--text-secondary)"} style={{ cursor: 'pointer' }} onClick={() => setShowAttachMenu(!showAttachMenu)} />

            {showEmojiPicker && (
              <div style={{ position: 'absolute', bottom: '100%', right: '20px', zIndex: 1000 }}>
                <EmojiPicker onEmojiClick={onEmojiClick} theme="dark" />
              </div>
            )}

            {isRecording ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '1rem', background: 'rgba(239, 68, 68, 0.1)', padding: '0.75rem 1.5rem', borderRadius: '999px', color: 'var(--danger)', fontWeight: 600 }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--danger)', animation: 'pulse 1s infinite' }}></div>
                جاري تسجيل الصوت...
              </div>
            ) : (
              <input
                type="text" className="input-base" placeholder="اكتب رسالة هنا..." value={message} disabled={isSending}
                onChange={e => setMessage(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend()}
                style={{ flex: 1, borderRadius: '999px', background: 'rgba(255,255,255,0.05)', padding: '0.8rem 1.5rem' }}
              />
            )}

            {message.trim() && !isRecording ? (
              <button onClick={handleSend} disabled={isSending} style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--brand-primary)', color: '#fff' }}>
                <Send size={22} style={{ transform: 'rotate(180deg)' }} />
              </button>
            ) : (
              <button onMouseDown={startRecording} onMouseUp={stopRecording} onMouseLeave={stopRecording} style={{ width: '48px', height: '48px', borderRadius: '50%', background: isRecording ? 'var(--danger)' : 'rgba(255,255,255,0.05)', color: isRecording ? '#fff' : 'var(--text-secondary)' }}>
                {isRecording ? <Square size={18} /> : <Mic size={22} />}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="chat-area hide-on-mobile-chat" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: 'var(--text-secondary)', background: 'rgba(15, 23, 42, 0.2)' }}>
          <div style={{ 
            width: '180px', height: '180px', borderRadius: '40px', background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1), transparent)', 
            display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '2.5rem', border: '1px solid var(--glass-border)'
          }}>
            <MessageCircle size={80} style={{ opacity: 0.2, color: 'var(--brand-primary)' }} />
          </div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-primary)' }}>دبلومالاين للدردشة</h2>
          <p style={{ fontSize: '1.1rem' }}>قم باختيار محادثة من القائمة الجانبية للبدء</p>
        </div>
      )}
    </div>

    {/* Order Modal */}
    {orderModalOpen && selectedChat && (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)', padding: '1rem' }}>
        <div className="glass-panel animate-fade-in-up" style={{ width: '700px', maxWidth: '100%', maxHeight: '90vh', overflow: 'hidden', borderRadius: '30px', background: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '2rem', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>إدارة طلب: <span style={{ color: 'var(--brand-secondary)' }}>{selectedChat.name}</span></h3>
            <button className="btn-secondary" style={{ padding: '0.5rem', borderRadius: '12px' }} onClick={() => setOrderModalOpen(false)}><X size={24} /></button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '2rem' }}>
            {/* Nav Tabs */}
            <div className="flex gap-2" style={{ marginBottom: '2rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
              {[
                { id: 'add_student', label: 'إضافة طالب', icon: <UserPlus size={18} /> },
                { id: 'edit_details', label: 'تعديل بيانات', icon: <Edit size={18} /> },
                { id: 'transfer', label: 'تأكيد تحويل', icon: <CheckCircle size={18} /> },
                { id: 'withdraw', label: 'انسحاب', icon: <AlertTriangle size={18} /> },
              ].map(tab => (
                <button key={tab.id} onClick={() => setOrderType(tab.id)} className={orderType === tab.id ? 'btn-primary' : 'btn-secondary'} style={{ padding: '0.7rem 1.25rem', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>

            <div className="animate-fade-in-up flex-col gap-6">
              {orderType === 'add_student' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="input-label">الاسم الكامل للطالب</label>
                      <input 
                        type="text" 
                        className="input-base" 
                        placeholder="أدخل الاسم الرباعي" 
                        value={formData.fullName}
                        onChange={(e) => setFormData({...formData, fullName: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="input-label">رقم الدفعة <span style={{ color: 'var(--danger)' }}>*</span></label>
                      <input 
                        type="text" 
                        className="input-base" 
                        placeholder="مثل: 2024-1" 
                        value={lastBatchNum} 
                        onChange={(e) => { setLastBatchNum(e.target.value); localStorage.setItem('lastBatchNum', e.target.value); }} 
                        required 
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="input-label">اسم المستخدم (اليوزر)</label>
                      <input 
                        type="text" 
                        className="input-base" 
                        placeholder="Username" 
                        value={formData.username}
                        onChange={(e) => setFormData({...formData, username: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="input-label">كلمة المرور</label>
                      <input 
                        type="password" 
                        className="input-base" 
                        placeholder="Password" 
                        value={formData.password}
                        onChange={(e) => setFormData({...formData, password: e.target.value})}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="input-label">الجامعة</label>
                      <select 
                        className="input-base"
                        value={formData.university}
                        onChange={(e) => setFormData({...formData, university: e.target.value})}
                      >
                        <option value="">اختر الجامعة...</option>
                        {universities.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="input-label">التخصص</label>
                      <select 
                        className="input-base"
                        value={formData.major}
                        onChange={(e) => setFormData({...formData, major: e.target.value})}
                      >
                        <option value="">اختر التخصص...</option>
                        {majors.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="input-label">رقم الهوية / الجواز (اختياري)</label>
                    <input 
                      type="text" 
                      className="input-base" 
                      placeholder="أدخل رقم الهوية" 
                      value={formData.idNumber}
                      onChange={(e) => setFormData({...formData, idNumber: e.target.value})}
                    />
                  </div>
                  <input type="hidden" value={selectedChat.phone} />
                </>
              )}

              {orderType === 'edit_details' && (
                <div className="flex-col gap-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="input-label">تعديل اسم الطالب</label>
                      <input 
                        type="text" 
                        className="input-base" 
                        value={formData.fullName}
                        onChange={(e) => setFormData({...formData, fullName: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="input-label">رقم الهاتف (لا يمكن تعديله)</label>
                      <input type="text" className="input-base opacity-60" value={maskPhone(selectedChat.phone)} readOnly />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="input-label">الجامعة المحددة</label>
                      <select 
                        className="input-base"
                        value={formData.university}
                        onChange={(e) => setFormData({...formData, university: e.target.value})}
                      >
                        <option value="">اختر الجامعة...</option>
                        {universities.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="input-label">التخصص المحدد</label>
                      <select 
                        className="input-base"
                        value={formData.major}
                        onChange={(e) => setFormData({...formData, major: e.target.value})}
                      >
                        <option value="">اختر التخصص...</option>
                        {majors.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="input-label">اسم المستخدم</label>
                      <input 
                        type="text" 
                        className="input-base" 
                        value={formData.username}
                        onChange={(e) => setFormData({...formData, username: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="input-label">كلمة المرور</label>
                      <input 
                        type="text" 
                        className="input-base" 
                        value={formData.password}
                        onChange={(e) => setFormData({...formData, password: e.target.value})}
                      />
                    </div>
                  </div>
                </div>
              )}

              {orderType === 'transfer' && (
                <div className="flex-col gap-6">
                  <div className="badge badge-info" style={{ padding: '1rem', borderRadius: '15px', display: 'block', lineHeight: 1.6 }}>
                    الرجاء اختيار صورة التحويل البنكي أو الإيصال من قائمة المرفقات أدناه لربطها بملف الطالب بشكل تلقائي.
                  </div>
                  <div>
                    <label className="input-label">المرفقات المتاحة في الدردشة</label>
                    <div className="flex gap-3" style={{ overflowX: 'auto', padding: '0.5rem 0' }}>
                      {messages.filter(m => m.type === 'image').map(m => (
                        <div key={m.id} onClick={() => setSelectedReceipt(m.id)}
                          style={{ width: '120px', height: '120px', borderRadius: '15px', overflow: 'hidden', border: `3px solid ${selectedReceipt === m.id ? 'var(--brand-primary)' : 'transparent'}`, cursor: 'pointer', flexShrink: 0, position: 'relative' }}
                        >
                          <img src={m.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          {selectedReceipt === m.id && <div style={{ position: 'absolute', inset: 0, background: 'rgba(59, 130, 246, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CheckCircle color="#fff" size={30} /></div>}
                        </div>
                      ))}
                      {messages.filter(m => m.type === 'image').length === 0 && <div style={{ width: '100%', padding: '2rem', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '15px', color: 'var(--text-secondary)', border: '1px dashed var(--glass-border)' }}>لا توجد صور مرفقة في هذه الدردشة حتى الآن.</div>}
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button className="btn-secondary flex-1" style={{ padding: '1rem' }} onClick={() => { setOrderModalOpen(false); setIsSelectReceiptMode(true); }}><Search size={20} /> اختيار من الدردشة المكبرة</button>
                    <button className="btn-secondary flex-1" style={{ padding: '1rem', border: '1px solid var(--brand-secondary)', color: 'var(--brand-secondary)' }} onClick={() => { const text = window.prompt('أدخل تفاصيل الإيصال النصي:'); if(text) alert('تم إضافة الإيصال النصي بنجاح.'); }}><FileText size={20} /> إضافة إيصال نصي</button>
                  </div>
                </div>
              )}

              {orderType === 'withdraw' && (
                <div className="flex-col gap-6">
                  <div className="badge" style={{ background: 'rgba(244, 63, 94, 0.1)', color: 'var(--danger)', padding: '1rem', borderRadius: '15px' }}><strong>تنبيه:</strong> القيام بهذه العملية سيغير حالة الطالب إلى "إنسحاب". يرجى ذكر السبب بدقة للمراجعة من قبل الإدارة.</div>
                  <div><label className="input-label">سبب الإنسحاب الأساسي</label><select className="input-base"><option value="">اختر السبب...</option><option>عدم موافقة جهة العمل</option><option>لا يرد</option><option>مشترك مع آخر</option><option>سوء الخدمة</option><option>أخرى</option></select></div>
                  <div><label className="input-label">تفاصيل إضافية</label><textarea className="input-base" rows="3" placeholder="أي تفاصيل أخرى..." style={{ resize: 'none' }}></textarea></div>
                </div>
              )}
            </div>
          </div>
          <div style={{ padding: '1.5rem 2rem', borderTop: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'flex-end', gap: '1rem', background: 'rgba(0,0,0,0.1)' }}>
            <button className="btn-secondary" style={{ padding: '0.8rem 2rem' }} onClick={() => setOrderModalOpen(false)}>إلغاء</button>
            <button 
              className="btn-primary" 
              style={{ padding: '0.8rem 3rem' }} 
              onClick={async () => {
                try {
                  const payload = {
                    studentData: {
                      phone: selectedChat.phone.replace(/[^0-9]/g, ''),
                      name: formData.fullName,
                      university: formData.university,
                      major: formData.major,
                      username: formData.username,
                      password: formData.password,
                      idNumber: formData.idNumber,
                      batch: lastBatchNum,
                      orderType: orderType,
                      lastUpdatedBy: employeeId
                    }
                  };
                  await axios.post(`${BASE_URL}/api/orders/save-student`, payload);
                  setOrderModalOpen(false);
                  alert('تم حفظ البيانات بنجاح وتحديث ملف الطالب!');
                } catch (err) {
                  alert('حدث خطأ أثناء الحفظ.');
                }
              }}
            >
              حفظ وتأكيد الطلب
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
