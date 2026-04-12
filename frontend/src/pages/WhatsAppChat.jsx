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
  const [activeModal, setActiveModal] = useState(null); // 'add', 'edit', 'receipt', 'withdraw'
  const [formData, setFormData] = useState({});
  const [selectedMessage, setSelectedMessage] = useState(null);

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
    
    // Listen to Students
    const unsubStudents = onSnapshot(collection(db, 'students'), (snap) => {
      setStudents(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // Listen to Universities for dropdowns
    const unsubUnivs = onSnapshot(collection(db, 'universities'), (snap) => {
      setUniversities(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // Listen to Active Chats from RTDB
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
        fullJid: selectedChat.fullJid // Pass the Gold JID if available
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
    if (!selectedChat?.isStudent) return alert('هذا الطالب غير مسجل في النظام حالياً');
    setFormData({ ...selectedChat });
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
      const { phone, platformUser, platformPass, ...safeUpdate } = formData;
      await updateDoc(studentRef, safeUpdate);
      alert('تم تحديث البيانات بنجاح');
      setActiveModal(null);
    } catch (err) { alert('خطأ في التحديث'); }
  };

  const handleWithdrawalRequest = async (reason) => {
    try {
      await addDoc(collection(db, 'orders'), {
        studentId: selectedChat.id,
        studentName: selectedChat.name,
        type: 'withdrawal',
        reason,
        status: 'pending',
        createdAt: Timestamp.now()
      });
      alert('تم إرسال طلب الانسحاب للإدارة');
      setActiveModal(null);
    } catch (err) { alert('فشل إرسال الطلب'); }
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
    <div style={{ position: 'relative', height: '100%' }}>
      <div className="whatsapp-container" style={{ 
        display: 'flex', height: 'calc(100vh - 120px)', borderRadius: isMobile ? '0' : '30px', 
        overflow: 'hidden', background: '#0f172a', direction: 'rtl'
      }}>
        {/* Sidebar */}
        <div className={`sidebar ${isMobile && view === 'chat' ? 'hidden' : 'visible'}`} style={{ width: isMobile ? '100%' : '380px', background: '#1e293b', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '25px', background: 'rgba(0,0,0,0.2)' }}>
            <h2 style={{ fontSize: '1.6rem', fontWeight: 900, color: '#fff', margin: '0 0 20px' }}>الدردشات</h2>
            <input 
              type="text" placeholder="بحث..." className="input-base"
              value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto' }}>
            {filteredSidebar.map(item => (
              <div key={item.id} onClick={() => { setSelectedChat(item); if(isMobile) setView('chat'); }} style={{ padding: '15px 20px', cursor: 'pointer', background: selectedChat?.id === item.id ? 'rgba(34,197,94,0.1)' : 'transparent', borderRight: selectedChat?.id === item.id ? '4px solid #3b82f6' : '4px solid transparent' }}>
                <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                  <div style={{ width: '45px', height: '45px', borderRadius: '15px', background: 'linear-gradient(135deg, #3b82f6, #06b6d4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900 }}>{item.name?.substring(0,1)}</div>
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <h4 style={{ margin: 0, color: '#fff', fontSize: '0.9rem' }}>{item.name}</h4>
                    <p style={{ margin: 0, fontSize: '0.7rem', color: '#3b82f6' }}>{item.university || 'غير مسجل'}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Main Chat */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#020617' }}>
          {selectedChat ? (
            <>
              {/* Quick Toolbar */}
              <div style={{ padding: '10px 20px', background: '#1e293b', display: 'flex', gap: '10px', overflowX: 'auto' }}>
                <button onClick={openAddModal} className="btn-secondary" style={{ padding: '5px 12px', fontSize: '0.75rem', gap: '5px' }}><UserPlus size={14}/> إضافة</button>
                <button onClick={openEditModal} className="btn-secondary" style={{ padding: '5px 12px', fontSize: '0.75rem', gap: '5px' }}><UserCog size={14}/> تعديل</button>
                <button onClick={() => setActiveModal('receipt')} className="btn-secondary" style={{ padding: '5px 12px', fontSize: '0.75rem', gap: '5px' }}><Receipt size={14}/> إيصال</button>
                <button onClick={() => setActiveModal('withdraw')} className="btn-secondary" style={{ padding: '5px 12px', fontSize: '0.75rem', gap: '5px' }}><UserMinus size={14}/> إنسحاب</button>
              </div>

              <div style={{ padding: '15px 25px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {isMobile && <button onClick={() => setView('list')} style={{ background: 'none', border: 'none', color: '#fff' }}><ArrowRight size={24}/></button>}
                  <h3 style={{ margin: 0, color: '#fff' }}>{selectedChat.name}</h3>
                </div>
                <Info size={20} style={{ color: '#3b82f6', cursor: 'pointer' }} onClick={() => setShowDetails(!showDetails)} />
              </div>

              <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {messages.map((m, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: m.sender === 'me' ? 'flex-start' : 'flex-end' }} onClick={() => setSelectedMessage(m)}>
                    <div style={{ padding: '10px 15px', borderRadius: '15px', background: m.sender === 'me' ? '#059669' : '#1e293b', color: '#fff', fontSize: '0.9rem', cursor: 'pointer', border: selectedMessage?.id === m.id ? '2px solid #3b82f6' : 'none' }}>
                      {m.text}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              <div style={{ padding: '20px', background: '#1e293b' }}>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input type="text" value={message} onChange={e => setMessage(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend()} placeholder="اكتب..." style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: 'none', padding: '10px 15px', borderRadius: '15px', color: '#fff' }} />
                  <button onClick={handleSend} className="btn-primary" style={{ borderRadius: '12px' }}><Send size={20}/></button>
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
                  <input type="text" className="input-base" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                  <div>
                    <label style={{ display: 'block', color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', marginBottom: '5px' }}>الجامعة</label>
                    <select className="input-base" style={{ background: '#0f172a' }} value={formData.university} onChange={e => setFormData({...formData, university: e.target.value})} required>
                      <option value="">اختر الجامعة</option>
                      {universities.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', marginBottom: '5px' }}>التخصص</label>
                    <input type="text" className="input-base" list="specializations" value={formData.specialization} onChange={e => setFormData({...formData, specialization: e.target.value})} required />
                    <datalist id="specializations">
                      {universities.find(u => u.name === formData.university)?.specializations?.map((s, i) => <option key={i} value={s} />)}
                    </datalist>
                  </div>
                </div>

                {activeModal === 'add' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                    <div>
                      <label style={{ display: 'block', color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', marginBottom: '5px' }}>يوزر المنصة</label>
                      <input type="text" className="input-base" value={formData.platformUser} onChange={e => setFormData({...formData, platformUser: e.target.value})} />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', marginBottom: '5px' }}>باسورد المنصة</label>
                      <input type="password" placeholder="****" className="input-base" onChange={e => setFormData({...formData, platformPass: e.target.value})} />
                    </div>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                  <div>
                    <label style={{ display: 'block', color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', marginBottom: '5px' }}>رقم الدفعة</label>
                    <input type="text" className="input-base" value={formData.batch} onChange={e => setFormData({...formData, batch: e.target.value})} required />
                  </div>
                  <div>
                    <label style={{ display: 'block', color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', marginBottom: '5px' }}>رقم الهوية (اختياري)</label>
                    <input type="text" className="input-base" value={formData.idNumber} onChange={e => setFormData({...formData, idNumber: e.target.value})} />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', marginBottom: '5px' }}>ملاحظات</label>
                  <textarea className="input-base" value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} rows={2}></textarea>
                </div>

                <button type="submit" className="btn-primary" style={{ padding: '15px', borderRadius: '15px', marginTop: '10px' }}>
                  <Save size={18} /> {activeModal === 'add' ? 'حفظ الطالب في النظام' : 'تحديث البيانات'}
                </button>
              </form>
            )}

            {activeModal === 'receipt' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ background: 'rgba(59,130,246,0.1)', padding: '15px', borderRadius: '15px', border: '1px border-dashed #3b82f6' }}>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: '#3b82f6' }}>{selectedMessage ? `الرسالة المختارة: ${selectedMessage.text.substring(0, 40)}...` : 'يرجى النقر على رسالة في الدردشة أولاً لتحديدها كإيصال'}</p>
                </div>
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
                  onChange={e => setFormData({...formData, manualReceipt: e.target.value})}
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: '10px' }}>يرجى اختيار سبب طلب الانسحاب للطالب {selectedChat.name}:</p>
                {['عدم موافقة جهة العمل', 'الطالب لا يرد', 'مشترك مع شخص آخر', 'سوء الخدمة', 'أسباب أخرى'].map(reason => (
                  <button key={reason} onClick={() => handleWithdrawalRequest(reason)} className="btn-secondary" style={{ padding: '15px', textAlign: 'right', borderRadius: '12px', justifyContent: 'flex-start' }}>
                    {reason}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
