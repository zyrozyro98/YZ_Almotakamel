import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import {
  MessageCircle, Search, Send, User, CheckCheck, RefreshCw,
  Info, AlertCircle, Smile, ArrowRight, MessageSquare, GraduationCap, School,
  UserPlus, UserCog, Receipt, UserMinus, Zap, X, Save, FileText, ClipboardList,
  Eye, EyeOff, ShieldCheck, Key, Paperclip, Image as ImageIcon
} from 'lucide-react';
import axios from 'axios';
import { auth, rtdb, db } from '../firebase';
import { ref, onValue } from 'firebase/database';
import { collection, onSnapshot, addDoc, updateDoc, doc, getDocs, query, where, Timestamp } from 'firebase/firestore';
import Picker from '@emoji-mart/react';

export default function WhatsAppChat() {
  const [employeeId, setEmployeeId] = useState('emp1');
  const [selectedChat, setSelectedChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [activeChats, setActiveChats] = useState([]);
  const [students, setStudents] = useState([]);
  const [universities, setUniversities] = useState([]);
  const [majors, setMajors] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [message, setMessage] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [viewingEmployeeId, setViewingEmployeeId] = useState(null);
  const [isSending, setIsSending] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const messagesEndRef = useRef(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [view, setView] = useState('list');
  const [sidebarTab, setSidebarTab] = useState('chats'); // 'chats' or 'directory'

  // Modals State
  const [activeModal, setActiveModal] = useState(null); // 'add', 'edit', 'receipt', 'withdraw'
  const [formData, setFormData] = useState({});
  const [showUser, setShowUser] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [isSelectingMessage, setIsSelectingMessage] = useState(false); 
  const [attachment, setAttachment] = useState(null); // Current selected file
  const fileInputRef = useRef(null);

  const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const unsubAuth = auth.onAuthStateChanged(user => {
      if (user) {
        setEmployeeId(user.uid);
        const adminStatus = user.email === 'yazans95@gmail.com' || user.email === 'zyrozyro98@gmail.com';
        setIsAdmin(adminStatus);
        if (!viewingEmployeeId) setViewingEmployeeId(user.uid);
      } else {
        setEmployeeId('emp1');
        setIsAdmin(false);
      }
    });
    return () => unsubAuth();
  }, [viewingEmployeeId]);

  // Fetch all employees if admin
  useEffect(() => {
    if (!isAdmin) return;
    const unsub = onSnapshot(collection(db, 'employees'), (snap) => {
      const emps = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setEmployees(emps);
      
      // If we are an admin and viewing ourselves, auto-pick the first real employee if available
      if (viewingEmployeeId === employeeId && emps.length > 0) {
        const firstOther = emps.find(e => e.id !== employeeId);
        if (firstOther) setViewingEmployeeId(firstOther.id);
      }
    });
    return () => unsub();
  }, [isAdmin, employeeId, viewingEmployeeId]);

  useEffect(() => {
    if (!employeeId || employeeId === 'emp1') return;

    // Listen to Students
    const unsubStudents = onSnapshot(collection(db, 'students'), (snap) => {
      setStudents(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // Listen to Universities for dropdowns
    const unsubUnivs = onSnapshot(collection(db, 'universities'), (snap) => {
      setUniversities(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // Listen to Global Majors
    const unsubMajors = onSnapshot(collection(db, 'majors'), (snap) => {
      setMajors(snap.docs.map(doc => doc.data().name || doc.data().label).filter(Boolean));
    });

    // Listen to Active Chats from RTDB for the CURRENT VIEWING EMPLOYEE
    const targetId = isAdmin ? viewingEmployeeId : employeeId;
    if (!targetId) return;

    const activeRef = ref(rtdb, `chats/${targetId}`);
    const unsubActive = onValue(activeRef, (snapshot) => {
      const data = snapshot.val();
      if (data) setActiveChats(Object.entries(data).map(([id, val]) => ({ phone: id, ...val })));
      else setActiveChats([]);
    });

    return () => { unsubStudents(); unsubActive(); unsubUnivs(); unsubMajors(); };
  }, [employeeId, viewingEmployeeId, isAdmin]);

  useEffect(() => {
    if (!selectedChat || !employeeId) return;
    const targetId = isAdmin ? viewingEmployeeId : employeeId;
    const cleanId = String(selectedChat.phone).replace(/[^0-9]/g, '').slice(-9);
    const messagesRef = ref(rtdb, `chats/${targetId}/${cleanId}/messages`);
    const unsubMsg = onValue(messagesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list = Object.entries(data).map(([id, val]) => ({ id, ...val }));
        setMessages(list.sort((a, b) => (a.time || 0) - (b.time || 0)));
      } else setMessages([]);
    });
    return () => unsubMsg();
  }, [selectedChat, employeeId, viewingEmployeeId, isAdmin]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [messages, selectedChat]);

  // Handle URL Selection (from Notification)
  const location = useLocation();
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const selectId = params.get('select');
    if (selectId && combinedList().length > 0) {
      const target = combinedList().find(c => getMatchKey(c.phone) === getMatchKey(selectId));
      if (target) {
        setSelectedChat(target);
        if (isMobile) setView('chat');
      }
    }
  }, [location.search, students, activeChats]);

  const formatMessageDate = (timestamp) => {
    const d = new Date(timestamp);
    const now = new Date();
    const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'اليوم';
    if (diffDays === 1) return 'أمس';
    if (diffDays < 7) return d.toLocaleDateString('ar-SA', { weekday: 'long' });
    return d.toLocaleDateString('ar-SA', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  const getMatchKey = (p) => String(p || '').replace(/[^0-9]/g, '').slice(-9);

  const combinedList = () => {
    const list = [...students];
    activeChats.forEach(chat => {
      const exists = students.find(s => getMatchKey(s.phone) === getMatchKey(chat.phone));
      if (!exists) {
        list.push({
          id: chat.phone,
          name: chat.name || `مجهول: ${chat.phone}`,
          phone: chat.phone,
          fullJid: chat.fullJid, // CARRY THE JID
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
        fullJid: active?.fullJid || item.fullJid, // ATTACH JID IF AVAILABLE
        lastMessage: active?.lastMessage || item.lastMessage || 'لا توجد رسائل',
        timestamp: active?.timestamp || item.timestamp || 0
      };
    }).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  };

  const filteredSidebar = combinedList().filter(item => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = item.name?.toLowerCase().includes(q) || item.phone?.includes(q) || item.university?.toLowerCase().includes(q);
    
    if (sidebarTab === 'chats') {
      return matchesSearch && item.timestamp > 0;
    } else {
      return matchesSearch && !item.isUnknown;
    }
  });

  const handleSend = async () => {
    if (!message.trim() || !selectedChat || isSending) return;
    const targetId = isAdmin ? viewingEmployeeId : employeeId;
    const textToSend = message; setMessage(''); setShowEmojiPicker(false); setIsSending(true);
    try {
      await axios.post(`${BASE_URL}/api/whatsapp/send`, {
        employeeId: targetId, 
        phoneNumber: selectedChat.phone.replace(/[^0-9]/g, ''), 
        message: textToSend,
        fullJid: selectedChat.fullJid,
        senderId: employeeId,
        senderName: auth.currentUser?.displayName || (isAdmin ? 'مدير' : 'موظف')
      });
    } catch (err) { console.error(err); } finally { setIsSending(false); }
  };

  // --- Modal Logic ---
  const openAddModal = () => {
    setFormData({
      name: selectedChat?.name?.includes('مجهول') ? '' : (selectedChat?.name || ''),
      phone: selectedChat?.phone || '',
      university: '', specialization: '', batch: '', platformUser: '', platformPass: '', idNumber: '', notes: ''
    });
    setActiveModal('add');
  };

  const openEditModal = () => {
    // Live Search in students list for match
    const student = students.find(s => getMatchKey(s.phone) === getMatchKey(selectedChat?.phone));
    
    if (!student) return alert('هذا الطالب غير مسجل في النظام حالياً. يرجى إضافته أولاً.');
    
    setFormData({ ...student });
    setActiveModal('edit');
  };

  const handleAddStudent = async (e) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'students'), {
        ...formData,
        createdAt: Timestamp.now(),
        createdBy: employeeId
      });
      alert('تم إضافة الطالب بنجاح');
      setActiveModal(null);
    } catch (err) { alert('خطأ في الإضافة: ' + err.message); }
  };

  const handleUpdateStudent = async (e) => {
    e.preventDefault();
    try {
      const studentRef = doc(db, 'students', selectedChat.id);
      const { id, createdAt, createdBy, phone, ...safeUpdate } = formData;
      await updateDoc(studentRef, safeUpdate);
      alert('تم تحديث البيانات بنجاح');
      setActiveModal(null);
    } catch (err) { alert('خطأ في التحديث'); }
  };

  const handleWithdrawalRequest = async (reason, details = '') => {
    try {
      await addDoc(collection(db, 'orders'), {
        studentId: selectedChat.id,
        studentName: selectedChat.name,
        type: 'withdrawal',
        reason,
        details,
        status: 'pending',
        createdAt: Timestamp.now()
      });
      alert('تم إرسال طلب الانسحاب للإدارة');
      setActiveModal(null);
    } catch (err) { alert('فشل إرسال الطلب'); }
  };

  const sendCredentialsToStudent = async () => {
    if (!selectedChat?.platformUser || !selectedChat?.platformPass) return alert('بيانات المنصة لهذا الطالب غير مكتملة.');
    if (!window.confirm(`هل أنت متأكد من إرسال بيانات المنصة للطالب ${selectedChat.name}؟`)) return;

    const msgText = `*مرحباً ${selectedChat.name}* 👋\n\nإليك بيانات الدخول الخاصة بك للمنصة التعليمية:\n\n👤 *اسم المستخدم:* ${selectedChat.platformUser}\n🔐 *كلمة المرور:* ${selectedChat.platformPass}\n\nيرجى الاحتفاظ بها وعدم مشاركتها مع أي شخص آخر. بالتوفيق! 🌸`;
    
    const targetId = isAdmin ? viewingEmployeeId : employeeId;
    try {
      await axios.post(`${BASE_URL}/api/whatsapp/send`, {
        employeeId: targetId, 
        phoneNumber: selectedChat.phone.replace(/[^0-9]/g, ''), 
        message: msgText,
        fullJid: selectedChat.fullJid,
        senderId: employeeId,
        senderName: auth.currentUser?.displayName || (isAdmin ? 'مدير' : 'موظف')
      });
      alert('تم إرسال البيانات للطالب بنجاح ✔️');
      setActiveModal(null);
    } catch (err) { alert('فشل الإرسال: تأكد من ربط واتساب الموظف المختار'); }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setAttachment({
        file,
        preview: event.target.result,
        type: file.type
      });
      setActiveModal('attachment');
    };
    reader.readAsDataURL(file);
  };

  const sendAttachment = async () => {
    if (!attachment || isSending) return;
    setIsSending(true);
    try {
      const isImage = attachment.type.startsWith('image/');
      const isVideo = attachment.type.startsWith('video/');
      
      let endpoint = '/api/whatsapp/send-document';
      let payloadKey = 'base64File';
      
      if (isImage) {
        endpoint = '/api/whatsapp/send-image';
        payloadKey = 'base64Image';
      } else if (isVideo) {
        endpoint = '/api/whatsapp/send-video';
        payloadKey = 'base64Video';
      }
      
      await axios.post(`${BASE_URL}${endpoint}`, {
        employeeId: isAdmin ? viewingEmployeeId : employeeId,
        phoneNumber: selectedChat.phone.replace(/[^0-9]/g, ''),
        fullJid: selectedChat.fullJid,
        [payloadKey]: attachment.preview,
        caption: formData.attachmentCaption || '',
        fileName: attachment.file.name,
        senderId: employeeId,
        senderName: auth.currentUser?.displayName || (isAdmin ? 'مدير' : 'موظف')
      });
      
      alert('تم إرسال المرفق بنجاح');
      setAttachment(null);
      setActiveModal(null);
    } catch (err) {
      alert('فشل إرسال المرفق: ' + (err.response?.data?.error || err.message));
    } finally {
      setIsSending(false);
    }
  };

  const handleReceiptSave = async (receiptData) => {
    try {
      await addDoc(collection(db, 'receipts'), {
        studentId: selectedChat.id || selectedChat.phone,
        studentName: selectedChat.name,
        ...receiptData,
        createdAt: Timestamp.now()
      });
      alert('تم حفظ الإيصال بنجاح');
      setActiveModal(null);
    } catch (err) { alert('خطأ في حفظ الإيصال'); }
  };

  return (
    <div style={{ 
      height: isMobile ? 'calc(100% - 10px)' : 'calc(100vh - 150px)', 
      background: '#020617',
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      borderRadius: isMobile ? '0' : '24px',
      overflow: 'hidden',
      boxShadow: isMobile ? 'none' : '0 10px 40px rgba(0,0,0,0.4)',
      border: isMobile ? 'none' : '1px solid rgba(255,255,255,0.05)',
      position: 'relative'
    }}>
      <div className="whatsapp-container" style={{
        display: 'flex', 
        flex: 1,
        overflow: 'hidden', 
        background: '#0f172a', 
        direction: 'rtl'
      }}>
        {/* Sidebar */}
        <div className={`sidebar ${isMobile && view === 'chat' ? 'hidden' : 'visible'}`} style={{ 
          width: isMobile ? '100%' : '380px', 
          background: '#1e293b', 
          display: isMobile && view === 'chat' ? 'none' : 'flex', 
          flexDirection: 'column',
          borderLeft: '1px solid rgba(255,255,255,0.05)'
        }}>
          <div style={{ padding: '20px', background: 'rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fff', margin: 0 }}>الدردشات</h2>
              {isMobile && <button onClick={() => window.history.back()} style={{ background: 'none', border: 'none', color: '#94a3b8' }}><X size={20}/></button>}
            </div>
            <input
              type="text" placeholder="بحث عن طالب..." className="input-base"
              value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              style={{ borderRadius: '12px', padding: '10px 15px', marginBottom: '10px' }}
            />
            
            {isAdmin && (
              <div style={{ display: 'flex', gap: '5px', marginBottom: '10px', background: 'rgba(0,0,0,0.2)', padding: '4px', borderRadius: '10px' }}>
                <button 
                  onClick={() => setSidebarTab('chats')} 
                  style={{ flex: 1, padding: '8px', border: 'none', borderRadius: '8px', background: sidebarTab === 'chats' ? '#3b82f6' : 'transparent', color: sidebarTab === 'chats' ? '#fff' : '#94a3b8', fontSize: '0.8rem', fontWeight: 600, transition: '0.2s' }}
                >
                  الدردشات النشطة
                </button>
                <button 
                  onClick={() => setSidebarTab('directory')} 
                  style={{ flex: 1, padding: '8px', border: 'none', borderRadius: '8px', background: sidebarTab === 'directory' ? '#3b82f6' : 'transparent', color: sidebarTab === 'directory' ? '#fff' : '#94a3b8', fontSize: '0.8rem', fontWeight: 600, transition: '0.2s' }}
                >
                  دليل الطلاب
                </button>
              </div>
            )}

            {isAdmin && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', padding: '10px', borderRadius: '15px', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)' }}>
                <label style={{ fontSize: '0.75rem', color: '#3b82f6', fontWeight: 800, paddingRight: '5px' }}>📈 إدارة رقابة الموظفين:</label>
                <select 
                  className="input-base" 
                  style={{ padding: '8px', fontSize: '0.85rem', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)' }}
                  value={viewingEmployeeId || ''}
                  onChange={(e) => setViewingEmployeeId(e.target.value)}
                >
                  <option value={employeeId}>-- محادثاتي الشخصية --</option>
                  {employees.filter(e => e.id !== employeeId).map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name} (موظف)</option>
                  ))}
                </select>
                <p style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', margin: 0, textAlign: 'center' }}>
                  أنت تشاهد الآن محادثات: {employees.find(e => e.id === viewingEmployeeId)?.name || 'نفسك'}
                </p>
              </div>
            )}
          </div>
          <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto' }}>
            {filteredSidebar.map(item => (
              <div key={item.id} onClick={() => { setSelectedChat(item); if (isMobile) setView('chat'); }} style={{ 
                padding: '12px 20px', 
                cursor: 'pointer', 
                background: selectedChat?.id === item.id ? 'rgba(59,130,246,0.1)' : 'transparent', 
                borderRight: selectedChat?.id === item.id ? '4px solid #3b82f6' : '4px solid transparent',
                transition: '0.2s'
              }}>
                <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                  <div style={{ 
                    width: '48px', height: '48px', borderRadius: '14px', 
                    background: 'linear-gradient(135deg, #3b82f6, #06b6d4)', 
                    display: 'flex', alignItems: 'center', justifyContent: 'center', 
                    color: '#fff', fontWeight: 900, fontSize: '1.1rem',
                    boxShadow: '0 4px 10px rgba(0,0,0,0.2)'
                  }}>{item.name?.substring(0, 1)}</div>
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                       <h4 style={{ margin: 0, color: '#fff', fontSize: '0.95rem', fontWeight: 700 }}>{item.name}</h4>
                       <span style={{ fontSize: '0.65rem', color: '#64748b' }}>{item.timestamp ? new Date(item.timestamp).toLocaleDateString('ar-EG') : ''}</span>
                    </div>
                    <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: '#3b82f6', opacity: 0.8 }}>{item.university || 'بانتظار التسجيل'}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Main Chat */}
        <div style={{ 
          flex: 1, 
          display: isMobile && view === 'list' ? 'none' : 'flex', 
          flexDirection: 'column', 
          background: '#020617',
          minWidth: 0,
          overflow: 'hidden'
        }}>
          {selectedChat ? (
            <>
              {/* Quick Toolbar (Scrollable on mobile) */}
              <div style={{ 
                padding: '10px 15px', 
                background: '#1e293b', 
                display: 'flex', 
                gap: '8px', 
                overflowX: 'auto',
                whiteSpace: 'nowrap',
                scrollbarWidth: 'none',
                borderBottom: '1px solid rgba(255,255,255,0.05)'
              }}>
                <button onClick={openAddModal} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.7rem', gap: '5px', borderRadius: '10px' }}><UserPlus size={14} /> إضافة</button>
                <button onClick={openEditModal} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.7rem', gap: '5px', borderRadius: '10px' }}><UserCog size={14} /> تعديل</button>
                <button onClick={() => setActiveModal('receipt')} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.7rem', gap: '5px', borderRadius: '10px' }}><Receipt size={14} /> إيصال</button>
                <button onClick={() => setActiveModal('withdraw')} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.7rem', gap: '5px', borderRadius: '10px' }}><UserMinus size={14} /> إنسحاب</button>
                <button onClick={() => setActiveModal('query')} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.7rem', gap: '5px', borderRadius: '10px', background: 'rgba(168,85,247,0.1)', color: '#a855f7' }}><Key size={14} /> الاستعلام</button>
              </div>

              <div style={{ 
                padding: '12px 20px', 
                borderBottom: '1px solid rgba(255,255,255,0.05)', 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                background: 'rgba(30,41,59,0.8)',
                backdropFilter: 'blur(10px)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {isMobile && <button onClick={() => setView('list')} style={{ background: 'none', border: 'none', color: '#fff', padding: '5px' }}><ArrowRight size={24}/></button>}
                  <div>
                    <h3 style={{ margin: 0, color: '#fff', fontSize: '1rem', fontWeight: 800 }}>{selectedChat.name}</h3>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '3px' }}>
                      <span style={{ fontSize: '0.65rem', color: '#3b82f6', background: 'rgba(59,130,246,0.15)', padding: '1px 8px', borderRadius: '5px' }}>{selectedChat.university || 'بانتظار البيانات'}</span>
                      {selectedChat.specialization && <span style={{ fontSize: '0.65rem', color: '#10b981', background: 'rgba(16,185,129,0.15)', padding: '1px 8px', borderRadius: '5px' }}>{selectedChat.specialization}</span>}
                    </div>
                  </div>
                </div>
                <Info size={18} style={{ color: '#94a3b8', cursor: 'pointer' }} onClick={() => setShowDetails(!showDetails)} />
              </div>

              <div className="custom-scrollbar" style={{ 
                flex: 1, 
                overflowY: 'auto', 
                padding: isMobile ? '12px' : '20px', 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '8px', 
                background: '#0f172a', 
                backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.02) 1px, transparent 0)', 
                backgroundSize: '24px 24px'
              }}>
                {messages.map((m, i) => {
                  const isMe = m.sender === 'me';
                  const isPicked = selectedMessage?.id === m.id;
                  const messageDate = formatMessageDate(m.time || Date.now());
                  const prevMessageDate = i > 0 ? formatMessageDate(messages[i-1].time || Date.now()) : null;
                  const showDateSeparator = messageDate !== prevMessageDate;

                  return (
                    <React.Fragment key={i}>
                      {showDateSeparator && (
                        <div style={{ display: 'flex', justifyContent: 'center', margin: '20px 0 10px' }}>
                          <span style={{ background: 'rgba(30,41,59,0.8)', color: 'rgba(255,255,255,0.6)', padding: '4px 12px', borderRadius: '8px', fontSize: '0.7rem', fontWeight: 600 }}>{messageDate}</span>
                        </div>
                      )}
                      
                      <div 
                        style={{ display: 'flex', justifyContent: isMe ? 'flex-start' : 'flex-end', width: '100%', marginBottom: '2px' }} 
                        onClick={() => {
                          if (isSelectingMessage) {
                            setSelectedMessage(m);
                            setIsSelectingMessage(false);
                            setActiveModal('receipt');
                          }
                        }}
                      >
                        <div style={{ 
                          maxWidth: '75%', width: 'fit-content', padding: '8px 12px', borderRadius: '12px', 
                          background: isMe ? '#065f46' : '#1e293b', 
                          color: '#fff',
                          borderTopRightRadius: isMe ? '2px' : '12px', 
                          borderTopLeftRadius: isMe ? '12px' : '2px',
                          boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
                          cursor: isSelectingMessage ? 'pointer' : 'default',
                          border: (isSelectingMessage && isPicked) ? '2px solid #3b82f6' : 'none',
                          position: 'relative',
                          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                          overflow: 'hidden'
                        }}>
                          {m.type === 'image' && m.mediaData && (
                            <img 
                              src={m.mediaData} alt="Shared" 
                              style={{ width: '100%', borderRadius: '8px', marginBottom: '8px', display: 'block', maxHeight: '300px', objectFit: 'cover' }} 
                            />
                          )}
                          {m.type === 'video' && m.mediaData && (
                            <div style={{ position: 'relative', borderRadius: '8px', overflow: 'hidden', marginBottom: '8px' }}>
                              <video 
                                src={m.mediaData} 
                                controls 
                                style={{ width: '100%', maxHeight: '300px', display: 'block', background: '#000' }}
                              />
                            </div>
                          )}
                          {m.type === 'audio' && m.mediaData && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0' }}>
                              <div style={{ background: 'rgba(59,130,246,0.2)', padding: '10px', borderRadius: '50%', color: '#3b82f6' }}>
                                <MessageCircle size={20} />
                              </div>
                              <audio 
                                src={m.mediaData} 
                                controls 
                                style={{ height: '35px', maxWidth: '100%', filter: 'invert(100%) opacity(0.8)' }}
                              />
                            </div>
                          )}
                          {m.type === 'document' && (
                            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                              <FileText size={24} color="#3b82f6" />
                              <span style={{ fontSize: '0.8rem' }}>{m.text}</span>
                            </div>
                          )}
                          {(m.type === 'text' || !m.type) && (
                            <p style={{ margin: 0, fontSize: isMobile ? '0.88rem' : '0.94rem', lineHeight: 1.5, wordBreak: 'break-word', color: '#f8fafc' }}>{m.text}</p>
                          )}
                          {m.type !== 'text' && m.type && m.text && m.text !== "[صورة]" && m.text !== "[فيديو]" && (
                             <p style={{ margin: '8px 0 0', fontSize: '0.9rem', color: '#f8fafc' }}>{m.text}</p>
                          )}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', justifyContent: 'flex-end', borderTop: isMe && m.senderName ? '1px solid rgba(255,255,255,0.1)' : 'none', paddingTop: isMe && m.senderName ? '4px' : '0' }}>
                            {isMe && m.senderName && (
                              <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.6)', fontWeight: 700, marginRight: 'auto' }}>
                                بقلم: {m.senderName}
                              </span>
                            )}
                            <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>
                              {m.time ? new Date(m.time).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true }) : ''}
                            </span>
                            {isMe && <CheckCheck size={14} style={{ color: '#34d399' }} />}
                          </div>
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              <div style={{ padding: '20px', background: '#1e293b', borderTop: '1px solid rgba(255,255,255,0.05)', position: 'relative' }}>
                {showEmojiPicker && (
                  <div style={{ position: 'absolute', bottom: '85px', right: '20px', zIndex: 1000, boxShadow: '0 10px 40px rgba(0,0,0,0.6)', borderRadius: '15px' }}>
                    <Picker 
                      data={async () => {
                        const res = await fetch('https://cdn.jsdelivr.net/npm/@emoji-mart/data');
                        return res.json();
                      }}
                      onEmojiSelect={(emoji) => setMessage(prev => prev + emoji.native)}
                      theme="dark"
                      set="native"
                      locale="ar"
                      previewPosition="none"
                      skinIconsShape="circle"
                    />
                  </div>
                )}
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                  >
                    <Paperclip size={24} />
                  </button>
                  <input 
                    type="file" ref={fileInputRef} style={{ display: 'none' }} 
                    onChange={handleFileSelect}
                  />
                  <button 
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    style={{ background: 'none', border: 'none', color: showEmojiPicker ? '#34d399' : '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: '0.2s' }}
                  >
                    <Smile size={24} />
                  </button>
                  <textarea 
                    value={message} 
                    onChange={e => setMessage(e.target.value)} 
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey && !isMobile) {
                        e.preventDefault();
                        handleSend();
                      }
                    }} 
                    placeholder="اكتب رسالتك هنا..." 
                    rows={1}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck="false"
                    style={{ 
                      flex: 1, 
                      background: 'rgba(255,255,255,0.05)', 
                      border: 'none', 
                      padding: '12px 15px', 
                      borderRadius: '15px', 
                      color: '#fff', 
                      fontSize: '0.94rem',
                      resize: 'none',
                      fontFamily: 'inherit',
                      outline: 'none',
                      lineHeight: '1.4'
                    }} 
                  />
                  <button onClick={handleSend} className="btn-primary" style={{ borderRadius: '12px', padding: '10px' }}>
                    <Send size={20} />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.1 }}><MessageCircle size={100} color="#fff" /></div>
          )}
        </div>
      </div>

      {/* --- Modals --- */}
      {activeModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={() => setActiveModal(null)}>
          <div className="glass-panel animate-scale-in" style={{ width: '100%', maxWidth: '500px', padding: '30px', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
              <h3 style={{ margin: 0, color: '#fff', display: 'flex', gap: '10px', alignItems: 'center' }}>
                {activeModal === 'add' && <><UserPlus /> إضافة طالب جديد</>}
                {activeModal === 'edit' && <><UserCog /> تعديل البيانات</>}
                {activeModal === 'receipt' && <><Receipt /> إرفاق إيصال</>}
                {activeModal === 'withdraw' && <><UserMinus /> طلب إنسحاب</>}
              </h3>
              <button onClick={() => setActiveModal(null)} style={{ background: 'none', border: 'none', color: '#fff' }}><X /></button>
            </div>

            {(activeModal === 'add' || activeModal === 'edit') && (
              <form onSubmit={activeModal === 'add' ? handleAddStudent : handleUpdateStudent} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div>
                  <label style={{ display: 'block', color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', marginBottom: '5px' }}>اسم الطالب</label>
                  <input type="text" className="input-base" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                  <div>
                    <label style={{ display: 'block', color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', marginBottom: '5px' }}>الجامعة</label>
                    <select className="input-base" style={{ background: '#0f172a' }} value={formData.university} onChange={e => setFormData({ ...formData, university: e.target.value })} required>
                      <option value="">اختر الجامعة</option>
                      {universities.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', marginBottom: '5px' }}>التخصص</label>
                    <select 
                      className="input-base" 
                      style={{ background: '#0f172a' }}
                      value={formData.specialization} 
                      onChange={e => setFormData({ ...formData, specialization: e.target.value })} 
                      required
                    >
                      <option value="">اختر التخصص</option>
                      {majors.sort().map((m, i) => (
                        <option key={i} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                  <div>
                    <label style={{ display: 'block', color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', marginBottom: '5px' }}>يوزر المنصة (مخفي للأمان)</label>
                    <input 
                      type="password" 
                      className="input-base" 
                      value={formData.platformUser || ''} 
                      onChange={e => setFormData({ ...formData, platformUser: e.target.value })} 
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', marginBottom: '5px' }}>باسورد المنصة (مخفي للأمان)</label>
                    <input 
                      type="password" 
                      className="input-base" 
                      placeholder="••••••••" 
                      value={formData.platformPass || ''} 
                      onChange={e => setFormData({ ...formData, platformPass: e.target.value })} 
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                  <div>
                    <label style={{ display: 'block', color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', marginBottom: '5px' }}>رقم الدفعة</label>
                    <input type="text" className="input-base" value={formData.batch} onChange={e => setFormData({ ...formData, batch: e.target.value })} required />
                  </div>
                  <div>
                    <label style={{ display: 'block', color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', marginBottom: '5px' }}>رقم الهوية (اختياري)</label>
                    <input type="text" className="input-base" value={formData.idNumber} onChange={e => setFormData({ ...formData, idNumber: e.target.value })} />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', marginBottom: '5px' }}>ملاحظات</label>
                  <textarea className="input-base" value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} rows={2}></textarea>
                </div>

                <button type="submit" className="btn-primary" style={{ padding: '15px', borderRadius: '15px', marginTop: '10px' }}>
                  <Save size={18} /> {activeModal === 'add' ? 'حفظ الطالب في النظام' : 'تحديث البيانات'}
                </button>
              </form>
            )}

            {activeModal === 'receipt' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ background: 'rgba(59,130,246,0.1)', padding: '15px', borderRadius: '15px', border: '1px border-dashed #3b82f6' }}>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: '#3b82f6' }}>
                    {selectedMessage ? `الرسالة المختارة: ${selectedMessage.text.substring(0, 40)}...` : 'لم يتم تحديد رسالة من الدردشة بعد'}
                  </p>
                </div>
                
                <button 
                  onClick={() => { setActiveModal(null); setIsSelectingMessage(true); }}
                  className="btn-secondary" style={{ padding: '15px', borderRadius: '15px', background: '#3b82f61a', color: '#3b82f6' }}
                >
                  <MessageSquare size={18} /> تحديد رسالة الإيصال من الدردشة
                </button>

                {selectedMessage && (
                  <button 
                    onClick={() => handleReceiptSave({ text: selectedMessage?.text || '', fromChat: true })}
                    className="btn-primary" style={{ padding: '15px', borderRadius: '15px' }}
                  >
                    <ClipboardList size={20} /> اعتماد وحفظ كإيصال رسمي
                  </button>
                )}

                <div style={{ textAlign: 'center', opacity: 0.3, fontSize: '0.8rem' }}>أو أدخل النص يدوياً</div>
             <button
                  onClick={() => handleReceiptSave({ text: selectedMessage?.text || '', fromChat: true })}
                  className="btn-primary" style={{ padding: '15px', borderRadius: '15px' }}
                  disabled={!selectedMessage}
                >
                  <ClipboardList size={20} /> اعتماد الرسالة المختارة كإيصال
                </button>
                <div style={{ textAlign: 'center', opacity: 0.3 }}>أو</div>
                <textarea
                  placeholder="الصق نص التحويل يدوياً هنا..." className="input-base" rows={4}
                  onChange={e => setFormData({ ...formData, manualReceipt: e.target.value })}
                ></textarea>
                <button
                  onClick={() => handleReceiptSave({ text: formData.manualReceipt, fromChat: false })}
                  className="btn-secondary" style={{ padding: '15px', borderRadius: '15px' }}
                  disabled={!formData.manualReceipt}
                >
                  حفظ النص يدوياً
                </button>
              </div>
            )}

            {activeModal === 'withdraw' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>اختر سبب الانسحاب للطالب {selectedChat.name}:</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  {['عدم موافقة جهة العمل', 'الطالب لا يرد', 'مشترك مع شخص آخر', 'سوء الخدمة', 'أسباب أخرى'].map(reason => (
                    <button 
                      key={reason} 
                      onClick={() => setFormData({ ...formData, withdrawalReason: reason })} 
                      className="btn-secondary" 
                      style={{ 
                        padding: '12px', textAlign: 'center', borderRadius: '12px', fontSize: '0.8rem',
                        border: formData.withdrawalReason === reason ? '2px solid #3b82f6' : '1px solid rgba(255,255,255,0.05)',
                        background: formData.withdrawalReason === reason ? 'rgba(59,130,246,0.1)' : 'transparent'
                      }}
                    >
                      {reason}
                    </button>
                  ))}
                </div>
                
                <div style={{ marginTop: '10px' }}>
                  <label style={{ display: 'block', color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', marginBottom: '8px' }}>تفاصيل إضافية (اختياري)</label>
                  <textarea 
                    className="input-base" rows={4} 
                    placeholder="اكتب أي ملاحظات إضافية هنا..." 
                    onChange={e => setFormData({ ...formData, withdrawalDetails: e.target.value })}
                  ></textarea>
                </div>

                <button 
                  onClick={() => handleWithdrawalRequest(formData.withdrawalReason, formData.withdrawalDetails)} 
                  className="btn-primary" 
                  disabled={!formData.withdrawalReason}
                  style={{ padding: '15px', borderRadius: '15px', marginTop: '10px' }}
                >
                  إرسال الطلب للإدارة
                </button>
              </div>
            )}

            {activeModal === 'query' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ textAlign: 'center', marginBottom: '10px' }}>
                  <ShieldCheck size={48} color="#a855f7" style={{ margin: '0 auto 10px' }} />
                  <h4 style={{ color: '#fff', margin: 0 }}>بيانات الوصول للمنصة</h4>
                  <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)' }}>يتم عرض البيانات بشكل مشفر للحفاظ على الخصوصية</p>
                </div>

                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '20px', borderRadius: '15px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>إسم المستخدم</span>
                      <p style={{ margin: 0, color: '#fff', fontWeight: 600 }}>••••••••</p>
                    </div>
                  </div>
                  <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)' }}></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>كلمة المرور</span>
                      <p style={{ margin: 0, color: '#fff', fontWeight: 600 }}>••••••••</p>
                    </div>
                  </div>
                </div>

                <button 
                  onClick={sendCredentialsToStudent}
                  className="btn-primary" 
                  style={{ padding: '15px', borderRadius: '15px', background: 'linear-gradient(135deg, #a855f7, #7c3aed)' }}
                >
                  <Send size={18} /> إرسال البيانات عبر الواتساب
                </button>
              </div>
            )}

            {activeModal === 'attachment' && attachment && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ textAlign: 'center' }}>
                  <h4 style={{ color: '#fff', margin: '0 0 15px' }}>إرسال مرفق</h4>
                  {attachment.type.startsWith('image/') ? (
                    <img src={attachment.preview} alt="preview" style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: '15px', border: '2px solid rgba(255,255,255,0.05)', boxShadow: '0 5px 15px rgba(0,0,0,0.3)' }} />
                  ) : attachment.type.startsWith('video/') ? (
                    <video src={attachment.preview} controls style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: '15px', background: '#000', boxShadow: '0 5px 15px rgba(0,0,0,0.3)' }} />
                  ) : (
                    <div style={{ padding: '30px', background: 'rgba(255,255,255,0.03)', borderRadius: '15px', border: '1px border-dashed rgba(255,255,255,0.1)' }}>
                      <FileText size={48} color="#3b82f6" style={{ margin: '0 auto 10px' }} />
                      <p style={{ color: '#fff', fontSize: '0.9rem', margin: 0 }}>{attachment.file.name}</p>
                    </div>
                  )}
                </div>

                <div>
                  <label style={{ display: 'block', color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', marginBottom: '8px' }}>شرح توضيحي (Caption)</label>
                  <textarea 
                    className="input-base" rows={3} placeholder="اكتب وصفاً لهذا المرفق..."
                    onChange={e => setFormData({ ...formData, attachmentCaption: e.target.value })}
                  ></textarea>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => { setAttachment(null); setActiveModal(null); }} className="btn-secondary" style={{ flex: 1, padding: '15px', borderRadius: '15px' }}>إلغاء</button>
                  <button 
                    onClick={sendAttachment} className="btn-primary" 
                    style={{ flex: 2, padding: '15px', borderRadius: '15px', background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}
                    disabled={isSending}
                  >
                    <Send size={18} /> {isSending ? 'جاري الإرسال...' : 'إرسال الآن'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
