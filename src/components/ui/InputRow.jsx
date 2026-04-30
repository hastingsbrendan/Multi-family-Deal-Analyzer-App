import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Tip from './Tip';

const iSty={width:"100%",background:"var(--input-bg)",border:"1.5px solid var(--border)",borderRadius:"var(--r-md)",padding:"9px 12px",color:"var(--text)",fontSize:"var(--text-base)",WebkitAppearance:"none",appearance:"none"};
const srcSty={...iSty,color:"var(--muted)",fontSize:"var(--text-sm)"};
const btnSm={background:"var(--accent)",color:"#fff",border:"none",borderRadius:"var(--r-pill)",width:30,height:30,cursor:"pointer",fontSize:"var(--text-md)",fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0};

// Format a number with commas for display; suppress zero (show blank instead)

import { useIsMobile } from '../../lib/hooks';

function fmtInputDisplay(value) {
  const n = parseFloat(String(value).replace(/,/g,""));
  if (isNaN(n) || n === 0) return "";
  // If it's a whole number show no decimal; otherwise preserve up to 3 decimals
  return Number.isInteger(n) ? n.toLocaleString() : parseFloat(n.toFixed(3)).toLocaleString();
}
// Strip commas before passing back to state
function parseInputValue(str) {
  return str.replace(/,/g,"");
}

function InputRow({label,value,onChange,type="number",prefix,suffix,tip}){
  const isMobile=useIsMobile();
  const [focused,setFocused]=useState(false);
  const isNumeric = type==="number";
  const displayVal = isNumeric
    ? (focused ? (String(value)==="0"||value===0?"":String(value).replace(/,/g,"")) : fmtInputDisplay(value))
    : value;
  const handleChange = e => onChange(isNumeric ? parseInputValue(e.target.value) : e.target.value);
  const inputEl = (mobile) => (
    <input
      type="text"
      inputMode={isNumeric?"decimal":"text"}
      value={displayVal}
      onChange={handleChange}
      onFocus={()=>setFocused(true)}
      onBlur={()=>setFocused(false)}
      placeholder={isNumeric?"0":""}
      style={{...iSty,fontSize:14}}
    />
  );
  if(isMobile){return(<div style={{padding:"10px 0",borderBottom:"1px solid var(--border-faint)"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}><label style={{fontSize:13,color:"var(--muted)",fontWeight:600,display:"flex",alignItems:"center"}}>{label}{tip&&<Tip text={tip}/>}</label></div><div style={{display:"flex",alignItems:"center",gap:4}}>{prefix&&<span style={{fontSize:13,color:"var(--muted)",whiteSpace:"nowrap",flexShrink:0}}>{prefix}</span>}{inputEl(true)}{suffix&&<span style={{fontSize:12,color:"var(--muted)",whiteSpace:"nowrap",flexShrink:0,marginLeft:2}}>{suffix}</span>}</div></div>);}
  return(<div style={{display:"grid",gridTemplateColumns:"200px 1fr",gap:8,alignItems:"center",padding:"5px 0",borderBottom:"1px solid var(--border-faint)"}}><label style={{fontSize:13,color:"var(--muted)",fontWeight:500,display:"flex",alignItems:"center"}}>{label}{tip&&<Tip text={tip}/>}</label><div style={{display:"flex",alignItems:"center",gap:4}}>{prefix&&<span style={{fontSize:13,color:"var(--muted)",whiteSpace:"nowrap"}}>{prefix}</span>}{inputEl(false)}{suffix&&<span style={{fontSize:13,color:"var(--muted)",whiteSpace:"nowrap"}}>{suffix}</span>}</div></div>);
}

export { fmtInputDisplay, parseInputValue, iSty, srcSty, btnSm, Tip };
export default InputRow;
