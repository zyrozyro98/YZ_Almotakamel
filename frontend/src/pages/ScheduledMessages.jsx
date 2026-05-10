import React, { useState, useEffect } from 'react';
import { Calendar, Trash2, Clock, CheckCircle, AlertCircle, RefreshCw, Send, User } from 'lucide-react';
import axios from 'axios';

export default function ScheduledMessages() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const BASE_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:5000' 
    : (import.meta.env.VITE_API_BASE_URL || 'https://yz-almotakamel-backend.onrender.com');

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const fetchMessages = async () => {
    try {
      const res = await axios.get(`${BASE_URL}/api/schedule`);
      setMessages(res.data);
    } catch (err) {
      console.error('Failed to fetch scheduled messages:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('هل أنت متأكد من حذف هذه الرسالة المجدولة؟')) return;
    try {
      await axios.delete(`${BASE_URL}/api/schedule/${id}`);
      setMessages(messages.filter(m => m.id !== id));
    } catch (err) {
      alert('فشل في حذف الرسالة');
    }
  };

  const handleCancelAll = async () => {
    if (!window.confirm('هل أنت متأكد من إلغاء كافة الرسائل المجدولة قيد الانتظار؟')) return;
    try {
      setLoading(true);
      await axios.post(`${BASE_URL}/api/schedule/cancel-all`);
      fetchMessages();
      alert('تم إلغاء كافة الرسائل بنجاح');
    } catch (err) {
      console.error('Cancel all failed:', err);
      alert('فشل في إلغاء كافة الرسائل');
    } finally {
      setLoading(false);
    }
  };

  const filteredMessages = messages.filter(m => filterStatus === 'all' || m.status === filterStatus);

  const getStatusBadge = (status) => {
    switch (status) {
      case 'pending':
        return <span className="badge badge-warning" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={14} /> قيد الانتظار</span>;
      case 'sending':
        return <span className="badge badge-info" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><RefreshCw size={14} className="animate-spin" /> جاري الإرسال</span>;
      case 'sent':
        return <span className="badge badge-success" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><CheckCircle size={14} /> تم الإرسال</span>;
      case 'failed':
        return <span className="badge badge-danger" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><AlertCircle size={14} /> فشل</span>;
      default:
        return <span className="badge badge-secondary">{status}</span>;
    }
  };

  return (
    <div className="animate-fade-in-up">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1>جدولة الرسائل</h1>
          <p style={{ color: 'var(--text-secondary)' }}>إدارة ومتابعة الرسائل التي تم جدولتها للإرسال التلقائي.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          {messages.some(m => m.status === 'pending') && (
            <button className="btn-secondary" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={handleCancelAll} disabled={loading}>
              <Trash2 size={18} /> إلغاء الكل
            </button>
          )}
          <button className="btn-secondary" onClick={fetchMessages} disabled={loading}>
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} /> تحديث القائمة
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '1.5rem', overflowX: 'auto', paddingBottom: '5px' }}>
        {[
          { label: 'الكل', val: 'all' },
          { label: 'قيد الانتظار', val: 'pending' },
          { label: 'تم الإرسال', val: 'sent' },
          { label: 'فشل', val: 'failed' }
        ].map(tab => (
          <button 
            key={tab.val}
            onClick={() => setFilterStatus(tab.val)}
            style={{ 
              padding: '8px 16px', borderRadius: '10px', fontSize: '0.85rem', fontWeight: 600,
              background: filterStatus === tab.val ? 'var(--brand-primary)' : 'rgba(255,255,255,0.03)',
              color: filterStatus === tab.val ? '#fff' : 'var(--text-secondary)',
              border: '1px solid ' + (filterStatus === tab.val ? 'var(--brand-primary)' : 'var(--glass-border)')
            }}
          >
            {tab.label} ({tab.val === 'all' ? messages.length : messages.filter(m => m.status === tab.val).length})
          </button>
        ))}
      </div>

      <div className="glass-panel" style={{ padding: '0', overflow: 'hidden' }}>
        <div className="custom-scrollbar" style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'right' }}>المستلم</th>
                <th style={{ textAlign: 'right' }}>المحتوى</th>
                <th style={{ textAlign: 'right' }}>وقت الجدولة</th>
                <th style={{ textAlign: 'right' }}>الحالة</th>
                <th style={{ textAlign: 'right' }}>بواسطة</th>
                <th style={{ textAlign: 'right' }}>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filteredMessages.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
                    <Calendar size={40} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                    <p>لا توجد رسائل {filterStatus !== 'all' ? 'بهذه الحالة' : 'مجدولة حالياً'}</p>
                  </td>
                </tr>
              ) : (
                filteredMessages.map(msg => (
                  <tr key={msg.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{msg.phoneNumber}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{msg.fullJid || 'JID غير متوفر'}</div>
                    </td>
                    <td style={{ maxWidth: '300px' }}>
                      <div style={{ fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {msg.type === 'image' && <span style={{ color: 'var(--brand-secondary)', marginLeft: '5px' }}>[صورة]</span>}
                        {msg.message || 'بدون نص'}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.85rem' }}>
                        <Clock size={14} color="var(--brand-primary)" />
                        {new Date(msg.scheduledAt).toLocaleString('ar-SA')}
                      </div>
                    </td>
                    <td>{getStatusBadge(msg.status)}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.8rem' }}>
                        <User size={14} />
                        {msg.senderName || 'نظام'}
                      </div>
                    </td>
                    <td>
                      <button 
                        className="btn-secondary" 
                        onClick={() => handleDelete(msg.id)}
                        style={{ color: 'var(--danger)', padding: '5px' }}
                        title="حذف"
                        disabled={msg.status === 'sending'}
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
