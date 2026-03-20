// DisclaimerModal — shown once on first login when disclaimer_ack_at is not set.
// Cannot be dismissed by clicking outside — user must click "I Understand".
// Stores acknowledgment timestamp in Supabase user_metadata via authUpdateProfile().

import React, { useState } from 'react';
import { authUpdateProfile } from '../lib/constants';

function DisclaimerModal({ user, onAcknowledged }) {
  const [loading, setLoading] = useState(false);

  const handleAck = async () => {
    setLoading(true);
    await authUpdateProfile({ disclaimer_ack_at: new Date().toISOString() });
    setLoading(false);
    onAcknowledged();
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.72)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '16px',
    }}>
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: 18, padding: '36px 32px', maxWidth: 480, width: '100%',
        boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
      }}>
        {/* Icon */}
        <div style={{
          width: 52, height: 52, borderRadius: 14,
          background: 'rgba(13,148,136,0.1)', border: '1.5px solid rgba(13,148,136,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 26, marginBottom: 20,
        }}>📊</div>

        {/* Heading */}
        <div style={{
          fontFamily: "'Fraunces', serif", fontWeight: 900,
          fontSize: 22, letterSpacing: '-0.3px', marginBottom: 10,
          color: 'var(--text)',
        }}>
          Before you start
        </div>

        {/* Body */}
        <div style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.65, marginBottom: 20 }}>
          RentHack is a <strong style={{ color: 'var(--text)' }}>financial projection tool</strong> built to help you analyze multifamily real estate deals. Please keep the following in mind:
        </div>

        <div style={{
          background: 'var(--bg2)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '14px 16px', marginBottom: 24,
        }}>
          {[
            'All projections are estimates based on the assumptions you enter — not guarantees.',
            'RentHack does not provide financial, investment, legal, or tax advice.',
            'Consult a licensed professional before making any investment decision.',
            'Real estate investing involves significant risk, including loss of capital.',
          ].map((item, i) => (
            <div key={i} style={{
              display: 'flex', gap: 10, alignItems: 'flex-start',
              paddingBottom: i < 3 ? 10 : 0, marginBottom: i < 3 ? 10 : 0,
              borderBottom: i < 3 ? '1px solid var(--border-faint)' : 'none',
            }}>
              <span style={{ color: 'var(--accent)', fontSize: 13, marginTop: 1, flexShrink: 0 }}>✓</span>
              <span style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>{item}</span>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 24, lineHeight: 1.5 }}>
          By clicking below, you acknowledge that you have read and understood this disclaimer.
          View our full{' '}
          <a href="/legal/tos.html" target="_blank" style={{ color: 'var(--accent)' }}>Terms of Service</a>
          {' '}and{' '}
          <a href="/legal/privacy.html" target="_blank" style={{ color: 'var(--accent)' }}>Privacy Policy</a>.
        </div>

        <button
          onClick={handleAck}
          disabled={loading}
          style={{
            width: '100%', padding: '14px',
            background: loading ? 'var(--border)' : 'var(--accent)',
            color: '#fff', border: 'none', borderRadius: 100,
            fontSize: 15, fontWeight: 700, cursor: loading ? 'default' : 'pointer',
            fontFamily: 'inherit', transition: 'background 0.15s',
          }}
        >
          {loading ? 'Saving…' : 'I Understand — Take me to my deals'}
        </button>
      </div>
    </div>
  );
}

export default DisclaimerModal;
