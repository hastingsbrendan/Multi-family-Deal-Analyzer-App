import React, { useState } from 'react';

export default function CollapsibleSection({ title, defaultOpen = false, children, badge }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          background: 'none', border: 'none', cursor: 'pointer', padding: '12px 0 8px',
          borderBottom: open ? 'none' : '1px solid var(--border-faint)',
          marginBottom: open ? 0 : 8,
        }}
      >
        <span style={{ fontWeight: 800, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--accent)', borderLeft: '3px solid var(--accent)', paddingLeft: 8, fontFamily: 'system-ui' }}>{title}</span>
        {badge && <span style={{ fontSize: 10, fontWeight: 700, background: 'var(--accent-soft)', color: 'var(--accent)', borderRadius: 100, padding: '1px 7px' }}>{badge}</span>}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>{open ? '▲ Hide' : '▼ Show'}</span>
      </button>
      {open && <div style={{ paddingBottom: 8 }}>{children}</div>}
    </div>
  );
}
