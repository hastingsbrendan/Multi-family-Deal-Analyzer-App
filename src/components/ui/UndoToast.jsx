import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';

function UndoToast({message, onUndo, onDismiss}) {
  const [fading, setFading] = useState(false);
  useEffect(() => {
    const t1 = setTimeout(() => setFading(true), 4000);
    const t2 = setTimeout(() => onDismiss(), 5000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  return (
    <div style={{position:"fixed",bottom:20,left:"50%",transform:"translateX(-50%)",zIndex:9999,display:"flex",alignItems:"center",gap:12,background:"#1f2937",border:"1px solid #374151",borderRadius:10,padding:"12px 16px",boxShadow:"0 8px 24px rgba(0,0,0,0.4)",animation:fading?"fadeOut 1s ease forwards":"slideIn 0.3s ease",whiteSpace:"nowrap"}}>
      <span style={{fontSize:13,color:"#e5e7eb"}}>{message}</span>
      <button onClick={onUndo} style={{background:"var(--accent)",color:"#fff",border:"none",borderRadius:100,padding:"5px 12px",fontSize:12,fontWeight:800}}>Undo</button>
      <button onClick={onDismiss} style={{background:"none",border:"none",color:"#6b7280",fontSize:16,padding:"0 2px",lineHeight:1}}>✕</button>
    </div>
  );
}

// ─── PHOTO GALLERY ────────────────────────────────────────────────────────────

export default UndoToast;
