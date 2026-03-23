import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { trackDealOpened, trackPDFExported, trackCSVExported } from '../lib/analytics';
import { iSty } from './ui/InputRow';
import { sbClient, sbWriteDeal, sbDeleteDeal, sbWritePrefs } from '../lib/constants';
import { DEFAULT_PREFS, newDeal } from '../lib/calc';
import { sbGetGroupDeals, sbShareDealToGroup, sbRemoveDealFromGroup, sbReorderGroupDeals } from '../lib/groups';
import { useIsMobile, useOnlineStatus } from '../lib/hooks';
import { useCloudSync } from '../lib/useCloudSync';
import { useAuth } from '../lib/useAuth';
import { useDeals } from '../lib/useDeals';
import { TrialBanner } from './UpgradeModal';
import { FeedbackModal } from './FeedbackModal';
import UndoToast from './ui/UndoToast';
import DisclaimerModal from './DisclaimerModal';

// Core views — always needed on first load
import AuthScreen from './AuthScreen';
import PortfolioPage from './PortfolioPage';
import DealPage from './DealPage';

// Secondary pages — lazy loaded, only downloaded when user navigates there
const ProfilePage     = React.lazy(() => import('./ProfilePage'));
const SettingsPage    = React.lazy(() => import('./SettingsPage'));
const AppSettingsPage = React.lazy(() => import('./AppSettingsPage'));
const GroupsPage      = React.lazy(() => import('./GroupsPage'));
const ShareDealModal  = React.lazy(() => import('./ShareDealModal'));
const GuidedTour      = React.lazy(() => import('./GuidedTour'));

// TOUR_STEPS is a tiny data array in its own file — imported synchronously so step-count
// logic works immediately, without blocking the lazy load of GuidedTour itself.
import { TOUR_STEPS } from './tourSteps';

