import React from 'react';

// Eyebrow-style section heading with left accent bar.
// Drop-in for the inlined `SubHdr` helpers in DealSummaryTab/AssumptionsTab/etc.
// Usage: <SectionHeader>Profitability</SectionHeader>
//        <SectionHeader badge="3">Open Flags</SectionHeader>
function SectionHeader({children, badge, action, style}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8,
      marginTop: 4,
      ...style,
    }}>
      <span style={{
        fontSize: 'var(--text-xs)',
        fontWeight: 800,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: 'var(--accent)',
        borderLeft: '3px solid var(--accent)',
        paddingLeft: 8,
      }}>{children}</span>
      {badge != null && (
        <span style={{
          fontSize: 10,
          fontWeight: 700,
          background: 'var(--accent-soft)',
          color: 'var(--accent)',
          borderRadius: 'var(--r-pill)',
          padding: '1px 7px',
        }}>{badge}</span>
      )}
      {action && <span style={{marginLeft: 'auto'}}>{action}</span>}
    </div>
  );
}

export default SectionHeader;
