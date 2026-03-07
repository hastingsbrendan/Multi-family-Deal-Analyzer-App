import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { FMT_USD, FMT_PCT } from '../lib/constants';
import { calcDeal, calcSensitivity } from '../lib/calc';

function SensitivityTab({deal}){
  const [metric,setMetric]=useState("irr");
  const sens=useMemo(()=>calcSensitivity(deal),[deal]);
  const base=useMemo(()=>calcDeal(deal),[deal]);
  const baseVal=metric==="irr"?base.irr:base.cocReturn;
  const sorted=useMemo(()=>[...sens].sort((a,b)=>{const rA=Math.abs((metric==="irr"?a.irrLowDelta:a.cocLowDelta)-(metric==="irr"?a.irrHighDelta:a.cocHighDelta));const rB=Math.abs((metric==="irr"?b.irrLowDelta:b.cocLowDelta)-(metric==="irr"?b.irrHighDelta:b.cocHighDelta));return rB-rA;}),[sens,metric]);
  const maxDelta=Math.max(...sorted.flatMap(s=>[Math.abs(metric==="irr"?s.irrLowDelta:s.cocLowDelta),Math.abs(metric==="irr"?s.irrHighDelta:s.cocHighDelta)]),0.001);
  const BAR_PCT=36;
  return(<div style={{padding:"16px 0"}}>
    <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:20,flexWrap:"wrap"}}>
      <span style={{fontSize:13,color:"var(--muted)",fontWeight:600}}>Metric:</span>
      {[["irr","IRR (10yr)"],["coc","CoC (Yr1)"]].map(([k,lbl])=>(<button key={k} onClick={()=>setMetric(k)} style={{padding:"7px 14px",borderRadius:6,border:"1px solid var(--border)",background:metric===k?"var(--accent)":"var(--card)",color:metric===k?"#fff":"var(--text)",cursor:"pointer",fontSize:13,fontWeight:700}}>{lbl}</button>))}
      <span style={{fontSize:13,color:"var(--muted)"}}>Base: <strong style={{color:"var(--text)"}}>{FMT_PCT(baseVal)}</strong></span>
    </div>
    <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,padding:"20px 16px"}}>
      <div style={{fontSize:11,fontWeight:800,letterSpacing:"0.1em",color:"var(--muted)",marginBottom:16,textTransform:"uppercase"}}>Tornado Chart — {metric==="irr"?"10-Year IRR":"Year 1 CoC"}</div>
      <div style={{display:"grid",gridTemplateColumns:"90px 1fr",gap:0,marginBottom:6}}><div/><div style={{display:"grid",gridTemplateColumns:"1fr 1px 1fr"}}><div style={{textAlign:"center",fontSize:10,fontWeight:700,color:"#ef4444",paddingBottom:4,borderBottom:"1px solid var(--border-faint)"}}>↙ Downside</div><div/><div style={{textAlign:"center",fontSize:10,fontWeight:700,color:"#10b981",paddingBottom:4,borderBottom:"1px solid var(--border-faint)"}}>Upside ↗</div></div></div>
      {sorted.map((s,i)=>{const lowD=metric==="irr"?s.irrLowDelta:s.cocLowDelta;const highD=metric==="irr"?s.irrHighDelta:s.cocHighDelta;const lowAbs=metric==="irr"?s.irrLowAbs:s.cocLowAbs;const highAbs=metric==="irr"?s.irrHighAbs:s.cocHighAbs;const lowW=(Math.abs(lowD)/maxDelta)*BAR_PCT;const highW=(Math.abs(highD)/maxDelta)*BAR_PCT;return(<div key={i} style={{display:"grid",gridTemplateColumns:"90px 1fr",gap:0,marginBottom:10,alignItems:"center"}}><div style={{paddingRight:8,textAlign:"right"}}><div style={{fontSize:11,fontWeight:700,color:"var(--text)"}}>{s.label}</div><div style={{fontSize:9,color:"var(--muted)"}}>{s.unit}</div></div><div style={{display:"grid",gridTemplateColumns:"1fr 1px 1fr",alignItems:"center"}}><div style={{display:"flex",alignItems:"center",gap:4,justifyContent:"flex-end"}}><span style={{fontSize:10,color:"var(--muted)",whiteSpace:"nowrap",minWidth:44,textAlign:"right",fontWeight:600}}>{FMT_PCT(lowAbs)}</span><div style={{width:`${BAR_PCT}%`,display:"flex",justifyContent:"flex-end"}}><div style={{width:`${lowW}%`,height:24,background:"#ef4444cc",borderRadius:"3px 0 0 3px",minWidth:lowW>0?3:0}}/></div></div><div style={{background:"var(--border)",height:24,width:1}}/><div style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:`${BAR_PCT}%`,display:"flex",justifyContent:"flex-start"}}><div style={{width:`${highW}%`,height:24,background:"#10b981cc",borderRadius:"0 3px 3px 0",minWidth:highW>0?3:0}}/></div><span style={{fontSize:10,color:"var(--muted)",whiteSpace:"nowrap",minWidth:44,fontWeight:600}}>{FMT_PCT(highAbs)}</span></div></div></div>);})}
      <div style={{display:"flex",gap:16,marginTop:12,paddingTop:12,borderTop:"1px solid var(--border-faint)",fontSize:10,color:"var(--muted)",flexWrap:"wrap"}}><span><span style={{color:"#ef4444",fontWeight:700}}>■</span> Downside</span><span><span style={{color:"#10b981",fontWeight:700}}>■</span> Upside</span></div>
    </div>
  </div>);
}

// ─── DEAL PAGE ────────────────────────────────────────────────────────────────

export default SensitivityTab;
