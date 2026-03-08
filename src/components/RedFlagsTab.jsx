import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { iSty } from './ui/InputRow';
import { FMT_PCT, FMT_USD } from '../lib/constants';
import { DEFAULT_PREFS } from '../lib/calc';
import { useIsMobile } from '../lib/hooks';

function RedFlagsTab({deal,result,onChange,prefs=DEFAULT_PREFS}){
  const [exp,setExp]=useState({});
  const yr1=result.years?.[0];
  const expR=yr1&&yr1.egi>0?yr1.expenses/yr1.egi:null;
  const dscr=yr1?.dscr??null;
  const cr=yr1?.capRate??null;
  const dscrFloor = prefs.dscrFloor ?? 1.2;
  const crFloor   = prefs.capRateFloor ?? 0.06;
  const expCeil   = prefs.expRatioCeiling ?? 0.50;
  const AF=[
    {key:"dscr",label:`DSCR Below ${dscrFloor.toFixed(2)}x`,triggered:dscr!==null&&dscr<dscrFloor,severity:dscr!==null&&dscr<dscrFloor*0.85?"critical":"warning",detail:dscr!==null?`Yr 1 DSCR is ${dscr.toFixed(2)}x — debt service may not be covered by NOI.`:"No data",actual:dscr!==null?`${dscr.toFixed(2)}x`:"—",threshold:`${dscrFloor.toFixed(2)}x`},
    {key:"caprate",label:`Cap Rate Below ${(crFloor*100).toFixed(1)}%`,triggered:cr!==null&&cr<crFloor,severity:cr!==null&&cr<crFloor*0.67?"critical":"warning",detail:cr!==null?`Yr 1 Cap Rate is ${(cr*100).toFixed(2)}% — low return relative to purchase price.`:"No data",actual:cr!==null?`${(cr*100).toFixed(2)}%`:"—",threshold:`${(crFloor*100).toFixed(1)}%`},
    {key:"expratio",label:`Expense Ratio Above ${(expCeil*100).toFixed(0)}%`,triggered:expR!==null&&expR>expCeil,severity:expR!==null&&expR>expCeil*1.3?"critical":"warning",detail:expR!==null?`Yr 1 Expense Ratio is ${(expR*100).toFixed(1)}% — high expenses relative to income.`:"No data",actual:expR!==null?`${(expR*100).toFixed(1)}%`:"—",threshold:`${(expCeil*100).toFixed(0)}%`},
  ];
  const manual=deal.redFlags?.manual||[];
  const mit=deal.redFlags?.mitigations||{};
  const upd=(fn)=>{const d=JSON.parse(JSON.stringify(deal));if(!d.redFlags)d.redFlags={manual:[],mitigations:{}};if(!d.redFlags.mitigations)d.redFlags.mitigations={};fn(d);onChange(d);};
  const SC={critical:"#ef4444",warning:"#f59e0b"};
  const SB={critical:"#ef444418",warning:"#f59e0b18"};
  const iSty={background:"var(--input-bg)",border:"1px solid var(--border)",borderRadius:100,padding:"7px 10px",fontSize:13,color:"var(--text)",width:"100%",fontFamily:"inherit"};
  const cSty={background:"var(--card)",borderRadius:10,border:"1px solid var(--border)",padding:16,marginBottom:12};
  const trg=AF.filter(f=>f.triggered);
  const clr=AF.filter(f=>!f.triggered);
  return(<div style={{padding:"16px 0"}}>
    <div style={{fontSize:11,fontWeight:700,color:"var(--muted)",letterSpacing:"0.08em",marginBottom:10}}>RULE-BASED FLAGS</div>
    {trg.length===0&&(<div style={{...cSty,background:"#10b98112",border:"1px solid #10b98144",textAlign:"center",padding:24}}>
      <div style={{fontSize:24,marginBottom:6}}>✅</div>
      <div style={{fontSize:13,fontWeight:700,color:"#10b981"}}>All automatic checks passed</div>
      <div style={{fontSize:11,color:"var(--muted)",marginTop:4}}>DSCR, Cap Rate, and Expense Ratio are within thresholds</div>
    </div>)}
    {trg.map(flag=>(<div key={flag.key} style={{...cSty,border:`1px solid ${SC[flag.severity]}55`,background:SB[flag.severity]}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
        <span style={{fontSize:10,fontWeight:800,padding:"2px 8px",borderRadius:10,background:SC[flag.severity],color:"#fff",letterSpacing:"0.05em"}}>{flag.severity.toUpperCase()}</span>
        <span style={{fontSize:13,fontWeight:700,color:"var(--text)"}}>{flag.label}</span>
      </div>
      <div style={{fontSize:12,color:"var(--muted)",marginBottom:8}}>{flag.detail}</div>
      <div style={{display:"flex",gap:20,fontSize:11,marginBottom:10}}>
        <span>Actual: <strong style={{color:SC[flag.severity]}}>{flag.actual}</strong></span>
        <span>Threshold: <strong style={{color:"var(--text)"}}>{flag.threshold}</strong></span>
      </div>
      <button onClick={()=>setExp(p=>({...p,[flag.key]:!p[flag.key]}))} style={{background:"none",border:"none",color:"var(--accent)",fontSize:11,fontWeight:700,cursor:"pointer",padding:0}}>
        {exp[flag.key]?"▾ Hide":"▸ Add"} Mitigation Plan
      </button>
      {exp[flag.key]&&(<textarea value={mit[flag.key]||""} onChange={e=>upd(d=>{d.redFlags.mitigations[flag.key]=e.target.value;})} rows={3} placeholder="Describe how you plan to address this risk…" style={{...iSty,resize:"vertical",marginTop:8}}/>)}
    </div>))}
    {clr.length>0&&(<div style={{fontSize:11,color:"var(--muted)",marginBottom:16,paddingLeft:2}}>✓ {clr.map(f=>f.label).join(" · ")}</div>)}
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10,marginTop:8}}>
      <div style={{fontSize:11,fontWeight:700,color:"var(--muted)",letterSpacing:"0.08em"}}>MANUAL FLAGS</div>
      <button onClick={()=>upd(d=>d.redFlags.manual.push({id:Date.now(),label:"",detail:"",mitigation:""}))} style={{background:"var(--accent)",color:"#fff",border:"none",borderRadius:100,padding:"5px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>+ Add Flag</button>
    </div>
    {manual.length===0&&(<div style={{...cSty,textAlign:"center",padding:20,color:"var(--muted)",fontSize:12}}>No manual flags added yet.</div>)}
    {manual.map(flag=>(<div key={flag.id} style={cSty}>
      <div style={{display:"flex",gap:8,marginBottom:8}}>
        <input value={flag.label||""} onChange={e=>upd(d=>{const f=d.redFlags.manual.find(x=>x.id===flag.id);if(f)f.label=e.target.value;})} placeholder="Flag title (e.g. Foundation crack observed)" style={{...iSty,fontWeight:600,flex:1}}/>
        <button onClick={()=>upd(d=>{const i=d.redFlags.manual.findIndex(x=>x.id===flag.id);if(i!==-1)d.redFlags.manual.splice(i,1);})} style={{background:"none",border:"1px solid var(--border)",borderRadius:100,color:"#ef4444",cursor:"pointer",padding:"7px 10px",fontSize:12,flexShrink:0}}>✕</button>
      </div>
      <textarea value={flag.detail||""} onChange={e=>upd(d=>{const f=d.redFlags.manual.find(x=>x.id===flag.id);if(f)f.detail=e.target.value;})} rows={2} placeholder="Describe the issue…" style={{...iSty,resize:"vertical",marginBottom:8}}/>
      <div style={{fontSize:11,fontWeight:700,color:"var(--muted)",marginBottom:4}}>Mitigation Plan</div>
      <textarea value={flag.mitigation||""} onChange={e=>upd(d=>{const f=d.redFlags.manual.find(x=>x.id===flag.id);if(f)f.mitigation=e.target.value;})} rows={2} placeholder="How will you address this?" style={{...iSty,resize:"vertical"}}/>
    </div>))}
  </div>);
}

// ─── SENSITIVITY TAB ──────────────────────────────────────────────────────────

export default RedFlagsTab;
