import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ 
          height: '100vh', 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center', 
          background: 'var(--bg-primary)',
          color: '#fff',
          padding: '2rem',
          textAlign: 'center',
          fontFamily: 'Cairo, sans-serif'
        }}>
          <h1 style={{ color: 'var(--danger)', fontSize: '3rem', marginBottom: '1rem' }}>عذراً، حدث خطأ غير متوقع ⚠️</h1>
          <p style={{ fontSize: '1.2rem', marginBottom: '2rem', opacity: 0.8 }}>نواجه مشكلة فنية حالياً. يرجى محاولة إعادة تحميل الصفحة.</p>
          <button 
            onClick={() => window.location.reload()} 
            className="btn-primary" 
            style={{ padding: '1rem 3rem' }}
          >
            إعادة تحميل المنصة
          </button>
          <pre style={{ 
            marginTop: '3rem', 
            padding: '1rem', 
            background: 'rgba(0,0,0,0.3)', 
            borderRadius: '12px', 
            fontSize: '0.8rem', 
            maxWidth: '100%', 
            overflow: 'auto',
            color: 'var(--text-secondary)'
          }}>
            {this.state.error?.toString()}
          </pre>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
