import React from 'react';

// Inline tooltip icon with hover/tap popover.
// Usage: <Tip text="Plain-English explanation of this field." />
// Keyboard: focusable, opens on focus, Enter/Space toggles, Escape closes; screen
// readers get the text via aria-describedby (it was hover-only; 2026-11, M9e).
function Tip({text}) {
  const [open, setOpen] = React.useState(false);
  const id = React.useId();
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label="More info"
      aria-describedby={open ? id : undefined}
      aria-expanded={open}
      style={{position:'relative',display:'inline-flex',alignItems:'center',marginLeft:4,flexShrink:0}}
      onMouseEnter={()=>setOpen(true)}
      onMouseLeave={()=>setOpen(false)}
      onFocus={()=>setOpen(true)}
      onBlur={()=>setOpen(false)}
      onKeyDown={e=>{ if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();setOpen(v=>!v);} else if(e.key==='Escape') setOpen(false); }}
      onClick={e=>{e.stopPropagation();setOpen(v=>!v);}}
    >
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{color:'var(--muted)',display:'block',cursor:'help'}}>
        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
        <text x="8" y="12" textAnchor="middle" fontSize="10" fill="currentColor" fontWeight="700">?</text>
      </svg>
      {open && (
        <span id={id} role="tooltip" style={{
          position:'absolute',bottom:'calc(100% + 6px)',left:'50%',transform:'translateX(-50%)',
          background:'var(--card)',border:'1px solid var(--border)',borderRadius:'var(--r-md)',
          padding:'8px 11px',width:230,zIndex:9999,
          boxShadow:'var(--shadow-md)',pointerEvents:'none',
          fontSize:'var(--text-xs)',color:'var(--text)',lineHeight:1.55,fontWeight:400,whiteSpace:'normal',display:'block',
        }}>
          {text}
        </span>
      )}
    </span>
  );
}

export default Tip;
export { Tip };
