import React from 'react';

// Score badge for loan recommendation engine — 0=Not Eligible, 3=Possible, 4=Strong Match, 5=Best Match
function ScoreBadge({ score }) {
  if (score === 0) return <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', background: 'var(--bg2)', borderRadius: 20, padding: '2px 8px' }}>Not Eligible</span>;
  const color = score >= 4 ? 'var(--green)' : score >= 3 ? 'var(--refi-amber)' : '#94a3b8';
  const bg    = score >= 4 ? 'rgba(16,185,129,0.1)' : score >= 3 ? 'rgba(245,158,11,0.1)' : 'rgba(148,163,184,0.1)';
  const label = score === 5 ? 'Best Match' : score === 4 ? 'Strong Match' : score === 3 ? 'Possible' : 'Borderline';
  return <span style={{ fontSize: 11, fontWeight: 700, color, background: bg, borderRadius: 20, padding: '2px 8px', border: `1px solid ${color}33` }}>{label}</span>;
}

export default ScoreBadge;
