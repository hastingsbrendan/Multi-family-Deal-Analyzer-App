import React from 'react';

// Slim progress bar — 0..total-1 indices fill width 1/total..1.
function ProgressBar({ current, total }) {
  return (
    <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{
        height: '100%', borderRadius: 2,
        background: 'var(--accent)',
        width: `${((current + 1) / total) * 100}%`,
        transition: 'width 0.35s ease',
      }} />
    </div>
  );
}

export default ProgressBar;
