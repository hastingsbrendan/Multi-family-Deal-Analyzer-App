import React from 'react';
import * as Sentry from '@sentry/react';

// Detect stale-chunk errors that occur after a new deployment
const isChunkError = (err) => {
  const msg = err?.message || '';
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Loading chunk') ||
    msg.includes('ChunkLoadError') ||
    msg.includes('dynamically imported module')
  );
};

const hardReload = () => {
  // Navigate to current URL — forces browser to fetch fresh assets
  window.location.href = window.location.href; // eslint-disable-line no-self-assign
};

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
    Sentry.captureException(error, { contexts: { react: errorInfo } });
  }

  render() {
    if (this.state.hasError) {
      const chunkErr = isChunkError(this.state.error);

      if (this.props.compact) {
        return (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--muted)' }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>{chunkErr ? '🔄' : '⚠️'}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
              {chunkErr ? 'New version available' : 'This tab failed to load'}
            </div>
            <div style={{ fontSize: 12, marginBottom: 16 }}>
              {chunkErr
                ? 'RentHack was updated. Click below to reload the latest version.'
                : (this.state.error?.message || 'An unexpected error occurred.')}
            </div>
            <button
              onClick={chunkErr ? hardReload : () => this.setState({ hasError: false, error: null })}
              style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 100, padding: '7px 18px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              {chunkErr ? 'Reload App' : 'Try Again'}
            </button>
          </div>
        );
      }

      return (
        <div style={{
          minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--bg, #0f172a)', color: 'var(--text, #e2e8f0)',
          fontFamily: "'DM Sans','Segoe UI',sans-serif", padding: 24
        }}>
          <div style={{ textAlign: 'center', maxWidth: 420 }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>{chunkErr ? '🔄' : '⚠️'}</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
              {chunkErr ? 'New version available' : 'Something went wrong'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted, #94a3b8)', marginBottom: 20 }}>
              {chunkErr
                ? 'RentHack was updated since you last loaded the page. Click below to get the latest version.'
                : (this.state.error?.message || 'An unexpected error occurred.')}
            </div>
            <button
              onClick={chunkErr ? hardReload : () => this.setState({ hasError: false, error: null })}
              style={{
                background: 'var(--accent, #0D9488)', color: '#fff', border: 'none',
                borderRadius: 100, padding: '10px 24px', fontSize: 14, fontWeight: 700,
                cursor: 'pointer', marginRight: 8
              }}>
              {chunkErr ? 'Reload App' : 'Try Again'}
            </button>
            {!chunkErr && (
              <button
                onClick={() => window.location.reload()}
                style={{
                  background: 'none', border: '1px solid var(--border, #334155)',
                  borderRadius: 100, padding: '10px 24px', fontSize: 14, fontWeight: 700,
                  cursor: 'pointer', color: 'var(--text, #e2e8f0)'
                }}>
                Reload Page
              </button>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
