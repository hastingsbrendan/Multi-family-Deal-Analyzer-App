import React from 'react';

// Inline tooltip icon with hover/tap popover.
// Usage: <Tip text="Plain-English explanation of this field." />
function Tip({text}) {
  const [open, setOpen] = React.useState(false);
  return (
    <span
      style={{position:'relative',display:'inline-flex',alignItems:'center',marginLeft:4,flexShrink:0}}
      onMouseEnter={()=>setOpen(true)}
      onMouseLeave={()=>setOpen(false)}
      onClick={e=>{e.stopPropagation();setOpen(v=>!v);}}
    >
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{color:'var(--muted)',display:'block',cursor:'help'}}>
        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
        <text x="8" y="12" textAnchor="middle" fontSize="10" fill="currentColor" fontWeight="700">?</text>
      </svg>
      {open && (
        <span style={{
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
