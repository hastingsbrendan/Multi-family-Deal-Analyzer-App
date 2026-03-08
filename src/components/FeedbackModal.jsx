import React, { useState } from 'react';

const CATEGORIES = ['Bug report', 'Feature request', 'General feedback', 'Question'];

export function FeedbackModal({ user, onClose }) {
  const [category, setCategory] = useState('General feedback');
  const [message, setMessage]   = useState('');
  const [status, setStatus]     = useState('idle'); // idle | sending | done | error

  async function handleSubmit() {
    if (!message.trim()) return;
    setStatus('sending');
    try {
      await fetch('https://lxkwvayalxuoryuwxtsq.supabase.co/functions/v1/submit-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email:    user?.email || 'anonymous',
          name:     user?.user_metadata?.display_name || '',
          category,
          message:  message.trim(),
          url:      window.location.href,
          ts:       new Date().toISOString(),
        }),
      });
      setStatus('done');
    } catch (e) {
      console.error('[FeedbackModal]', e);
      setStatus('error');
    }
  }

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:1000,
      background:'rgba(0,0,0,0.45)', backdropFilter:'blur(4px)',
      display:'flex', alignItems:'center', justifyContent:'center',
      padding:16,
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background:'var(--card)', borderRadius:16, padding:28,
        width:'100%', maxWidth:440,
        boxShadow:'0 12px 48px rgba(0,0,0,0.2)',
        border:'1px solid var(--border)',
      }}>
        {status === 'done' ? (
          <div style={{textAlign:'center', padding:'12px 0'}}>
            <div style={{fontSize:36, marginBottom:12}}>🙏</div>
            <div style={{fontSize:17, fontWeight:800, color:'var(--text)', marginBottom:8, fontFamily:"'Fraunces',serif"}}>
              Thanks for the feedback!
            </div>
            <div style={{fontSize:13, color:'var(--muted)', marginBottom:20}}>
              Every message is read. It genuinely helps make RentHack better.
            </div>
            <button onClick={onClose} style={{
              background:'var(--accent)', color:'#fff', border:'none',
              borderRadius:100, padding:'10px 24px', fontSize:14,
              fontWeight:700, cursor:'pointer', fontFamily:'inherit',
            }}>Done</button>
          </div>
        ) : (
          <>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20}}>
              <div style={{fontSize:16, fontWeight:800, color:'var(--text)', fontFamily:"'Fraunces',serif"}}>
                Send Feedback
              </div>
              <button onClick={onClose} style={{background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:20, padding:'0 4px', lineHeight:1}}>×</button>
            </div>

            {/* Category pills */}
            <div style={{display:'flex', gap:6, flexWrap:'wrap', marginBottom:14}}>
              {CATEGORIES.map(c => (
                <button key={c} onClick={() => setCategory(c)} style={{
                  background: category === c ? 'var(--accent)' : 'var(--bg)',
                  color:      category === c ? '#fff' : 'var(--muted)',
                  border:     `1px solid ${category === c ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius:100, padding:'5px 12px', fontSize:12,
                  fontWeight:600, cursor:'pointer', fontFamily:'inherit',
                  transition:'all 0.15s',
                }}>{c}</button>
              ))}
            </div>

            {/* Message */}
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="What's on your mind? Be as specific as you like..."
              rows={5}
              style={{
                width:'100%', boxSizing:'border-box',
                background:'var(--bg)', border:'1px solid var(--border)',
                borderRadius:10, padding:'10px 12px',
                color:'var(--text)', fontSize:13, fontFamily:'inherit',
                resize:'vertical', outline:'none', lineHeight:1.5,
              }}
            />

            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:14, gap:10}}>
              <div style={{fontSize:11, color:'var(--muted)'}}>
                Sending as {user?.email || 'anonymous'}
              </div>
              <button
                onClick={handleSubmit}
                disabled={!message.trim() || status === 'sending'}
                style={{
                  background: message.trim() ? 'var(--accent)' : 'var(--border)',
                  color: message.trim() ? '#fff' : 'var(--muted)',
                  border:'none', borderRadius:100, padding:'10px 22px',
                  fontSize:13, fontWeight:700, cursor: message.trim() ? 'pointer' : 'default',
                  fontFamily:'inherit', transition:'all 0.15s',
                }}
              >
                {status === 'sending' ? 'Sending…' : status === 'error' ? 'Try again' : 'Send'}
              </button>
            </div>
            {status === 'error' && (
              <div style={{fontSize:12, color:'#ef4444', marginTop:8}}>
                Something went wrong. Please try again.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default FeedbackModal;
