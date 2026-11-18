import React from 'react';

// RentHack mark: the same house glyph as public/favicon.svg, drawn in SVG so it looks
// identical on every OS (the 🏠 emoji rendered differently everywhere).
function LogoMark({ size = 28, radius = 8 }) {
  return (
    <span aria-hidden="true" style={{ width: size, height: size, borderRadius: radius, background: 'var(--accent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 64 64">
        <path d="M32 13 11 30h6v20h11V38h8v12h11V30h6z" fill="#fff" />
      </svg>
    </span>
  );
}

export default LogoMark;
