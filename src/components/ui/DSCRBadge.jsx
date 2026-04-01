import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';

function DSCRBadge({dscr}){
  const c = dscr>=1.25 ? "var(--green)" : dscr>=1.2 ? "var(--accent2)" : "var(--red)";
  const bg = dscr>=1.25 ? "rgba(16,185,129,0.13)" : dscr>=1.2 ? "rgba(217,119,6,0.13)" : "rgba(239,68,68,0.13)";
  const border = dscr>=1.25 ? "rgba(16,185,129,0.35)" : dscr>=1.2 ? "rgba(217,119,6,0.35)" : "rgba(239,68,68,0.35)";
  return <span style={{background:bg,color:c,border:`1px solid ${border}`,borderRadius:6,padding:"3px 8px",fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>{dscr.toFixed(2)}x {dscr>=1.25?"✓":dscr>=1.2?"~":"✗"}</span>;
}

export default DSCRBadge;
