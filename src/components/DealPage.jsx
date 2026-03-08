import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useIsMobile } from '../lib/hooks';
import { FMT_USD, FMT_PCT, STATUS_OPTIONS, STATUS_COLORS } from '../lib/constants';
import { calcDeal, DEFAULT_PREFS } from '../lib/calc';
import AddressAutocomplete from './AddressAutocomplete';
import CommentsPanel from './CommentsPanel';
import { BlurGate } from './UpgradeModal';
import { useFeatureCheck } from './FeatureGate';

// Lazy-load tab components — only downloaded when the user navigates to that tab
const DealSummaryTab = React.lazy(() => import('./DealSummaryTab'));
const AssumptionsTab = React.lazy(() => import('./AssumptionsTab'));
const CashFlowTab    = React.lazy(() => import('./CashFlowTab'));
const RentCompsTab   = React.lazy(() => import('./RentCompsTab'));
const ShowingTab     = React.lazy(() => import('./ShowingTab'));
const RedFlagsTab    = React.lazy(() => import('./RedFlagsTab'));
const SensitivityTab = React.lazy(() => import('./SensitivityTab'));

const TABS_MOBILE=["Summary","Assumptions","Cash Flow","Comps","Showing","Red Flags","Sensitivity"];
const TABS_DESK  =["Deal Summary","Assumptions","Cash Flow","Rent Comps","Showing","Red Flags","Sensitivity"];

const TabFallback = () => (
  <div style={{padding:40,textAlign:'center',color:'var(--muted)',fontSize:13}}>Loading…</div>
);

function DealPage({deal, onUpdate, onBack, onExport, onExportPDF, onShare, groupRole, activeGroup, currentUser, prefs, forceTab}) {
  const [tab, setTab] = useState(0);
  useEffect(() => { if (forceTab != null) setTab(forceTab); }, [forceTab]);
  const isMobile = useIsMobile();
  const result = useMemo(() => calcDeal(deal), [deal]);
  const tabLabels = isMobile ? TABS_MOBILE : TABS_DESK;

  const canPDF      = useFeatureCheck('pdfExport');
  const canShare    = useFeatureCheck('sharing');
  const userEmail   = currentUser?.email;

  return(<div style={{maxWidth:980,margin:"0 auto",paddingBottom:60}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,gap:8}}>
      <button onClick={onBack} style={{color:"var(--accent)",cursor:"pointer",fontSize:13,fontWeight:700,padding:"6px 12px",borderRadius:100,border:"1px solid var(--border)",background:"var(--card)",whiteSpace:"nowrap"}}>← Portfolio</button>
      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",justifyContent:"flex-end"}}>
        <select value={deal.status} onChange={e=>onUpdate({...deal,status:e.target.value})} style={{background:STATUS_COLORS[deal.status]+"22",border:`1px solid ${STATUS_COLORS[deal.status]}55`,borderRadius:6,padding:"6px 10px",color:STATUS_COLORS[deal.status],fontWeight:700,fontSize:13,cursor:"pointer"}}>
          {STATUS_OPTIONS.map(s=><option key={s} value={s}>{s}</option>)}
        </select>

        {/* Share button — gated */}
        {onShare && canShare && (
          <button onClick={onShare} style={{background:"var(--accentlt, #CCFBF1)",border:"1px solid rgba(13,148,136,0.25)",borderRadius:6,padding:"7px 14px",cursor:"pointer",fontSize:13,color:"var(--accentdk, #0F766E)",fontWeight:700}}>👥 Share</button>
        )}
        {onShare && !canShare && (
          <button onClick={()=>setTab(-1)} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:6,padding:"7px 14px",cursor:"pointer",fontSize:13,color:"var(--muted)",fontWeight:700}}>🔒 Share</button>
        )}

        {groupRole==="Viewer"&&<div style={{fontSize:11,fontWeight:700,padding:"4px 10px",borderRadius:20,background:"var(--teal-lt, #CCFBF1)",color:"var(--accentdk, #0F766E)",border:"1px solid rgba(13,148,136,0.35)"}}>👁 View Only</div>}

        {/* PDF button — gated */}
        {groupRole!=="Viewer" && canPDF && (
          <button onClick={onExportPDF} style={{background:"var(--card)",color:"var(--accent)",border:"1px solid var(--accent)",borderRadius:100,padding:"7px 14px",cursor:"pointer",fontSize:13,fontWeight:700}}>⬇ PDF</button>
        )}
        {groupRole!=="Viewer" && !canPDF && (
          <button onClick={()=>setTab(-1)} style={{background:"var(--card)",color:"var(--muted)",border:"1px solid var(--border)",borderRadius:100,padding:"7px 14px",cursor:"pointer",fontSize:13,fontWeight:700}}>🔒 PDF</button>
        )}

        <button onClick={onExport} style={{background:"var(--accent)",color:"#fff",border:"none",borderRadius:100,padding:"7px 14px",cursor:"pointer",fontSize:13,fontWeight:700}}>⬇ CSV</button>
      </div>
    </div>
    <AddressAutocomplete value={deal.address} onChange={v=>onUpdate({...deal,address:v})} placeholder="Enter property address..." inputStyle={{width:"100%",background:"none",border:"none",borderBottom:"2px solid var(--accent)",fontSize:isMobile?18:24,fontFamily:"'Fraunces',serif",fontWeight:900,color:"var(--text)",padding:"6px 0",marginBottom:14,outline:"none",letterSpacing:"-0.5px"}}/>
    <div data-tour="tab-bar" style={{display:"flex",borderBottom:"1px solid var(--border)",overflowX:"auto",WebkitOverflowScrolling:"touch",scrollbarWidth:"none",msOverflowStyle:"none"}}>
      {tabLabels.map((t,i)=>(<button key={i} onClick={()=>setTab(i)} style={{background:"none",border:"none",borderBottom:tab===i?"3px solid var(--accent)":"3px solid transparent",padding:isMobile?"10px 12px":"10px 18px",cursor:"pointer",fontSize:isMobile?12:13,fontWeight:tab===i?800:500,color:tab===i?"var(--accent)":"var(--muted)",marginBottom:-1,fontFamily:"inherit",whiteSpace:"nowrap",flexShrink:0}}>{t}</button>))}
    </div>
    <div data-tour="tab-content"><Suspense fallback={<TabFallback/>}>
      {tab===0&&<DealSummaryTab deal={deal} result={result} onUpdate={onUpdate}/>}
      {tab===1&&<AssumptionsTab deal={deal} onChange={onUpdate}/>}
      {tab===2&&<CashFlowTab result={result} deal={deal}/>}
      {tab===3&&(
        <BlurGate feature="rentComps" userEmail={userEmail}>
          <RentCompsTab deal={deal} onChange={onUpdate}/>
        </BlurGate>
      )}
      {tab===4&&<ShowingTab deal={deal} onChange={onUpdate}/>}
      {tab===5&&<RedFlagsTab deal={deal} result={result} onChange={onUpdate} prefs={prefs||DEFAULT_PREFS}/>}
      {tab===6&&(
        <BlurGate feature="sensitivity" userEmail={userEmail}>
          <SensitivityTab deal={deal}/>
        </BlurGate>
      )}
    </Suspense></div>
    {activeGroup && deal._deal_id && (
      <CommentsPanel
        groupId={activeGroup.id}
        dealId={deal._deal_id}
        currentUser={currentUser}
      />
    )}
  </div>);
}

export default DealPage;
