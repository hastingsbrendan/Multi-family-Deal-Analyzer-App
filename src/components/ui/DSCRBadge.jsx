import React from 'react';
import { rate } from '../../lib/benchmarks';

// Colours follow the shared benchmarks (good at or above the user's DSCR floor,
// borderline from 1.0x), the same cut-offs Red Flags uses.
const STYLE = {
  good: { c: 'var(--green)',   bg: 'rgba(16,185,129,0.13)', border: 'rgba(16,185,129,0.35)', mark: '✓' },
  ok:   { c: 'var(--accent2)', bg: 'rgba(217,119,6,0.13)',  border: 'rgba(217,119,6,0.35)',  mark: '~' },
  weak: { c: 'var(--red)',     bg: 'rgba(239,68,68,0.13)',  border: 'rgba(239,68,68,0.35)',  mark: '✗' },
};

function DSCRBadge({ dscr, prefs }) {
  const s = STYLE[rate('dscr', dscr, prefs) || 'weak'];
  return <span style={{background:s.bg,color:s.c,border:`1px solid ${s.border}`,borderRadius:6,padding:"3px 8px",fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>{dscr.toFixed(2)}x {s.mark}</span>;
}

export default DSCRBadge;
