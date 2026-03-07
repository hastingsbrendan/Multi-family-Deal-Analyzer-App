import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { iSty } from './ui/InputRow';
import { useIsMobile } from '../lib/hooks';
import { FMT_USD, FMT_PCT, STATUS_OPTIONS, STATUS_COLORS } from '../lib/constants';;
import { calcDeal } from '../lib/calc';
import AddressAutocomplete from './AddressAutocomplete';
import DealSummaryTab from './DealSummaryTab';
import AssumptionsTab from './AssumptionsTab';
import CashFlowTab from './CashFlowTab';
import RentCompsTab from './RentCompsTab';
import ShowingTab from './ShowingTab';
import RedFlagsTab from './RedFlagsTab';
import SensitivityTab from './SensitivityTab';
import { DEFAULT_PREFS } from '../lib/calc';

const TABS_MOBILE=["Summary","Assumptions","Cash Flow","Comps","Showing","Red Flags","Sensitivity"];
const TABS_DESK  =["Deal Summary","Assumptions","Cash Flow","Rent Comps","Showing","Red Flags","Sensitivity"];

function DealPage({deal, onUpdate, onBack, onExport, onShare, groupRole}) {
  const [tab, setTab] = useState(0);
  const isMobile = useIsMobile();
  const result = useMemo(() => calcDeal(deal), [deal]);
  const tabLabels = isMobile ? TABS_MOBILE : TABS_DESK;
  return(<div style={{maxWidth:980,margin:"0 auto",paddingBottom:60}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,gap:8}}>
      <button onClick={onBack} style={{color:"var(--accent)",cursor:"pointer",fontSize:13,fontWeight:700,padding:"6px 12px",borderRadius:100,border:"1px solid var(--border)",background:"var(--card)",whiteSpace:"nowrap"}}>← Portfolio</button>
      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",justifyContent:"flex-end"}}>
        <select value={deal.status} onChange={e=>onUpdate({...deal,status:e.target.value})} style={{background:STATUS_COLORS[deal.status]+"22",border:`1px solid ${STATUS_COLORS[deal.status]}55`,borderRadius:6,padding:"6px 10px",color:STATUS_COLORS[deal.status],fontWeight:700,fontSize:13,cursor:"pointer"}}>
          {STATUS_OPTIONS.map(s=><option key={s} value={s}>{s}</option>)}
        </select>
        {onShare&&<button onClick={onShare} style={{background:"var(--accentlt, #CCFBF1)",border:"1px solid rgba(13,148,136,0.25)",borderRadius:6,padding:"7px 14px",cursor:"pointer",fontSize:13,color:"var(--accentdk, #0F766E)",fontWeight:700}}>👥 Share</button>}
        {groupRole==="Viewer"&&<div style={{fontSize:11,fontWeight:700,padding:"4px 10px",borderRadius:20,background:"var(--teal-lt, #CCFBF1)",color:"var(--accentdk, #0F766E)",border:"1px solid rgba(13,148,136,0.35)"}}>👁 View Only</div>}
        <button onClick={onExport} style={{background:"var(--accent)",color:"#fff",border:"none",borderRadius:100,padding:"7px 14px",cursor:"pointer",fontSize:13,fontWeight:700}}>⬇ CSV</button>
      </div>
    </div>
    <AddressAutocomplete value={deal.address} onChange={v=>onUpdate({...deal,address:v})} placeholder="Enter property address..." inputStyle={{width:"100%",background:"none",border:"none",borderBottom:"2px solid var(--accent)",fontSize:isMobile?18:24,fontFamily:"'Fraunces',serif",fontWeight:900,color:"var(--text)",padding:"6px 0",marginBottom:14,outline:"none",letterSpacing:"-0.5px"}}/>
    <div style={{display:"flex",borderBottom:"1px solid var(--border)",overflowX:"auto",WebkitOverflowScrolling:"touch",scrollbarWidth:"none",msOverflowStyle:"none"}}>
      {tabLabels.map((t,i)=>(<button key={i} onClick={()=>setTab(i)} style={{background:"none",border:"none",borderBottom:tab===i?"3px solid var(--accent)":"3px solid transparent",padding:isMobile?"10px 12px":"10px 18px",cursor:"pointer",fontSize:isMobile?12:13,fontWeight:tab===i?800:500,color:tab===i?"var(--accent)":"var(--muted)",marginBottom:-1,fontFamily:"inherit",whiteSpace:"nowrap",flexShrink:0}}>{t}</button>))}
    </div>
    {tab===0&&<DealSummaryTab deal={deal} result={result} onUpdate={onUpdate}/>}
    {tab===1&&<AssumptionsTab deal={deal} onChange={onUpdate}/>}
    {tab===2&&<CashFlowTab result={result} deal={deal}/>}
    {tab===3&&<RentCompsTab deal={deal} onChange={onUpdate}/>}
    {tab===4&&<ShowingTab deal={deal} onChange={onUpdate}/>}
    {tab===5&&<RedFlagsTab deal={deal} result={result} onChange={onUpdate} prefs={window.__userPrefs||DEFAULT_PREFS}/>}
    {tab===6&&<SensitivityTab deal={deal}/>}
  </div>);
}

// ─── ADDRESS AUTOCOMPLETE ─────────────────────────────────────────────────────

export default DealPage;
