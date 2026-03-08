import React from 'react';
import { useSubscription } from '../contexts/SubscriptionContext';

// ─── Stripe Checkout redirect ─────────────────────────────────────────────────
// Creates a Checkout Session via our Supabase Edge Function and redirects.
async function startCheckout(userEmail) {
  try {
    const resp = await fetch(
      'https://lxkwvayalxuoryuwxtsq.supabase.co/functions/v1/stripe-checkout',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: userEmail,
          price_id: 'price_1T8j9ARWpp7uVQEX1qENULX6',
          success_url: window.location.origin + '/?upgraded=true',
          cancel_url: window.location.href,
        }),
      }
    );
    const { url, error } = await resp.json();
    if (error) throw new Error(error);
    window.location.href = url;
  } catch (e) {
    alert('Could not start checkout. Please try again or contact support.');
    console.error('[RentHack] Checkout error:', e);
  }
}

// ─── Blur overlay wrapper ─────────────────────────────────────────────────────
// Wraps any content with a blur + upgrade card overlay when locked.
export function BlurGate({ feature, children, userEmail }) {
  const { limits } = useSubscription();
  const allowed = limits[feature] !== false;

  if (allowed) return children;

  return (
    <div style={{ position: 'relative' }}>
      {/* Blurred content underneath */}
      <div style={{ filter: 'blur(4px)', pointerEvents: 'none', userSelect: 'none', opacity: 0.6 }}>
        {children}
      </div>

      {/* Upgrade card overlay */}
      <div style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
      }}>
        <UpgradeCard userEmail={userEmail} />
      </div>
    </div>
  );
}

// ─── Upgrade card ─────────────────────────────────────────────────────────────
export function UpgradeCard({ userEmail, compact = false }) {
  const [loading, setLoading] = React.useState(false);

  async function handleUpgrade() {
    setLoading(true);
    await startCheckout(userEmail);
    setLoading(false);
  }

  if (compact) {
    return (
      <button
        onClick={handleUpgrade}
        disabled={loading}
        style={{
          background: 'var(--accent)',
          color: '#fff',
          border: 'none',
          borderRadius: 100,
          padding: '7px 16px',
          fontSize: 13,
          fontWeight: 700,
          cursor: loading ? 'wait' : 'pointer',
          fontFamily: 'inherit',
        }}
      >
        {loading ? 'Redirecting…' : '⚡ Upgrade — $9/mo'}
      </button>
    );
  }

  return (
    <div style={{
      background: 'var(--card)',
      border: '1px solid var(--border)',
      borderRadius: 16,
      padding: '28px 32px',
      textAlign: 'center',
      maxWidth: 340,
      width: '90%',
      boxShadow: '0 8px 40px rgba(0,0,0,0.15)',
    }}>
      <div style={{ fontSize: 32, marginBottom: 10 }}>🔒</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', marginBottom: 6, fontFamily: "'Fraunces', serif" }}>
        Your trial has ended
      </div>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20, lineHeight: 1.5 }}>
        Upgrade to keep access to PDF export, Rent Comps, Sensitivity analysis, and deal sharing.
      </div>
      <button
        onClick={handleUpgrade}
        disabled={loading}
        style={{
          background: 'var(--accent)',
          color: '#fff',
          border: 'none',
          borderRadius: 100,
          padding: '12px 28px',
          fontSize: 15,
          fontWeight: 800,
          cursor: loading ? 'wait' : 'pointer',
          width: '100%',
          fontFamily: 'inherit',
          letterSpacing: '-0.2px',
        }}
      >
        {loading ? 'Redirecting to checkout…' : '⚡ Upgrade — $9/mo'}
      </button>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10 }}>
        Cancel anytime · Secure checkout via Stripe
      </div>
    </div>
  );
}

// ─── Trial banner ─────────────────────────────────────────────────────────────
// Shows a soft reminder during the trial period.
export function TrialBanner({ userEmail }) {
  const { tier, daysLeft } = useSubscription();
  const [dismissed, setDismissed] = React.useState(false);

  if (tier !== 'trial' || dismissed || daysLeft === null) return null;

  const urgent = daysLeft <= 3;

  return (
    <div style={{
      background: urgent ? 'rgba(245,158,11,0.12)' : 'rgba(13,148,136,0.08)',
      border: `1px solid ${urgent ? 'rgba(245,158,11,0.4)' : 'rgba(13,148,136,0.25)'}`,
      borderRadius: 10,
      padding: '10px 16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      flexWrap: 'wrap',
      marginBottom: 16,
      fontSize: 13,
    }}>
      <span style={{ color: 'var(--text)', fontWeight: 600 }}>
        {urgent ? '⏰' : '✨'}{' '}
        {daysLeft === 0
          ? 'Your trial ends today'
          : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left in your free trial`}
      </span>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <UpgradeCard userEmail={userEmail} compact />
        <button
          onClick={() => setDismissed(true)}
          style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}
        >×</button>
      </div>
    </div>
  );
}

export default UpgradeCard;
