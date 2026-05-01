import React from 'react';

// Label/value pair with optional bottom-border. Drop-in for the inline KV
// helpers that used to live inside DealSummaryTab and other tabs.
function KeyValue({label, value, color, bold, last, tip}) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      padding: '5px 0',
      borderBottom: last ? 'none' : '1px solid var(--border)',
    }}>
      <span style={{fontSize: 'var(--text-xs)', color: 'var(--muted)', display:'flex', alignItems:'center'}}>
        {label}{tip}
      </span>
      <span style={{fontSize: 'var(--text-sm)', fontWeight: bold ? 800 : 700, color: color || 'var(--text)'}}>
        {value}
      </span>
    </div>
  );
}

export default KeyValue;
