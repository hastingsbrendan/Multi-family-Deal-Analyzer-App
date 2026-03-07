import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';

function CFSectionHeader({label}){return(<tr><td colSpan={11} style={{padding:"16px 10px 6px",fontSize:11,fontWeight:800,letterSpacing:"0.1em",color:"var(--accent)",textTransform:"uppercase",borderBottom:"2px solid var(--accent)"}}>{label}</td></tr>);}

// ─── UNDO TOAST ───────────────────────────────────────────────────────────────

export default CFSectionHeader;
