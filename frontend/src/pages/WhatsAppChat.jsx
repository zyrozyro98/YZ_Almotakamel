import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageCircle, Search, Send, User, CheckCheck, RefreshCw, 
  Info, AlertCircle, Smile, ArrowRight, MessageSquare, GraduationCap, School,
  UserPlus, UserCog, Receipt, UserMinus, Zap, X, Save, FileText, ClipboardList
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
  const [searchQuery, setSearchQuery] = useState('');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const messagesEndRef = useRef(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [view, setView] = useState('list'); 

  // Modals State
  const [activeModal, setActiveModal] = useState(null); 
  const [formData, setFormData] = useState({});
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [isSelectingMsg, setIsSelectingMsg] = useState(false);

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
      setStudents(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubUnivs = onSnapshot(collection(db, 'universities'), (snap) => {
      setUniversities(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const activeRef = ref(rtdb, `chats/${employeeId}`);
    const unsubActive = onValue(activeRef, (snapshot) => {
      const data = snapshot.val();
      if (data) setActiveChats(Object.entries(data).map(([id, val]) => ({ phone: id, ...val })));
      else setActiveChats([]);
    });
    return () => { unsubStudents(); unsubActive(); unsubUnivs(); };
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
  
  const combinedList = () => {
    const list = [...students];
    activeChats.forEach(chat => {
      const exists = students.find(s => getMatchKey(s.phone) === getMatchKey(chat.phone));
      if (!exists) {
        list.push({
          id: chat.phone,
          name: chat.name || `مجهول: ${chat.phone}`,
          phone: chat.phone,
          fullJid: chat.fullJid,
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
        fullJid: active?.fullJid || item.fullJid,
        lastMessage: active?.lastMessage || item.lastMessage || 'لا توجد رسائل',
        timestamp: active?.timestamp || item.timestamp || 0
      };
    }).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  };

  const filteredSidebar = combinedList().filter(item => {
    const q = searchQuery.toLowerCase();
    return item.name?.toLowerCase().includes(q) || item.phone?.includes(q) || item.university?.toLowerCase().includes(q);
  });

  const handleSend = async () => {
    if (!message.trim() || !selectedChat || isSending) return;
    const textToSend = message; setMessage(''); setShowEmojiPicker(false); setIsSending(true);
    try {
      await axios.post(`${BASE_URL}/api/whatsapp/send`, {
        employeeId, 
        phoneNumber: selectedChat.phone.replace(/[^0-9]/g, ''), 
        message: textToSend,
        fullJid: selectedChat.fullJid
      });
    } catch (err) { console.error(err); } finally { setIsSending(false); }
  };

  const openAddModal = () => {
    setFormData({ name: selectedChat?.name?.includes('مجهول') ? '' : (selectedChat?.name || ''), phone: selectedChat?.phone || '' });
    setActiveModal('add');
  };

  const openEditModal = () => {
    const student = students.find(s => getMatchKey(s.phone) === getMatchKey(selectedChat?.phone));
    if (!student) return alert('هذا الطالب غير مسجل حالياً');
    setFormData({ ...student });
    setActiveModal('edit');
  };

  const handleAddStudent = async (e) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'students'), { ...formData, createdAt: Timestamp.now(), createdBy: employeeId });
      alert('تم الإضافة'); setActiveModal(null);
    } catch (err) { alert('خطأ'); }
  };

  const handleUpdateStudent = async (e) => {
    e.preventDefault();
    try {
      const studentRef = doc(db, 'students', formData.id);
      await updateDoc(studentRef, formData);
      alert('تم التحديث'); setActiveModal(null);
    } catch (err) { alert('خطأ'); }
  };

  const handleWithdrawalRequest = async (reason) => {
    try {
      await addDoc(collection(db, 'orders'), { studentId: selectedChat.id, type: 'withdrawal', reason, status: 'pending', createdAt: Timestamp.now() });
      alert('تم الطلب'); setActiveModal(null);
    } catch (err) { alert('فشل'); }
  };

  const handleReceiptSave = async (receiptData) => {
    try {
      await addDoc(collection(db, 'receipts'), { studentId: selectedChat.id, ...receiptData, createdAt: Timestamp.now() });
      alert('تم الحفظ'); setActiveModal(null); setSelectedMessage(null);
    } catch (err) { alert('خطأ'); }
  };

  return (
    <div style={{ position: 'relative', height: '100%', direction: 'rtl' }}>
      <div className="whatsapp-container" style={{ display: 'flex', height: 'calc(100vh - 120px)', background: '#0f172a' }}>
        
        {/* Sidebar */}
        <div style={{ width: isMobile && view === 'chat' ? '0' : (isMobile ? '100%' : '380px'), overflow: 'hidden', background: '#1e293b', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '25px' }}>
            <h2 style={{ color: '#fff', marginBottom: '20px' }}>الدردشات</h2>
            <input type="text" placeholder="بحث..." className="input-base" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          </div>
          <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto' }}>
            {filteredSidebar.map(item => (
              <div key={item.id} onClick={() => { setSelectedChat(item); if(isMobile) setView('chat'); }} style={{ padding: '15px 20px', cursor: 'pointer', background: selectedChat?.id === item.id ? 'rgba(59,130,246,0.1)' : 'transparent' }}>
                <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                  <div style={{ width: '45px', height: '45px', borderRadius: '12px', background: 'linear-gradient(135deg, #3b82f6, #06b6d4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>{item.name?.substring(0,1)}</div>
                  <div style={{ flex: 1 }}>
                    <h4 style={{ margin: 0, color: '#fff' }}>{item.name}</h4>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: '#3b82f6' }}>{item.university || 'مجهول'}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Chat Area */}
        <div style={{ flex: 1, display: isMobile && view === 'list' ? 'none' : 'flex', flexDirection: 'column', background: '#020617' }}>
          {selectedChat ? (
            <>
              <div style={{ padding: '10px 20px', background: '#1e293b', display: 'flex', gap: '10px' }}>
                <button onClick={openAddModal} className="btn-secondary" style={{ padding: '5px 12px', fontSize: '0.75rem' }}><UserPlus size={14}/> إضافة</button>
                <button onClick={openEditModal} className="btn-secondary" style={{ padding: '5px 12px', fontSize: '0.75rem' }}><UserCog size={14}/> تعديل</button>
                <button onClick={() => setActiveModal('receipt')} className="btn-secondary" style={{ padding: '5px 12px', fontSize: '0.75rem' }}><Receipt size={14}/> إيصال</button>
                <button onClick={() => setActiveModal('withdraw')} className="btn-secondary" style={{ padding: '5px 12px', fontSize: '0.75rem' }}><UserMinus size={14}/> إنسحاب</button>
              </div>

              <div style={{ padding: '15px 25px', background: '#1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {isMobile && <button onClick={() => setView('list')} style={{ background: 'none', border: 'none', color: '#fff' }}><ArrowRight size={24} /></button>}
                  <h3 style={{ color: '#fff', margin: 0 }}>{selectedChat.name}</h3>
                </div>
              </div>

              <div className="custom-scrollbar" style={{ 
                flex: 1, overflowY: 'auto', padding: '30px', display: 'flex', flexDirection: 'column', gap: '15px', 
                cursor: isSelectingMsg ? 'crosshair' : 'default'
              }}>
                {messages.map((m, i) => (
                  <div key={i} onClick={() => { if(isSelectingMsg) { setSelectedMessage(m); setIsSelectingMsg(false); setActiveModal('receipt'); }}} 
                       style={{ display: 'flex', justifyContent: m.sender === 'me' ? 'flex-start' : 'flex-end', opacity: isSelectingMsg && selectedMessage?.id !== m.id ? 0.5 : 1 }}>
                    <div style={{ padding: '10px 18px', borderRadius: '18px', background: m.sender === 'me' ? '#059669' : '#1e293b', color: '#fff', border: selectedMessage?.id === m.id ? '2px solid #3b82f6' : 'none' }}>
                      {m.text}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              <div style={{ padding: '20px', background: '#1e293b' }}>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input type="text" className="input-base" value={message} onChange={e => setMessage(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend()} />
                  <button onClick={handleSend} className="btn-primary"><Send size={20}/></button>
                </div>
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.1 }}><MessageCircle size={100} color="#fff" /></div>
          )}
        </div>
      </div>

      {/* Modals */}
      {activeModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={() => setActiveModal(null)}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '500px', padding: '30px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', margin: '0 0 20px' }}>
              <h3 style={{ color: '#fff' }}>{activeModal === 'receipt' ? 'إرفاق إيصال' : 'بيانات الطالب'}</h3>
              <X onClick={() => setActiveModal(null)} style={{ color: '#fff', cursor: 'pointer' }} />
            </div>

            {activeModal === 'receipt' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div style={{ background: 'rgba(59,130,246,0.1)', padding: '15px', borderRadius: '12px', border: '1px dashed #3b82f6' }}>
                  <p style={{ color: '#3b82f6', fontSize: '0.8rem', margin: 0 }}>{selectedMessage ? `تم اختيار: ${selectedMessage.text.substring(0,30)}...` : 'لم يتم اختيار رسالة'}</p>
                </div>
                <button onClick={() => { setActiveModal(null); setIsSelectingMsg(true); }} className="btn-secondary" style={{ width: '100%', padding: '12px' }}>
                  <Search size={18} /> انقر لتحديد رسالة من الدردشة
                </button>
                {selectedMessage && <button onClick={() => handleReceiptSave({ text: selectedMessage.text, fromChat: true })} className="btn-primary" style={{ width: '100%', padding: '12px' }}>اعتماد الرسالة المحددة</button>}
                <textarea placeholder="أو الصق النص هنا..." className="input-base" rows={3} onChange={e => setFormData({ ...formData, manualText: e.target.value })} />
                <button onClick={() => handleReceiptSave({ text: formData.manualText, fromChat: false })} className="btn-secondary" style={{ width: '100%', padding: '12px' }}>حفظ النص يدوياً</button>
              </div>
            )}

            {(activeModal === 'add' || activeModal === 'edit') && (
              <form onSubmit={activeModal === 'add' ? handleAddStudent : handleUpdateStudent} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <input type="text" placeholder="الاسم" className="input-base" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} />
                <select className="input-base" value={formData.university || ''} onChange={e => setFormData({...formData, university: e.target.value})}>
                  <option value="">اختر الجامعة</option>
                  {universities.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                </select>
                <input type="text" placeholder="التخصص" className="input-base" value={formData.specialization || ''} onChange={e => setFormData({...formData, specialization: e.target.value})} />
                <button type="submit" className="btn-primary" style={{ marginTop: '10px' }}>حفظ</button>
              </form>
            )}

            {activeModal === 'withdraw' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {['عدم موافقة', 'لا يرد', 'سوء خدمة'].map(r => <button key={r} onClick={() => handleWithdrawalRequest(r)} className="btn-secondary" style={{ textAlign: 'right', padding: '12px' }}>{r}</button>)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
