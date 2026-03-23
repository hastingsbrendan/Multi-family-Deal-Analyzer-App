import React, { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import { useIsMobile, lazyWithRetry } from '../lib/hooks';
import { FMT_USD, FMT_PCT, STATUS_OPTIONS, STATUS_COLORS, IS_PROD } from '../lib/constants';
import { calcDeal, DEFAULT_PREFS } from '../lib/calc';
import AddressAutocomplete from './AddressAutocomplete';
import CommentsPanel from './CommentsPanel';
import { BlurGate } from './UpgradeModal';
import { useFeatureCheck } from './FeatureGate';
import { trackTabViewed, trackFeatureUsed } from '../lib/analytics';
import ErrorBoundary from './ErrorBoundary';

// Lazy-load tab components — only downloaded when the user navigates to that tab
// lazyWithRetry auto hard-reloads on stale-chunk errors after a new deployment
const DealSummaryTab = lazyWithRetry(() => import('./DealSummaryTab'));
const AssumptionsTab = lazyWithRetry(() => import('./AssumptionsTab'));
const CashFlowTab    = lazyWithRetry(() => import('./CashFlowTab'));
const RentCompsTab   = lazyWithRetry(() => import('./RentCompsTab'));
const ShowingTab     = lazyWithRetry(() => import('./ShowingTab'));
const RedFlagsTab    = lazyWithRetry(() => import('./RedFlagsTab'));
const SensitivityTab = lazyWithRetry(() => import('./SensitivityTab'));
const MarketTab      = lazyWithRetry(() => import('./MarketTab'));
const LoanTypeTab    = lazyWithRetry(() => import('./LoanTypeTab'));

// TAB_CONFIG is the single source of truth for tab ordering, labels, gating,
// and visibility. Previously two parallel arrays (TABS_MOBILE_ALL / TABS_DESK_ALL)
// were index-coupled to the component render block — a mismatch would silently
// render the wrong tab content.
const TAB_CONFIG = [
  { id: 0, label: 'Deal Summary',  mobileLabel: 'Summary'     },
  { id: 1, label: 'Assumptions',   mobileLabel: 'Assumptions' },
  { id: 2, label: 'Cash Flow',     mobileLabel: 'Cash Flow'   },
  { id: 3, label: 'Rent Comps',    mobileLabel: 'Comps',      gated: 'rentComps'   },
  { id: 4, label: 'Market',        mobileLabel: 'Market'      },
  { id: 5, label: 'Showing',       mobileLabel: 'Showing'     },
  { id: 6, label: 'Red Flags',     mobileLabel: 'Red Flags'   },
  { id: 7, label: 'Sensitivity',   mobileLabel: 'Sensitivity', gated: 'sensitivity' },
  { id: 8, label: 'Loan Type',     mobileLabel: 'Loan Type',  devOnly: true        },
];
const VISIBLE_TABS = TAB_CONFIG.filter(t => !t.devOnly || !IS_PROD);

const TAB_NEXT = {
  0: { id: 1, hint: 'Adjust your assumptions' },
  1: { id: 2, hint: 'Review your cash flow projections' },
  2: { id: 4, hint: 'Check local market conditions' },
  4: { id: 6, hint: 'Review potential red flags' },
  6: { id: 0, hint: 'Back to your deal summary' },
};

const TabFallback = () => (
  <div style={{padding:40,textAlign:'center',color:'var(--muted)',fontSize:13}}>Loading…</div>
);

function DealPage({deal, onUpdate, onBack, onExport, onExportPDF, onShare, groupRole, activeGroup, currentUser, prefs, forceTab}) {
  const [tab, setTab] = useState(0);
  useEffect(() => { if (forceTab != null) setTab(forceTab); }, [forceTab]);

  // Track initial tab view and subsequent tab switches
  useEffect(() => {
    trackTabViewed(tab, deal?.id);
    // Track active use of gated features (only fires when user has access — not on the blur gate)
    if (tab === 3 && canRentComps)   trackFeatureUsed('rentComps', deal?.id);
    if (tab === 7 && canSensitivity) trackFeatureUsed('sensitivity', deal?.id);
  }, [tab, deal?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTabChange = useCallback((i) => setTab(i), []);
  const isMobile = useIsMobile();
  const result = useMemo(() => calcDeal(deal), [deal]);

  const canPDF        = useFeatureCheck('pdfExport');
  const canShare      = useFeatureCheck('sharing');
  const canRentComps  = useFeatureCheck('rentComps');
  const canSensitivity = useFeatureCheck('sensitivity');
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
          <button onClick={()=>setTab(-1)} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:6,padding:"7px 14px",cursor:"pointer",fontSize:13,color:"var(--muted)",fontWeight:700}}>🔒 Share Deal — Pro</button>
        )}

        {groupRole==="Viewer"&&<div style={{fontSize:11,fontWeight:700,padding:"4px 10px",borderRadius:20,background:"var(--teal-lt, #CCFBF1)",color:"var(--accentdk, #0F766E)",border:"1px solid rgba(13,148,136,0.35)"}}>👁 View Only</div>}

        {/* PDF button — gated */}
        {groupRole!=="Viewer" && canPDF && (
          <button onClick={onExportPDF} style={{background:"var(--card)",color:"var(--accent)",border:"1px solid var(--accent)",borderRadius:100,padding:"7px 14px",cursor:"pointer",fontSize:13,fontWeight:700}}>⬇ PDF</button>
        )}
        {groupRole!=="Viewer" && !canPDF && (
          <button onClick={()=>setTab(-1)} style={{background:"var(--card)",color:"var(--muted)",border:"1px solid var(--border)",borderRadius:100,padding:"7px 14px",cursor:"pointer",fontSize:13,fontWeight:700}}>🔒 Export PDF — Pro</button>
        )}

        <button onClick={onExport} style={{background:"var(--accent)",color:"#fff",border:"none",borderRadius:100,padding:"7px 14px",cursor:"pointer",fontSize:13,fontWeight:700}}>⬇ Excel</button>
      </div>
    </div>
    <AddressAutocomplete value={deal.address} onChange={v=>onUpdate({...deal,address:v})} placeholder="Enter property address..." inputStyle={{width:"100%",background:"none",border:"none",borderBottom:"2px solid var(--accent)",fontSize:isMobile?18:24,fontFamily:"'Fraunces',serif",fontWeight:900,color:"var(--text)",padding:"6px 0",marginBottom:14,outline:"none",letterSpacing:"-0.5px"}}/>
    <div style={{position:"relative"}}>
      <div data-tour="tab-bar" style={{display:"flex",borderBottom:"1px solid var(--border)",overflowX:"auto",WebkitOverflowScrolling:"touch",scrollbarWidth:"none",msOverflowStyle:"none"}}>
        {VISIBLE_TABS.map(t=>(<button key={t.id} onClick={()=>handleTabChange(t.id)} style={{background:"none",border:"none",borderBottom:tab===t.id?"3px solid var(--accent)":"3px solid transparent",padding:isMobile?"10px 12px":"10px 18px",cursor:"pointer",fontSize:isMobile?12:13,fontWeight:tab===t.id?800:500,color:tab===t.id?"var(--accent)":"var(--muted)",marginBottom:-1,fontFamily:"inherit",whiteSpace:"nowrap",flexShrink:0}}>{isMobile?t.mobileLabel:t.label}</button>))}
      </div>
      <div style={{position:"absolute",right:0,top:0,bottom:1,width:40,background:"linear-gradient(to right, transparent, var(--bg))",pointerEvents:"none"}}/>
    </div>
    <div data-tour="tab-content"><ErrorBoundary compact><Suspense fallback={<TabFallback/>}>
      {tab===0&&<DealSummaryTab deal={deal} result={result} onUpdate={onUpdate}/>}
      {tab===1&&<AssumptionsTab deal={deal} onChange={onUpdate}/>}
      {tab===2&&<CashFlowTab result={result} deal={deal}/>}
      {tab===3&&(
        <BlurGate feature="rentComps" userEmail={userEmail}>
          <RentCompsTab deal={deal} onChange={onUpdate}/>
        </BlurGate>
      )}
      {tab===4&&<MarketTab deal={deal} onChange={onUpdate}/>}
      {tab===5&&<ShowingTab deal={deal} onChange={onUpdate}/>}
      {tab===6&&<RedFlagsTab deal={deal} result={result} onChange={onUpdate} prefs={prefs||DEFAULT_PREFS}/>}
      {tab===7&&(
        <BlurGate feature="sensitivity" userEmail={userEmail}>
          <SensitivityTab deal={deal}/>
        </BlurGate>
      )}
      {tab===8&&!IS_PROD&&<LoanTypeTab deal={deal}/>}
    </Suspense></ErrorBoundary></div>
    {TAB_NEXT[tab] && (
      <div style={{marginTop:24,paddingTop:16,borderTop:"1px solid var(--border-faint)",display:"flex",justifyContent:"flex-end"}}>
        <button
          onClick={()=>handleTabChange(TAB_NEXT[tab].id)}
          style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:100,padding:"8px 18px",fontSize:12,fontWeight:700,color:"var(--muted)",cursor:"pointer",display:"flex",alignItems:"center",gap:6,transition:"all 0.15s"}}
          onMouseEnter={e=>{e.currentTarget.style.color="var(--accent)";e.currentTarget.style.borderColor="var(--accent)";}}
          onMouseLeave={e=>{e.currentTarget.style.color="var(--muted)";e.currentTarget.style.borderColor="var(--border)";}}
        >
          {TAB_NEXT[tab].hint} →
        </button>
      </div>
    )}
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
