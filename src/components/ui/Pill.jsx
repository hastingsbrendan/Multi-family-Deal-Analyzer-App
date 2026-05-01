import React from 'react';

// Compact rounded label — used for status, tags, badges.
// Variants: 'accent' | 'muted' | 'success' | 'warning' | 'danger' | 'oo' | 'va'
// Or pass a custom color hex/var via `color` prop.
const VARIANT_COLORS = {
  accent:  { bg: 'var(--accent-soft)',          fg: 'var(--accent)' },
  muted:   { bg: 'var(--bg2)',                  fg: 'var(--muted)' },
  success: { bg: 'rgba(16,185,129,0.12)',       fg: 'var(--green)' },
  warning: { bg: 'rgba(245,158,11,0.12)',       fg: 'var(--refi-amber)' },
  danger:  { bg: 'rgba(239,68,68,0.12)',        fg: 'var(--red)' },
  oo:      { bg: 'rgba(124,58,237,0.10)',       fg: 'var(--oo-violet)' },
  va:      { bg: 'rgba(167,139,250,0.12)',      fg: 'var(--va-purple)' },
};

function Pill({children, variant = 'accent', color, bg, size = 'sm', style}) {
  const v = VARIANT_COLORS[variant] || VARIANT_COLORS.accent;
  const fg = color || v.fg;
  const background = bg || v.bg;
  const fontSize = size === 'xs' ? 10 : size === 'md' ? 12 : 11;
  return (
    <span style={{
      fontSize,
      fontWeight: 700,
      background,
      color: fg,
      borderRadius: 'var(--r-sm)',
      padding: '3px 9px',
      whiteSpace: 'nowrap',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      ...style,
    }}>
      {children}
    </span>
  );
}

export default Pill;
