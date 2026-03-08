import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import * as Sentry from '@sentry/react';
import { iSty } from './ui/InputRow';
import { sbClient, STORAGE_KEY, STATUS_OPTIONS, FMT_USD, loadLocal, saveLocal, sbRead, sbWrite, sbWritePrefs, authGetSession, authSignOut } from '../lib/constants';
import { calcDeal, DEFAULT_PREFS, newDeal, sbGetGroupDeals, sbWriteGroupDeals } from '../lib/calc';
import { dlFile, exportDealCSV, exportDealPDF, exportPortfolioCSV } from '../lib/export';
import { useIsMobile, useOnlineStatus } from '../lib/hooks';
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
  const [deals, setDeals] = useState(null);
  const [activeDealId, setActiveDealId] = useState(null);
  const [syncStatus, setSyncStatus] = useState("idle");
  const [syncError, setSyncError] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [portfolioFilter, setPortfolioFilter] = useState("All");
  const syncTimer = useRef(null);
  const lastCloudUpdate = useRef(null);
  const isOnline = useOnlineStatus();

  // Bootstrap: restore session from localStorage on mount, then listen for changes
  useEffect(() => {
    authGetSession().then(({ data: { session } }) => {
      const u = session?.user || false;
      setUser(u);
      setAuthLoading(false);
      if (u) {
        Sentry.setUser({ id: u.id, email: u.email });
        // Show user-scoped local cache immediately (empty array for new users / new devices)
        const local = loadLocal(u.id);
        setDeals(local);
        // Always fetch from cloud — cloud is source of truth, local is just a cache
        setTimeout(() => {
          sbRead()
            .then(({ data: cloudDeals, prefs: cloudPrefs, updated_at }) => {
              lastCloudUpdate.current = updated_at;
              if (cloudPrefs) { const p = { ...DEFAULT_PREFS, ...cloudPrefs }; setPrefs(p); window.__userPrefs = p; }
              if (cloudDeals.length > 0) {
                setDeals(cloudDeals);
                saveLocal(cloudDeals, u.id);
              } else if (local.length > 0) {
                // First login on new device — push cached local up to cloud
                sbWrite(local).catch(() => {});
              } else {
                // Brand new user — show onboarding tour
                setShowTour(true);
              }
              // New user with no data anywhere — stays as empty array, correct
            })
            .catch(() => {}); // keep local cache on network error
        }, 300);
      }
    });
    const { data: { subscription } } = sbClient.auth.onAuthStateChange((evt, session) => {
      const u = session?.user || false;
      setUser(u);
      if (u) Sentry.setUser({ id: u.id, email: u.email });
      else Sentry.setUser(null);
      if (u && (evt === "SIGNED_IN" || evt === "USER_UPDATED")) {
        // Clean up hash after Supabase has processed it
        if (window.location.hash.includes("access_token")) {
          window.history.replaceState(null, "", window.location.pathname);
        }
        // Use user-scoped local cache — never bleed another user's data
        const local = loadLocal(u.id);
        setDeals(local);
        setTimeout(() => {
          sbRead()
            .then(({ data: cloudDeals, updated_at }) => {
              lastCloudUpdate.current = updated_at;
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

  // Re-pull from cloud when tab regains visibility or window is focused (cross-device sync)
  useEffect(() => {
    const pull = () => {
      if (!user || !isOnline || syncStatus === "saving") return;
      sbRead()
        .then(({ data: cloudDeals, updated_at }) => {
          // If updated_at isn't available, always apply cloud data to stay safe
          if (updated_at && updated_at === lastCloudUpdate.current) return;
          lastCloudUpdate.current = updated_at;
          setDeals(cloudDeals);
          saveLocal(cloudDeals, user?.id);
          setSyncStatus("saved");
          setLastSyncedAt(new Date());
          setTimeout(() => setSyncStatus("idle"), 2000);
        })
        .catch(() => {});
    };
    const onVisible = () => { if (document.visibilityState === "visible") pull(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", pull);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", pull);
    };
  }, [isOnline, syncStatus]);

  useEffect(() => {
    if (deals === null || !user) return;
    saveLocal(deals, user?.id);
    if (!isOnline) { setSyncStatus("offline"); return; }
    clearTimeout(syncTimer.current);
    setSyncStatus("saving");
    syncTimer.current = setTimeout(async () => {
      try {
        await sbWrite(deals);
        setSyncStatus("saved");
        setSyncError("");
        setLastSyncedAt(new Date());
        setTimeout(() => setSyncStatus("idle"), 2000);
      } catch(e) { setSyncStatus("error"); setSyncError(e.message); }
    }, 800);
  }, [deals, isOnline]);

  // Re-attempt sync when coming back online
  useEffect(() => {
    if (isOnline && syncStatus === "offline" && deals !== null) {
      sbWrite(deals)
        .then(() => { setSyncStatus("saved"); setLastSyncedAt(new Date()); setTimeout(() => setSyncStatus("idle"), 2000); })
        .catch(e => { setSyncStatus("error"); setSyncError(e.message); });
    }
  }, [isOnline]);

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
  React.useEffect(() => {
    if (!activeGroup) return;
    sbGetGroupDeals(activeGroup.id).then(d => setGroupDeals(d || []));
  }, [activeGroup?.id]);

  const saveGroupDeals = React.useCallback((updated) => {
    setGroupDeals(updated);
    if (activeGroup) sbWriteGroupDeals(activeGroup.id, updated).catch(()=>{});
  }, [activeGroup?.id]);

  const forceRefresh = () => {
    setSyncStatus("saving");
    sbRead()
      .then(({ data: cloudDeals, updated_at }) => {
        lastCloudUpdate.current = updated_at;
        setDeals(cloudDeals);
        saveLocal(cloudDeals);
        setSyncStatus("saved");
        setLastSyncedAt(new Date());
        setTimeout(() => setSyncStatus("idle"), 2000);
      })
      .catch(e => { setSyncStatus("error"); setSyncError(e.message); });
  };

  const D = dark ? {
    bg:"#0f172a",card:"#1e293b",border:"#334155",borderFaint:"#1e293b",text:"#f1f5f9",muted:"#94a3b8",accent:"#0D9488",accent2:"#F59E0B",accentSoft:"rgba(13,148,136,0.12)",inputBg:"#0f172a",tableHead:"#1e293b",rowHover:"rgba(13,148,136,0.08)",rowSub:"rgba(15,23,42,0.5)",scrollThumb:"#334155"
  } : {
    bg:"#FDFAF6",card:"#FFFFFF",border:"#E2E8F0",borderFaint:"#F5EFE6",text:"#1E293B",muted:"#64748B",accent:"#0D9488",accent2:"#D97706",accentSoft:"rgba(13,148,136,0.08)",inputBg:"#F8FAFC",tableHead:"#F5EFE6",rowHover:"rgba(13,148,136,0.05)",rowSub:"rgba(245,239,230,0.6)",scrollThumb:"#CBD5E1"
  };

  if (deals === null) {
    return (
      <div style={{minHeight:"100vh",background:D.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'DM Sans','Segoe UI',sans-serif"}}>
        <div style={{textAlign:"center",color:D.muted}}>
          <div style={{fontSize:32,marginBottom:12}}>☁️</div>
          <div style={{fontSize:15,fontWeight:700,color:D.text,marginBottom:4}}>Loading…</div>
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
    <div style={{minHeight:"100vh",background:"#0f172a",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{color:"var(--accent, #0D9488)",fontSize:15,fontWeight:700}}>Loading…</div>
    </div>
  );
  if (!user) return (
    <div style={{minHeight:"100vh"}} data-theme="dark">
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}html,body{background:#0f172a;color:#e2e8f0;font-family:'DM Sans','Segoe UI',sans-serif;}input,select,textarea{font-family:inherit;outline:none;}input,select{font-size:16px!important;}:root{--bg:#0f172a;--card:#1e293b;--border:#334155;--border-faint:#1e293b;--text:#e2e8f0;--muted:#94a3b8;--accent:#0D9488;--accent2:#F59E0B;--accent-soft:rgba(13,148,136,0.12);--input-bg:#0f172a;}`}</style>
      <AuthScreen onAuth={setUser}/>
    </div>
  );
  if (showProfile) return (
    <div data-theme={dark?"dark":"light"} style={{minHeight:"100vh",background:"var(--bg)",color:"var(--text)"}}>
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}html,body{background:#0f172a;color:#e2e8f0;font-family:'DM Sans','Segoe UI',sans-serif;}input,select,textarea{font-family:inherit;outline:none;}input,select{font-size:16px!important;}:root{--bg:#0f172a;--card:#1e293b;--border:#334155;--border-faint:#1e293b;--text:#e2e8f0;--muted:#94a3b8;--accent:#0D9488;--input-bg:#0f172a;--table-head:#1e293b;--row-hover:rgba(13,148,136,0.08);--row-sub:#1a2744;}`}</style>
      <div style={{padding:"0 16px"}}>
        <ProfilePage user={user} onBack={()=>setShowProfile(false)} onSignOut={handleSignOut} dark={dark} setDark={setDark}/>
      </div>
    </div>
  );
  if (showGroups) return (
    <div style={{minHeight:"100vh",background:"var(--bg)",color:"var(--text)"}}>
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}html,body{background:#0f172a;color:#e2e8f0;font-family:'DM Sans','Segoe UI',sans-serif;}input,select,textarea{font-family:inherit;outline:none;}input,select{font-size:16px!important;}:root{--bg:#0f172a;--card:#1e293b;--border:#334155;--border-faint:#1e293b;--text:#e2e8f0;--muted:#94a3b8;--accent:#0D9488;--input-bg:#0f172a;--table-head:#1e293b;--row-hover:rgba(13,148,136,0.08);--row-sub:#1a2744;}`}</style>
      <GroupsPage
        user={user}
        dark={dark}
        onBack={()=>setShowGroups(false)}
        onSelectGroup={(group)=>{ setActiveGroup(group); setShowGroups(false); }}
      />
    </div>
  );
  if (showAppSettings) return (
    <div style={{minHeight:"100vh",background:"var(--bg)",color:"var(--text)"}}>
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}html,body{background:#0f172a;color:#e2e8f0;font-family:'DM Sans','Segoe UI',sans-serif;}input,select,textarea{font-family:inherit;outline:none;}input,select{font-size:16px!important;}:root{--bg:#0f172a;--card:#1e293b;--border:#334155;--border-faint:#1e293b;--text:#e2e8f0;--muted:#94a3b8;--accent:#0D9488;--input-bg:#0f172a;--table-head:#1e293b;--row-hover:rgba(13,148,136,0.08);--row-sub:#1a2744;}`}</style>
      <div style={{padding:"0 16px"}}>
        <div style={{maxWidth:480, margin:"0 auto", paddingBottom:40}}>
          <div style={{display:"flex", alignItems:"center", gap:12, margin:"20px 0 24px"}}>
            <button onClick={()=>setShowAppSettings(false)} style={{background:"var(--card)", border:"1px solid var(--border)",
              borderRadius:8, padding:"8px 14px", color:"var(--text)", fontSize:13, cursor:"pointer", fontWeight:600}}>
              ← Back
            </button>
            <div style={{fontWeight:800, fontSize:18}}>Settings</div>
          </div>
          {/* Appearance */}
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
          {/* Account */}
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
          {/* Sign out */}
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
    <div style={{minHeight:"100vh",background:"var(--bg)",color:"var(--text)"}}>
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}html,body{background:#0f172a;color:#e2e8f0;font-family:'DM Sans','Segoe UI',sans-serif;}input,select,textarea{font-family:inherit;outline:none;}input,select{font-size:16px!important;}:root{--bg:#0f172a;--card:#1e293b;--border:#334155;--border-faint:#1e293b;--text:#e2e8f0;--muted:#94a3b8;--accent:#0D9488;--input-bg:#0f172a;--table-head:#1e293b;--row-hover:rgba(13,148,136,0.08);--row-sub:#1a2744;}`}</style>
      <div style={{padding:"0 16px"}}>
        <SettingsPage prefs={prefs} onSave={(newPrefs, applyToDeals)=>{
          setPrefs(newPrefs);
          window.__userPrefs = newPrefs;
          sbWritePrefs(newPrefs).catch(()=>{});
          if (applyToDeals && deals?.length > 0) {
            const updated = deals.map(d => {
              const a = JSON.parse(JSON.stringify(d.assumptions));
              // Only overwrite fields that match the original default (user hasn't customized them)
              if (a.downPaymentPct   === d._defaultDownPct   || true) a.downPaymentPct   = newPrefs.downPaymentPct;
              if (a.interestRate     === d._defaultRate       || true) a.interestRate     = newPrefs.interestRate;
              if (a.amortYears       === d._defaultAmort      || true) a.amortYears       = newPrefs.amortYears;
              a.vacancyRate      = newPrefs.vacancyRate;
              a.rentGrowth       = newPrefs.rentGrowth;
              a.expenseGrowth    = newPrefs.expenseGrowth;
              a.appreciationRate = newPrefs.appreciationRate;
              a.taxBracket       = newPrefs.taxBracket;
              return { ...d, assumptions: a };
            });
            setDeals(updated);
          }
          setShowSettings(false);
        }} onBack={()=>setShowSettings(false)} deals={deals} dark={dark} setDark={setDark}/>
      </div>
    </div>
  );

  return(<>
    <style>{`
      *{box-sizing:border-box;margin:0;padding:0;}
      html,body{background:${D.bg};color:${D.text};font-family:'DM Sans','Segoe UI',sans-serif;min-height:100%;}
      input,select,textarea{font-family:inherit;outline:none;}
      input,select{font-size:16px !important;}
      textarea{font-size:14px;}
      input[type=number]::-webkit-inner-spin-button{opacity:.4;}
      select option{background:${D.card};color:${D.text};}
      :root{
        --bg:${D.bg};--card:${D.card};--border:${D.border};--border-faint:${D.borderFaint};
        --text:${D.text};--muted:${D.muted};--accent:${D.accent};--accent2:${D.accent2};
        --accent-soft:${D.accentSoft};--input-bg:${D.inputBg};--table-head:${D.tableHead};
        --row-hover:${D.rowHover};--row-sub:${D.rowSub};
      }
      ::-webkit-scrollbar{width:4px;height:4px;}
      ::-webkit-scrollbar-track{background:transparent;}
      ::-webkit-scrollbar-thumb{background:${D.scrollThumb};border-radius:3px;}
      div[style*="overflowX"]::-webkit-scrollbar{height:3px;}
    `}</style>
    <div style={{minHeight:"100vh",background:"var(--bg)",color:"var(--text)"}}>
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
            {/* ── Profile avatar + dropdown ── */}
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
              onAdd={activeGroup
                ? ()=>{ const d=newDeal(prefs); saveGroupDeals([...(groupDeals||[]),d]); setActiveDealId(d.id); }
                : addDeal}
              onDelete={activeGroup
                ? (id)=>saveGroupDeals((groupDeals||[]).filter(d=>d.id!==id))
                : deleteDeal}
              onExport={()=>exportPortfolioCSV(activeGroup ? groupDeals : deals)}
              onReorder={activeGroup
                ? (neo)=>saveGroupDeals(neo)
                : reorderDeals}
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
              onUpdate={activeGroup
                ? (u)=>saveGroupDeals((groupDeals||[]).map(d=>d.id===u.id?u:d))
                : updateDeal}
              onBack={()=>setActiveDealId(null)}
              onExport={()=>exportDealCSV(activeDeal)}
              onExportPDF={()=>exportDealPDF(activeDeal)}
              onShare={()=>setShowShareModal(activeDeal)}
              groupRole={activeGroup?.role}
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
  </>);
}



export default App;
