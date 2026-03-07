import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';

function DSCRBadge({dscr}){const c=dscr>=1.25?"#10b981":dscr>=1.2?"#f59e0b":"#ef4444";return <span style={{background:c+"22",color:c,border:`1px solid ${c}55`,borderRadius:6,padding:"3px 8px",fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>{dscr.toFixed(2)}x {dscr>=1.25?"✓":dscr>=1.2?"~":"✗"}</span>;}

export default DSCRBadge;
