import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import * as Sentry from '@sentry/react';
import { iSty } from './ui/InputRow';
import { sbClient, STORAGE_KEY, STATUS_OPTIONS, FMT_USD, loadLocal, saveLocal, sbRead, sbWrite, sbWriteDeal, sbDeleteDeal, sbWritePrefs, authGetSession, authSignOut } from '../lib/constants';
import { calcDeal, DEFAULT_PREFS, newDeal, sbGetGroupDeals, sbShareDealToGroup, sbRemoveDealFromGroup, sbReorderGroupDeals } from '../lib/calc';
import { dlFile, exportDealCSV, exportDealPDF, exportPortfolioCSV } from '../lib/export';
import { useIsMobile, useOnlineStatus } from '../lib/hooks';
import { useCloudSync } from '../lib/useCloudSync';
import AuthScreen from './AuthScreen';
import PortfolioPage from './PortfolioPage';
import DealPage from './DealPage';
import ProfilePage from './ProfilePage';
import SettingsPage from './SettingsPage';
import GroupsPage from './GroupsPage';
import ShareDealModal from './ShareDealModal';
import OnboardingTour from './OnboardingTour';
import UndoToast from './ui/UndoToast';

function App() {
  const [dark, setDark] = useState(() => localStorage.getItem("rh_dark") === "true");
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showProfile, setShowProfile] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAppSettings, setShowAppSettings] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [showGroups, setShowGroups] = useState(false);
  const [activeGroup, setActiveGroup] = useState(null); // {id, name, role} or null = personal
  const [groupDeals, setGroupDeals] = useState([]);
  const [showShareModal, setShowShareModal] = useState(null); // deal to share
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [activeDealId, setActiveDealId] = useState(null);
  const [portfolioFilter, setPortfolioFilter] = useState("All");
  const isOnline = useOnlineStatus();

  const { deals, setDeals, syncStatus, syncError, lastSyncedAt, forceRefresh, setLastCloudUpdate } = useCloudSync(user, isOnline);

  const theme = dark ? "dark" : "light";

  // Bootstrap: restore session from localStorage on mount, then listen for changes
  useEffect(() => {
    authGetSession().then(({ data: { session } }) => {
      const u = session?.user || false;
      setUser(u);
      setAuthLoading(false);
      if (u) {
        Sentry.setUser({ id: u.id, email: u.email });
        const local = loadLocal(u.id);
        setDeals(local);
        setTimeout(() => {
          sbRead()
            .then(({ data: cloudDeals, prefs: cloudPrefs, updated_at }) => {
              setLastCloudUpdate(updated_at);
              if (cloudPrefs) { const p = { ...DEFAULT_PREFS, ...cloudPrefs }; setPrefs(p); }
              if (cloudDeals.length > 0) {
                setDeals(cloudDeals);
                saveLocal(cloudDeals, u.id);
              } else if (local.length > 0) {
                sbWrite(local).catch(() => {});
              } else {
                setShowTour(true);
              }
            })
            .catch(() => {});
        }, 300);
      }
    });
    const { data: { subscription } } = sbClient.auth.onAuthStateChange((evt, session) => {
      const u = session?.user || false;
      setUser(u);
      if (u) Sentry.setUser({ id: u.id, email: u.email });
      else Sentry.setUser(null);
      if (u && (evt === "SIGNED_IN" || evt === "USER_UPDATED")) {
        if (window.location.hash.includes("access_token")) {
          window.history.replaceState(null, "", window.location.pathname);
        }
        const local = loadLocal(u.id);
        setDeals(local);
        setTimeout(() => {
          sbRead()
            .then(({ data: cloudDeals, updated_at }) => {
              setLastCloudUpdate(updated_at);
              if (cloudDeals.length > 0) { setDeals(cloudDeals); saveLocal(cloudDeals, u.id); }
              else if (local.length > 0) { sbWrite(local).catch(() => {}); }
            })
            .catch(() => {});
        }, 300);
      }
      if (!u) { setDeals([]); setActiveDealId(null); setShowProfile(false); }
    });
    return () => subscription.unsubscribe();
  }, []);

  const addDeal      = () => { const d=newDeal(prefs); setDeals(p=>[...p,d]); setActiveDealId(d.id); };
  const updateDeal   = useCallback((u) => { setDeals(p=>p.map(d=>d.id===u.id?u:d)); }, []);
  const deleteDeal   = (id) => setDeals(p=>p.filter(d=>d.id!==id));
  const reorderDeals = useCallback((next) => { setDeals(next); }, []);
  const activeDeal   = (activeGroup ? (groupDeals||[]) : (deals||[])).find(d=>d.id===activeDealId);

  const handleSignOut = async () => {
    await authSignOut();
    Sentry.setUser(null);
    setDeals(null); setActiveDealId(null);
    setShowProfile(false); setShowSettings(false); setShowAppSettings(false); setShowGroups(false); setActiveGroup(null); setGroupDeals([]); setProfileMenuOpen(false);
    setPrefs(DEFAULT_PREFS);
    saveLocal([]);
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
  if (!user) return (
    <div data-theme="dark" style={{minHeight:"100vh"}}>
      <AuthScreen onAuth={setUser}/>
    </div>
  );
  if (showProfile) return (
    <div data-theme={theme} style={{minHeight:"100vh",background:"var(--bg)",color:"var(--text)"}}>
      <div style={{padding:"0 16px"}}>
        <ProfilePage user={user} onBack={()=>setShowProfile(false)} onSignOut={handleSignOut} dark={dark} setDark={setDark}/>
      </div>
    </div>
  );
  if (showGroups) return (
    <div data-theme={theme} style={{minHeight:"100vh",background:"var(--bg)",color:"var(--text)"}}>
      <GroupsPage
        user={user}
        dark={dark}
        onBack={()=>setShowGroups(false)}
        onSelectGroup={(group)=>{ setActiveGroup(group); setShowGroups(false); }}
      />
    </div>
  );
  if (showAppSettings) return (
    <div data-theme={theme} style={{minHeight:"100vh",background:"var(--bg)",color:"var(--text)"}}>
      <div style={{padding:"0 16px"}}>
        <div style={{maxWidth:480, margin:"0 auto", paddingBottom:40}}>
          <div style={{display:"flex", alignItems:"center", gap:12, margin:"20px 0 24px"}}>
            <button onClick={()=>setShowAppSettings(false)} style={{background:"var(--card)", border:"1px solid var(--border)",
              borderRadius:8, padding:"8px 14px", color:"var(--text)", fontSize:13, cursor:"pointer", fontWeight:600}}>
              ← Back
            </button>
            <div style={{fontWeight:800, fontSize:18}}>Settings</div>
          </div>
          <div style={{background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, padding:24, marginBottom:14}}>
            <div style={{fontWeight:700, fontSize:14, marginBottom:14}}>Appearance</div>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
              <div>
                <div style={{fontSize:14, fontWeight:500}}>Dark mode</div>
                <div style={{fontSize:12, color:"var(--muted)", marginTop:2}}>Easy on the eyes for late-night deal analysis</div>
              </div>
              <button onClick={()=>{const nd=!dark;setDark(nd);localStorage.setItem("rh_dark",nd);}} style={{background:dark?"var(--accent)":"#cbd5e1",
                border:"none", borderRadius:20, width:46, height:24, position:"relative", cursor:"pointer",
                transition:"background 0.2s", flexShrink:0}}>
                <div style={{width:16, height:16, background:"#fff", borderRadius:"50%", position:"absolute",
                  top:4, left:dark?26:4, transition:"left 0.2s"}}/>
              </button>
            </div>
          </div>
          <div style={{background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, padding:24, marginBottom:14}}>
            <div style={{fontWeight:700, fontSize:14, marginBottom:14}}>Account</div>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
              <div>
                <div style={{fontSize:14, fontWeight:500}}>{user?.user_metadata?.display_name || "No name set"}</div>
                <div style={{fontSize:12, color:"var(--muted)", marginTop:2}}>{user?.email}</div>
              </div>
              <button onClick={()=>{setShowAppSettings(false); setShowProfile(true);}}
                style={{background:"none", border:"1px solid var(--border)", borderRadius:7,
                  padding:"7px 14px", fontSize:13, cursor:"pointer", color:"var(--text)", fontWeight:600}}>
                Edit Profile
              </button>
            </div>
          </div>
          <div style={{background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, padding:24}}>
            <div style={{fontWeight:700, fontSize:14, marginBottom:4}}>Sign Out</div>
            <div style={{color:"var(--muted)", fontSize:13, marginBottom:14}}>You'll need to sign back in to access your deals.</div>
            <button onClick={handleSignOut}
              style={{background:"#fee2e2", color:"#991b1b", border:"1px solid #fca5a5",
                borderRadius:8, padding:"10px 20px", fontSize:14, fontWeight:700, cursor:"pointer"}}>
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
  if (showSettings) return (
    <div data-theme={theme} style={{minHeight:"100vh",background:"var(--bg)",color:"var(--text)"}}>
      <div style={{padding:"0 16px"}}>
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
      </div>
    </div>
  );

  return(
    <div data-theme={theme} style={{minHeight:"100vh",background:"var(--bg)",color:"var(--text)"}}>
      <div style={{borderBottom:"1px solid var(--border)",padding:"0 20px",height:60,display:"flex",alignItems:"center",justifyContent:"space-between",background:dark?"var(--card)":"rgba(253,250,246,0.95)",backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)",position:"sticky",top:0,zIndex:100}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <a href="index.html" style={{display:"flex",alignItems:"center",gap:8,textDecoration:"none"}}>
            <div style={{width:28,height:28,background:"var(--accent)",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0}}>🏠</div>
            <span style={{fontFamily:"'Fraunces',serif",fontWeight:900,fontSize:18,color:"var(--text)",letterSpacing:"-0.5px"}}><span>Rent</span><span style={{color:"var(--accent)"}}>Hack</span></span>
          </a>
          {activeDeal&&<span style={{color:"var(--muted)",fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:140}}>/ {activeDeal.address||"New Deal"}</span>}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
            {syncBadge && (
              <div title={syncBadge.detail||""} onClick={()=>syncBadge.detail&&alert("Sync error:\n\n"+syncBadge.detail)}
                style={{fontSize:11,fontWeight:700,color:syncBadge.color,cursor:syncBadge.detail?"pointer":"default",whiteSpace:"nowrap"}}>
                {syncBadge.label}
              </div>
            )}
            {lastSyncedAt && (
              <div style={{fontSize:10,color:"var(--muted)",whiteSpace:"nowrap"}}>
                {!syncBadge && "✓ "}{lastSyncedAt.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})}
              </div>
            )}
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
                <div style={{position:"relative"}}>
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
                        📐 Global Assumptions
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
                          background:"none",border:"none",color:"#ef4444",fontSize:13,
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
        {!activeDeal
          ?(!deals ? <div style={{minHeight:"100vh",background:"var(--bg)",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{color:"var(--muted)",fontSize:14}}>Loading…</div></div> : <PortfolioPage
              deals={activeGroup ? groupDeals : deals}
              onSelect={id=>setActiveDealId(id)}
              onAdd={activeGroup ? addGroupDeal : addDeal}
              onDelete={activeGroup ? deleteGroupDeal : deleteDeal}
              onExport={()=>exportPortfolioCSV(activeGroup ? groupDeals : deals)}
              onReorder={activeGroup ? reorderGroupDeals : reorderDeals}
              dark={dark} setDark={setDark}
              filterState={[portfolioFilter,setPortfolioFilter]}
              onTour={()=>setShowTour(true)}
              onOpenGroups={()=>setShowGroups(true)}
              activeGroup={activeGroup}
              onExitGroup={()=>setActiveGroup(null)}
              onShareDeal={(deal)=>setShowShareModal(deal)}
            />)
          :<DealPage
              deal={activeDeal}
              onUpdate={activeGroup ? updateGroupDeal : updateDeal}
              onBack={()=>setActiveDealId(null)}
              onExport={()=>exportDealCSV(activeDeal)}
              onExportPDF={()=>exportDealPDF(activeDeal, user)}
              onShare={()=>setShowShareModal(activeDeal)}
              groupRole={activeGroup?.role}
              activeGroup={activeGroup}
              currentUser={user}
              prefs={prefs}
            />
        }
        {showTour && <OnboardingTour onClose={()=>setShowTour(false)} onDone={()=>setShowTour(false)}/>}
        {showShareModal && (
          <ShareDealModal
            deal={showShareModal}
            user={user}
            onClose={()=>setShowShareModal(null)}
            onShared={(groupName)=>{
              setShowShareModal(null);
              alert(`Deal shared to "${groupName}" successfully.`);
            }}
          />
        )}
      </div>
    </div>
  );
}

export default App;
