import React from 'react';

// Standardized empty/zero-state. Use for: no deals, no rents, no comps, no photos, etc.
// Usage:
//   <EmptyState icon="🏘" title="No deals yet"
//               body="Tap + New Deal to get started."
//               primary={{label: '+ New Deal', onClick: handleAdd}}
//               secondary={{label: 'Try a sample deal →', onClick: handleSample}}/>

function EmptyState({icon, title, body, primary, secondary, dashed, padding, children}) {
  return (
    <div style={{
      background: 'var(--card)',
      border: (dashed ? '2px dashed ' : '1px solid ') + 'var(--border)',
      borderRadius: 'var(--r-lg)',
      padding: padding || '32px 24px',
      textAlign: 'center',
    }}>
      {icon && <div style={{fontSize: 40, marginBottom: 12, lineHeight: 1}}>{icon}</div>}
      {title && (
        <div style={{
          fontSize: 'var(--text-md)',
          fontWeight: 800,
          color: 'var(--text)',
          marginBottom: 8,
          fontFamily: "'Fraunces', serif",
        }}>{title}</div>
      )}
      {body && (
        <div style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--muted)',
          marginBottom: (primary || secondary) ? 16 : 0,
          maxWidth: 360,
          margin: (primary || secondary) ? '0 auto 16px' : '0 auto',
          lineHeight: 1.5,
        }}>{body}</div>
      )}
      {(primary || secondary) && (
        <div style={{display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap'}}>
          {primary && (
            <button onClick={primary.onClick} style={{
              background: 'var(--accent)', color: '#fff', border: 'none',
              borderRadius: 'var(--r-pill)', padding: '8px 18px',
              fontSize: 'var(--text-sm)', fontWeight: 800, cursor: 'pointer',
              fontFamily: 'inherit',
            }}>{primary.label}</button>
          )}
          {secondary && (
            <button onClick={secondary.onClick} style={{
              background: 'var(--card)', color: 'var(--accent)',
              border: '1px solid var(--accent)',
              borderRadius: 'var(--r-pill)', padding: '8px 18px',
              fontSize: 'var(--text-sm)', fontWeight: 700, cursor: 'pointer',
              fontFamily: 'inherit',
            }}>{secondary.label}</button>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

export default EmptyState;