function App() {
  const [dark, setDark] = useState(() => localStorage.getItem("rh_dark") === "true");
  const [showFeedback, setShowFeedback] = useState(false);
  const [showUpgradeSuccess, setShowUpgradeSuccess] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("upgraded") === "true") {
      window.history.replaceState({}, "", window.location.pathname); // clean URL
      return true;
    }
    return false;
  });
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showProfile, setShowProfile] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAppSettings, setShowAppSettings] = useState(false);
  const [tourStep, setTourStep] = useState(null); // null = inactive, number = active step
  const tourDealRef = useRef(null); // track sample deal created for tour
  const profileMenuRef = useRef(null);
  const [showGroups, setShowGroups] = useState(false);
  const [activeGroup, setActiveGroup] = useState(null); // {id, name, role} or null = personal
  const [groupDeals, setGroupDeals] = useState([]);
  const [showShareModal, setShowShareModal] = useState(null); // deal to share
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [showSyncDetail, setShowSyncDetail] = useState(false);
  const [shareSuccess, setShareSuccess] = useState(null);
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [activeDealId, setActiveDealId] = useState(null);
  const [portfolioFilter, setPortfolioFilter] = useState("All");
  const isOnline = useOnlineStatus();
  const isMobile = useIsMobile();

  // useCloudSync first (no user dep at call site — user is passed as reactive value)
  const { deals, setDeals, syncStatus, syncError, lastSyncedAt, forceRefresh, setLastCloudUpdate, markDealDirty } = useCloudSync(user, isOnline);

  // useAuth second — takes setUser/setDeals/setLastCloudUpdate, returns handleSignOut
  const { handleSignOut } = useAuth({ setUser, setAuthLoading, setDeals, setLastCloudUpdate, setPrefs });

  // When user signs out, clear all UI state
  useEffect(() => {
    if (!user) {
      setActiveDealId(null);
      setShowProfile(false);
      setShowSettings(false);
      setShowAppSettings(false);
      setShowGroups(false);
      setActiveGroup(null);
      setGroupDeals([]);
      setProfileMenuOpen(false);
    }
  }, [user]);

  // Profile menu click-outside handler
  useEffect(() => {
    if (!profileMenuOpen) return;
    const handle = (e) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target)) {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handle);
    document.addEventListener('touchstart', handle);
    return () => {
      document.removeEventListener('mousedown', handle);
      document.removeEventListener('touchstart', handle);
    };
  }, [profileMenuOpen]);

  const { addDeal: _addDeal, updateDeal, deleteDeal, reorderDeals } = useDeals({ prefs, setDeals, markDealDirty });
  const addDeal = useCallback(() => _addDeal(setActiveDealId), [_addDeal, setActiveDealId]);

  const theme = dark ? "dark" : "light";
  const showDisclaimer = user && !user.user_metadata?.disclaimer_ack_at;
  const activeDeal   = (activeGroup ? (groupDeals||[]) : (deals||[])).find(d=>d.id===activeDealId);

  // ─── Tour navigation ────────────────────────────────────────────────
  const tourActive = tourStep !== null;
  const tourStepDef = tourActive ? TOUR_STEPS[tourStep] : null;

  // Compute forceTab from current tour step (only when tour controls a deal tab)
  const tourForceTab = tourActive && tourStepDef?.page === 'deal' && tourStepDef?.tab != null ? tourStepDef.tab : null;

  // When tour enters a deal step, ensure we have a deal open
  useEffect(() => {
    if (!tourActive || !tourStepDef || tourStepDef.page !== 'deal') return;
    if (activeDealId) return; // already viewing a deal
    // Use first existing deal or create a sample
    const allDeals = deals || [];
    if (allDeals.length > 0) {
      setActiveDealId(allDeals[0].id);
    } else {
      const d = newDeal(prefs);
      d.address = 'Sample Property — 123 Main St';
      tourDealRef.current = d.id;
      setDeals(prev => [...(prev || []), d]);
      setActiveDealId(d.id);
    }
  }, [tourStep]);

  // When tour enters a portfolio step, go back to portfolio
  useEffect(() => {
    if (!tourActive || !tourStepDef) return;
    if (tourStepDef.page === 'portfolio' && activeDealId) {
      setActiveDealId(null);
    }
  }, [tourStep]);

  const startTour = () => setTourStep(0);
  const closeTour = () => {
    setTourStep(null);
    setActiveDealId(null); // return to portfolio
  };
  const tourNext = () => {
    if (tourStep < TOUR_STEPS.length - 1) setTourStep(s => s + 1);
    else closeTour();
  };
  const tourBack = () => {
    if (tourStep > 0) setTourStep(s => s - 1);
  };

  // Load group deals when switching to a group context
  useEffect(() => {
    if (!activeGroup) return;
    sbGetGroupDeals(activeGroup.id).then(d => setGroupDeals(d || []));
  }, [activeGroup?.id]);

  // Group deal operations — ref-based A2 schema
  const addGroupDeal = useCallback(() => {
    const d = newDeal(prefs);
    sbShareDealToGroup(d, activeGroup.id)
      .then(saved => { setGroupDeals(prev => [...prev, saved]); setActiveDealId(saved.id); })
      .catch(() => {});
  }, [activeGroup?.id, prefs]);

  const deleteGroupDeal = useCallback((id) => {
    const deal = (groupDeals||[]).find(d => d.id === id);
    if (deal?._deal_id) sbRemoveDealFromGroup(deal._deal_id, activeGroup.id).catch(() => {});
    setGroupDeals(prev => prev.filter(d => d.id !== id));
  }, [groupDeals, activeGroup?.id]);

  const reorderGroupDeals = useCallback((next) => {
    setGroupDeals(next);
    const orderedIds = next.map(d => d._deal_id).filter(Boolean);
    if (orderedIds.length && activeGroup) sbReorderGroupDeals(activeGroup.id, orderedIds).catch(() => {});
  }, [activeGroup?.id]);

  const updateGroupDeal = useCallback((updated) => {
    setGroupDeals(prev => prev.map(d => d.id === updated.id ? updated : d));
    if (updated._deal_id) sbWriteDeal(updated).catch(() => {});
  }, []);

  if (deals === null) {
    return (
      <div data-theme={theme} style={{minHeight:"100vh",background:"var(--bg)",display:"flex",alignItems:"center",justifyContent:"center"}}>
        <div style={{textAlign:"center",color:"var(--muted)"}}>
          <div style={{fontSize:32,marginBottom:12}}>☁️</div>
          <div style={{fontSize:15,fontWeight:700,color:"var(--text)",marginBottom:4}}>Loading…</div>
          <div style={{fontSize:12}}>Restoring your session</div>
        </div>
      </div>
    );
  }

  const syncBadge = syncStatus==="saving"  ? { label:"Syncing…",       color:"#f59e0b" }
                  : syncStatus==="saved"   ? { label:"✓ Synced",       color:"#10b981" }
                  : syncStatus==="offline" ? { label:"📵 Offline",      color:"#8b949e" }
                  : syncStatus==="error"   ? { label:"⚠ Sync error",   color:"#ef4444", detail:syncError }
                  : null;

  // Auth gate
  if (authLoading) return (
    <div data-theme="dark" style={{minHeight:"100vh",background:"var(--bg)",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{color:"var(--accent)",fontSize:15,fontWeight:700}}>Loading…</div>
    </div>
  );
  if (!user) {
    // #app / #signup hash = user clicked a CTA on the landing page, go straight to auth
    const wantsSignup = window.location.hash === '#signup';
    const wantsApp    = window.location.hash === '#app' || wantsSignup;
    if (wantsApp) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      return (
        <div data-theme="dark" style={{minHeight:"100vh"}}>
          <AuthScreen onAuth={setUser} initialMode={wantsSignup ? "signup" : "login"}/>
        </div>
      );
    }
    // Auth callback params (email verify, password reset) must NOT redirect to landing
    const hasAuthParams = window.location.search.includes('code=') ||
                          window.location.search.includes('type=') ||
                          window.location.hash.includes('access_token') ||
                          window.location.hash.includes('type=recovery');
    if (hasAuthParams) {
      return (
        <div data-theme="dark" style={{minHeight:"100vh"}}>
          <AuthScreen onAuth={setUser}/>
        </div>
      );
    }
    // No hash, no auth params = first visit, redirect to landing page
    window.location.replace('/landing.html');
    return null;
  }
  if (showProfile) return (
    <div data-theme={theme} style={{minHeight:"100vh",background:"var(--bg)",color:"var(--text)"}}>
      <div style={{padding:"0 16px"}}>
        <Suspense fallback={null}>
          <ProfilePage user={user} onBack={()=>setShowProfile(false)} onSignOut={handleSignOut} dark={dark} setDark={setDark}/>
        </Suspense>
      </div>
    </div>
  );
  if (showGroups) return (
    <div data-theme={theme} style={{minHeight:"100vh",background:"var(--bg)",color:"var(--text)"}}>
      <Suspense fallback={null}>
        <GroupsPage
          user={user}
          dark={dark}
          onBack={()=>setShowGroups(false)}
          onSelectGroup={(group)=>{ setActiveGroup(group); setShowGroups(false); }}
        />
      </Suspense>
    </div>
  );
  if (showAppSettings) return (
    <div data-theme={theme} style={{minHeight:"100vh",background:"var(--bg)",color:"var(--text)"}}>
      <div style={{padding:"0 16px"}}>
        <Suspense fallback={null}>
          <AppSettingsPage
            user={user}
            dark={dark}
            setDark={setDark}
            onBack={()=>setShowAppSettings(false)}
            onEditProfile={()=>{setShowAppSettings(false); setShowProfile(true);}}
            onSignOut={handleSignOut}
            deals={deals}
          />
        </Suspense>
      </div>
    </div>
  );
  if (showSettings) return (
    <div data-theme={theme} style={{minHeight:"100vh",background:"var(--bg)",color:"var(--text)"}}>
      <div style={{padding:"0 16px"}}>
        <Suspense fallback={null}>
      <SettingsPage prefs={prefs} onSave={(newPrefs, pushFields)=>{
          setPrefs(newPrefs);
          sbWritePrefs(newPrefs).catch(()=>{});
          if (pushFields && pushFields.size > 0 && deals?.length > 0) {
            const has = (k) => pushFields.has(k);
            const updated = deals.map(d => {
              const a = JSON.parse(JSON.stringify(d.assumptions));
              const cc = { ...(a.closingCosts||{}) };
              if (has('downPaymentPct'))   a.downPaymentPct   = newPrefs.downPaymentPct;
              if (has('interestRate'))     a.interestRate     = newPrefs.interestRate;
              if (has('amortYears'))       a.amortYears       = newPrefs.amortYears;
              if (has('vacancyRate'))      a.vacancyRate      = newPrefs.vacancyRate;
              if (has('rentGrowth'))       a.rentGrowth       = newPrefs.rentGrowth;
              if (has('expenseGrowth'))    a.expenseGrowth    = newPrefs.expenseGrowth;
              if (has('appreciationRate')) a.appreciationRate = newPrefs.appreciationRate;
              if (has('taxBracket'))       a.taxBracket       = newPrefs.taxBracket;
              if (has('propertyTaxPct'))   a.propertyTaxPct   = newPrefs.propertyTaxPct;
              if (has('insurancePct'))     a.insurancePct     = newPrefs.insurancePct;
              if (has('maintenancePct'))   a.maintenancePct   = newPrefs.maintenancePct;
              if (has('capexPct'))         a.capexPct         = newPrefs.capexPct;
              if (has('propertyMgmtPct'))  a.propertyMgmtPct  = newPrefs.propertyMgmtPct;
              if (has('cc_title'))        cc.title        = newPrefs.closingCosts?.title;
              if (has('cc_transferTax'))  cc.transferTax  = newPrefs.closingCosts?.transferTax;
              if (has('cc_inspection'))   cc.inspection   = newPrefs.closingCosts?.inspection;
              if (has('cc_attorney'))     cc.attorney     = newPrefs.closingCosts?.attorney;
              if (has('cc_lenderFees'))   cc.lenderFees   = newPrefs.closingCosts?.lenderFees;
              a.closingCosts = cc;
              return { ...d, assumptions: a };
            });
            setDeals(updated);
          }
          setShowSettings(false);
        }} onBack={()=>setShowSettings(false)} deals={deals} dark={dark} setDark={setDark}/>
      </Suspense>
      </div>
    </div>
  );

  return(
    <div data-theme={theme} style={{minHeight:"100vh",background:"var(--bg)",color:"var(--text)"}}>
      {showDisclaimer && (
        <DisclaimerModal user={user} onAcknowledged={() => {
          sbClient.auth.getUser().then(({ data }) => { if (data?.user) setUser(data.user); });
        }}/>
      )}
      <div style={{borderBottom:"1px solid var(--border)",padding:"0 20px",height:60,display:"flex",alignItems:"center",justifyContent:"space-between",background:dark?"var(--card)":"rgba(253,250,246,0.95)",backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)",position:"sticky",top:0,zIndex:100}}>
        {/* Left: logo + breadcrumb */}
        <div style={{display:"flex",alignItems:"center",gap:10,flex:"0 0 auto"}}>
          <a href="/landing.html" style={{display:"flex",alignItems:"center",gap:8,textDecoration:"none"}}>
            <div style={{width:28,height:28,background:"var(--accent)",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0}}>🏠</div>
            <span style={{fontFamily:"'Fraunces',serif",fontWeight:900,fontSize:18,color:"var(--text)",letterSpacing:"-0.5px"}}><span>Rent</span><span style={{color:"var(--accent)"}}>Hack</span></span>
          </a>
          {activeDeal&&<span style={{color:"var(--muted)",fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:140}}>/ {activeDeal.address||"New Deal"}</span>}
        </div>

        {/* Centre: primary nav links — hidden on mobile or when a deal is open */}
        {!activeDeal&&!isMobile&&<nav style={{display:"flex",alignItems:"center",gap:28,position:"absolute",left:"50%",transform:"translateX(-50%)"}}>
          {[
            {label:"How it Works", href:"/landing.html#how"},
            {label:"Pricing",      href:"/landing.html#pricing"},
            {label:"Blog",         href:"/blog/"},
          ].map(({label,href})=>(
            <a key={label} href={href}
              style={{fontSize:14,fontWeight:500,color:"var(--muted)",textDecoration:"none",transition:"color 0.15s",whiteSpace:"nowrap"}}
              onMouseEnter={e=>e.currentTarget.style.color="var(--text)"}
              onMouseLeave={e=>e.currentTarget.style.color="var(--muted)"}>
              {label}
            </a>
          ))}
          <button onClick={()=>setActiveDealId(null)}
            style={{fontSize:14,fontWeight:600,color:"var(--accent)",background:"none",border:"none",cursor:"pointer",padding:0,transition:"opacity 0.15s",whiteSpace:"nowrap"}}
            onMouseEnter={e=>e.currentTarget.style.opacity="0.75"}
            onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
            My Deals
          </button>
        </nav>}

        {/* Right: sync status + utility buttons + avatar */}
        <div style={{display:"flex",alignItems:"center",gap:6,flex:"0 0 auto"}}>
            {syncBadge && (
              <div style={{position:"relative"}}>
                <div title={syncBadge.detail||""} onClick={()=>syncBadge.detail&&setShowSyncDetail(v=>!v)}
                  style={{fontSize:11,fontWeight:700,color:syncBadge.color,cursor:syncBadge.detail?"pointer":"default",whiteSpace:"nowrap"}}>
                  {syncBadge.label}
                </div>
                {showSyncDetail && syncBadge?.detail && (
                  <div style={{position:"absolute",top:24,right:0,background:"var(--card)",border:"1px solid var(--border)",borderRadius:8,padding:"10px 14px",fontSize:11,color:"var(--text)",maxWidth:280,zIndex:200,boxShadow:"0 4px 16px rgba(0,0,0,0.15)",whiteSpace:"pre-wrap"}}>
                    {syncBadge.detail}
                    <button onClick={()=>setShowSyncDetail(false)} style={{display:"block",marginTop:8,background:"none",border:"none",color:"var(--muted)",cursor:"pointer",fontSize:10,padding:0}}>Dismiss</button>
                  </div>
                )}
              </div>
            )}
            {lastSyncedAt && (
              <div style={{fontSize:10,color:"var(--muted)",whiteSpace:"nowrap"}}>
                {!syncBadge && "✓ "}{lastSyncedAt.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})}
              </div>
            )}
            <button onClick={()=>setShowFeedback(true)}
              title="Send feedback"
              style={{background:"none",border:"1px solid var(--border)",borderRadius:4,padding:"2px 7px",fontSize:11,color:"var(--muted)",cursor:"pointer",lineHeight:1.4,flexShrink:0}}>
              💬</button>
            <button onClick={forceRefresh} disabled={syncStatus==="saving"}
              title="Pull latest from cloud"
              style={{background:"none",border:"1px solid var(--border)",borderRadius:4,padding:"2px 7px",fontSize:11,color:"var(--muted)",cursor:syncStatus==="saving"?"not-allowed":"pointer",lineHeight:1.4,flexShrink:0}}>
              {syncStatus==="saving" ? "…" : "↻"}
            </button>
            {(()=>{
              const name = user?.user_metadata?.display_name || "";
              const parts = name.trim().split(" ").filter(Boolean);
              const initials = parts.length >= 2
                ? (parts[0][0] + parts[parts.length-1][0]).toUpperCase()
                : parts.length === 1 ? parts[0].slice(0,2).toUpperCase()
                : (user?.email||"?")[0].toUpperCase();
              return (
                <div ref={profileMenuRef} style={{position:"relative"}}>
                  <button onClick={()=>setProfileMenuOpen(v=>!v)}
                    title={name || user?.email}
                    style={{width:28,height:28,borderRadius:"50%",background:"var(--accent)",border:"2px solid transparent",
                      cursor:"pointer",fontSize:11,fontWeight:800,color:"#fff",display:"flex",alignItems:"center",
                      justifyContent:"center",flexShrink:0,transition:"border-color 0.15s",
                      ...(profileMenuOpen?{borderColor:"var(--accent2)"}:{})}}>
                    {initials}
                  </button>
                  {profileMenuOpen && (
                    <div style={{position:"absolute",right:0,top:36,background:"var(--card)",
                      border:"1px solid var(--border)",borderRadius:10,minWidth:190,zIndex:999,
                      boxShadow:"0 8px 28px rgba(0,0,0,0.45)",overflow:"hidden"}}
                      onMouseLeave={()=>setProfileMenuOpen(false)}>
                      <div style={{padding:"11px 14px",borderBottom:"1px solid var(--border)"}}>
                        <div style={{fontSize:12,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                          {name || "No name set"}
                        </div>
                        <div style={{fontSize:11,color:"var(--muted)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                          {user?.email}
                        </div>
                      </div>
                      <button onClick={()=>{setShowSettings(true);setProfileMenuOpen(false);}}
                        style={{display:"block",width:"100%",textAlign:"left",padding:"10px 14px",
                          background:"none",border:"none",color:"var(--text)",fontSize:13,
                          cursor:"pointer",fontFamily:"inherit"}}>
                        📐 Default Deal Settings
                      </button>
                      <button onClick={()=>{setShowAppSettings(true);setProfileMenuOpen(false);}}
                        style={{display:"block",width:"100%",textAlign:"left",padding:"10px 14px",
                          background:"none",border:"none",color:"var(--text)",fontSize:13,
                          cursor:"pointer",fontFamily:"inherit"}}>
                        ⚙️ Settings
                      </button>
                      <div style={{height:1,background:"var(--border)",margin:"4px 0"}}/>
                      <button onClick={()=>{setShowGroups(true);setProfileMenuOpen(false);}}
                        style={{display:"block",width:"100%",textAlign:"left",padding:"10px 14px",
                          background:"none",border:"none",color:"var(--text)",fontSize:13,
                          cursor:"pointer",fontFamily:"inherit"}}>
                        👥 Deal Groups
                      </button>
                      <button onClick={()=>{setShowProfile(true);setProfileMenuOpen(false);}}
                        style={{display:"block",width:"100%",textAlign:"left",padding:"10px 14px",
                          background:"none",border:"none",color:"var(--text)",fontSize:13,
                          cursor:"pointer",fontFamily:"inherit"}}>
                        👤 My Profile
                      </button>
                      <button onClick={handleSignOut}
                        style={{display:"block",width:"100%",textAlign:"left",padding:"10px 14px",
                          background:"none",border:"none",color:"var(--red)",fontSize:13,
                          cursor:"pointer",fontFamily:"inherit",borderTop:"1px solid var(--border)"}}>
                        ↩ Sign Out
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
      </div>
      <div style={{padding:"18px 16px 0"}}>
        <TrialBanner userEmail={user?.email}/>
        {shareSuccess && (
          <div style={{background:"rgba(13,148,136,0.12)",border:"1px solid rgba(13,148,136,0.35)",borderRadius:10,padding:"10px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,marginBottom:12,fontSize:13}}>
            <span style={{color:"var(--text)",fontWeight:700}}>✓ Deal shared to "{shareSuccess}" successfully.</span>
            <button onClick={()=>setShareSuccess(null)} style={{background:"none",border:"none",color:"var(--muted)",cursor:"pointer",fontSize:16,padding:"0 4px"}}>×</button>
          </div>
        )}
        {showUpgradeSuccess && (
          <div style={{
            background:"rgba(13,148,136,0.12)",
            border:"1px solid rgba(13,148,136,0.35)",
            borderRadius:10,
            padding:"12px 18px",
            display:"flex",
            alignItems:"center",
            justifyContent:"space-between",
            gap:12,
            marginBottom:16,
            fontSize:14,
          }}>
            <span style={{color:"var(--text)",fontWeight:700}}>🎉 Welcome to RentHack Pro! You now have full access.</span>
            <button onClick={()=>setShowUpgradeSuccess(false)} style={{background:"none",border:"none",color:"var(--muted)",cursor:"pointer",fontSize:18,padding:"0 4px"}}>×</button>
          </div>
        )}
        {!activeDeal
          ?(!deals ? <div style={{minHeight:"100vh",background:"var(--bg)",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{color:"var(--muted)",fontSize:14}}>Loading…</div></div> : <PortfolioPage
              deals={activeGroup ? groupDeals : deals}
              onSelect={id=>setActiveDealId(id)}
              onAdd={activeGroup ? addGroupDeal : addDeal}
              onDelete={activeGroup ? deleteGroupDeal : deleteDeal}
              onExport={()=>import('../lib/export').then(m=>m.exportPortfolioXLSX(activeGroup ? groupDeals : deals, user))}
              onReorder={activeGroup ? reorderGroupDeals : reorderDeals}
              dark={dark} setDark={setDark}
              filterState={[portfolioFilter,setPortfolioFilter]}
              onTour={startTour}
              onOpenGroups={()=>setShowGroups(true)}
              activeGroup={activeGroup}
              onExitGroup={()=>setActiveGroup(null)}
              onShareDeal={(deal)=>setShowShareModal(deal)}
            />)
          :<DealPage
              deal={activeDeal}
              onUpdate={activeGroup ? updateGroupDeal : updateDeal}
              onBack={()=>setActiveDealId(null)}
              onExport={()=>import('../lib/export').then(m=>{ trackCSVExported(activeDeal.id); m.exportDealXLSX(activeDeal, user); })}
              onExportPDF={()=>import('../lib/export').then(m=>{ trackPDFExported(activeDeal.id); m.exportDealPDF(activeDeal, user); })}
              onShare={()=>setShowShareModal(activeDeal)}
              groupRole={activeGroup?.role}
              activeGroup={activeGroup}
              currentUser={user}
              prefs={prefs}
              forceTab={tourForceTab}
            />
        }
        {tourActive && <Suspense fallback={null}><GuidedTour step={tourStep} onNext={tourNext} onBack={tourBack} onClose={closeTour}/></Suspense>}
        {showFeedback && <FeedbackModal user={user} onClose={()=>setShowFeedback(false)}/>}
        {showShareModal && (
          <Suspense fallback={null}>
            <ShareDealModal
              deal={showShareModal}
              user={user}
              onClose={()=>setShowShareModal(null)}
              onShared={(groupName)=>{
                setShowShareModal(null);
                setShareSuccess(groupName);
              }}
            />
          </Suspense>
        )}
      </div>
      <div style={{borderTop:'1px solid var(--border)',padding: isMobile ? '5px 16px' : '7px 20px',background:dark?'var(--card)':'rgba(253,250,246,0.95)',textAlign:'center',position:'sticky',bottom:0,zIndex:50}}>
        <span style={{fontSize:isMobile ? 9 : 10,color:'var(--muted)',lineHeight:1.5}}>
          For informational purposes only. Not financial, legal, or tax advice.{!isMobile && ' Consult qualified professionals before making investment decisions.'}{' '}
          <a href="/legal/tos.html" target="_blank" style={{color:'var(--muted)',textDecoration:'underline'}}>Terms</a>
          {' · '}
          <a href="/legal/privacy.html" target="_blank" style={{color:'var(--muted)',textDecoration:'underline'}}>Privacy</a>
        </span>
      </div>
    </div>
  );
}

export default App;
