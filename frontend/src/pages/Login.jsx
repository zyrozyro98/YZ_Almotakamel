import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, User, Lock, AlertCircle, ShieldCheck } from 'lucide-react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMSG, setErrorMSG] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorMSG('');
    setIsLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      console.error(err);
      setErrorMSG('البريد الإلكتروني أو كلمة المرور غير صحيحة.');
      setIsLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1.5rem',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Dynamic Background Blurs */}
      <div style={{
        position: 'absolute', width: '50vw', height: '50vw',
        background: 'radial-gradient(circle, var(--brand-primary) 0%, transparent 70%)',
        top: '-20%', right: '-10%', opacity: 0.1, filter: 'blur(80px)', zIndex: 0
      }}></div>
      <div style={{
        position: 'absolute', width: '40vw', height: '40vw',
        background: 'radial-gradient(circle, var(--brand-secondary) 0%, transparent 70%)',
        bottom: '-10%', left: '-10%', opacity: 0.1, filter: 'blur(80px)', zIndex: 0
      }}></div>
      
      <div className="glass-panel animate-fade-in-up" style={{
        width: '100%',
        maxWidth: '460px',
        padding: '3.5rem 2.5rem',
        textAlign: 'center',
        position: 'relative',
        zIndex: 10,
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
      }}>
        <div style={{
          width: '84px', height: '84px',
          background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-secondary))',
          borderRadius: '24px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 2rem',
          boxShadow: '0 10px 40px rgba(59, 130, 246, 0.4)',
          transform: 'rotate(-5deg)'
        }}>
          <ShieldCheck size={44} color="#fff" />
        </div>
        
        <h1 style={{ marginBottom: '0.75rem', fontSize: '2.2rem', fontWeight: 800, background: 'linear-gradient(to left, #fff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>دبلومالاين</h1>
        <p style={{ marginBottom: '2.5rem', color: 'var(--text-secondary)', fontSize: '1.05rem', fontWeight: 500 }}>نظام الإدارة الإلكتروني المتكامل</p>

        <form onSubmit={handleLogin} className="flex-col gap-5">
          
          {errorMSG && (
            <div className="animate-fade-in-up" style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '1rem', borderRadius: '12px', color: 'var(--danger)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.75rem', textAlign: 'right' }}>
              <AlertCircle size={20} /> 
              <span>{errorMSG}</span>
            </div>
          )}

          <div style={{ textAlign: 'right' }}>
            <label className="input-label">البريد الإلكتروني</label>
            <div style={{ position: 'relative' }}>
              <User size={20} color="var(--text-secondary)" style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
              <input 
                type="email" 
                className="input-base" 
                style={{ paddingRight: '2.8rem' }}
                placeholder="اسم المستخدم أو البريد"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <label className="input-label">كلمة المرور</label>
            <div style={{ position: 'relative' }}>
              <Lock size={20} color="var(--text-secondary)" style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
              <input 
                type="password" 
                className="input-base" 
                style={{ paddingRight: '2.8rem' }}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <button type="submit" className="btn-primary w-full" style={{ marginTop: '1rem', padding: '1rem' }} disabled={isLoading}>
            {isLoading ? 'جاري الدخول...' : (
              <>
                <LogIn size={20} />
                تسجيل الدخول للنظام
              </>
            )}
          </button>
        </form>

        <div style={{ marginTop: '2.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--glass-border)', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          <p>© 2026 جميع الحقوق محفوظة لشركة دبلومالاين</p>
        </div>
      </div>
    </div>
  );
}
