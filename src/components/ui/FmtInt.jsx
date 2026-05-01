import React from 'react';

export default function FmtInt({value, onChange, placeholder, style}) {
  const [focused, setFocused] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const raw = Math.round(+value || 0);
  const display = focused ? draft : (raw ? raw.toLocaleString() : '');
  return (
    <input
      type="text"
      inputMode="numeric"
      value={display}
      placeholder={placeholder}
      onFocus={()=>{ setFocused(true); setDraft(raw ? String(raw) : ''); }}
      onBlur={()=>{ setFocused(false); const n = parseInt(draft.replace(/,/g,''),10); onChange(isNaN(n)?0:n); }}
      onChange={e=>{ setDraft(e.target.value.replace(/[^0-9]/g,'')); }}
      style={style}/>
  );
}
