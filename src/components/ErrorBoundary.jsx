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
    console.error('[RentHack] Uncaught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--bg, #0f172a)', color: 'var(--text, #e2e8f0)',
          fontFamily: "'DM Sans','Segoe UI',sans-serif", padding: 24
        }}>
          <div style={{ textAlign: 'center', maxWidth: 420 }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Something went wrong</div>
            <div style={{ fontSize: 13, color: 'var(--muted, #94a3b8)', marginBottom: 20 }}>
              {this.state.error?.message || 'An unexpected error occurred.'}
            </div>
            <button
              onClick={() => { this.setState({ hasError: false, error: null }); }}
              style={{
                background: 'var(--accent, #0D9488)', color: '#fff', border: 'none',
                borderRadius: 100, padding: '10px 24px', fontSize: 14, fontWeight: 700,
                cursor: 'pointer', marginRight: 8
              }}>
              Try Again
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: 'none', border: '1px solid var(--border, #334155)',
                borderRadius: 100, padding: '10px 24px', fontSize: 14, fontWeight: 700,
                cursor: 'pointer', color: 'var(--text, #e2e8f0)'
              }}>
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
