import React from 'react';

// Standardized loading state. Replaces the various ad-hoc "Loading…" snippets.
// Usage: <Spinner/>  or  <Spinner label="Fetching market data…"/>
//        <Spinner inline/>  for in-flow placement
function Spinner({ label = 'Loading…', inline = false, fullPage = false }) {
  if (fullPage) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--muted)', fontSize: 14 }}>
          <Dot/><span>{label}</span>
        </div>
      </div>
    );
  }
  if (inline) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--muted)', fontSize: 12 }}>
        <Dot/>{label}
      </span>
    );
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '20px 0', color: 'var(--muted)', fontSize: 13 }}>
      <Dot/>{label}
    </div>
  );
}

function Dot() {
  return (
    <span aria-hidden="true" style={{
      display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
      border: '2px solid var(--accent-soft)', borderTopColor: 'var(--accent)',
      animation: 'rh-spin 0.7s linear infinite',
    }}/>
  );
}

export default Spinner;
