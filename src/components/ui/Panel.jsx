import React from 'react';

// Card-style container — border + radius + optional accent stripe + optional elevation
// Usage: <Panel accent>...</Panel>  /  <Panel elevation="md">...</Panel>
function Panel({children, accent, elevation, padding, style}) {
  const shadow = elevation === 'sm' ? 'var(--shadow-sm)'
               : elevation === 'md' ? 'var(--shadow-md)'
               : elevation === 'lg' ? 'var(--shadow-lg)'
               : elevation === 'xl' ? 'var(--shadow-xl)'
               : undefined;
  return (
    <div style={{
      background: 'var(--card)',
      border: '1px solid ' + (accent ? 'rgba(13,148,136,0.25)' : 'var(--border)'),
      borderRadius: 'var(--r-lg)',
      padding: padding || '14px 14px',
      borderTop: accent ? '2px solid var(--accent)' : undefined,
      boxShadow: shadow,
      ...style,
    }}>
      {children}
    </div>
  );
}

export default Panel;
