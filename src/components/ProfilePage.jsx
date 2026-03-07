import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { iSty, btnSm, srcSty } from './ui/InputRow';
import { sbClient } from '../lib/constants';

function ProfilePage({ user, onBack, onSignOut, dark, setDark }) {
  const [displayName, setDisplayName] = useState(user?.user_metadata?.display_name || "");
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [profErr, setProfErr] = useState("");
  const [changingPw, setChangingPw] = useState(false);
  const [newPw, setNewPw]     = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwSaved, setPwSaved] = useState(false);
  const [pwErr, setPwErr]     = useState("");

  const initials = (() => {
    const n = displayName.trim();
    if (!n) return (user?.email || "?")[0].toUpperCase();
    const p = n.split(" ").filter(Boolean);
    return p.length >= 2 ? (p[0][0] + p[p.length-1][0]).toUpperCase() : n.slice(0,2).toUpperCase();
  })();

  const saveProfile = async () => {
    setSaving(true); setProfErr(""); setSaved(false);
    const { error: e } = await authUpdateProfile({ display_name: displayName.trim() });
    setSaving(false);
    if (e) { setProfErr(e.message); return; }
    setSaved(true); setTimeout(() => setSaved(false), 2500);
  };

  const changePw = async () => {
    if (newPw.length < 8) { setPwErr("Password must be at least 8 characters."); return; }
    if (newPw !== confirmPw) { setPwErr("Passwords do not match."); return; }
    setSaving(true); setPwErr(""); setPwSaved(false);
    const { error: e } = await authUpdatePassword(newPw);
    setSaving(false);
    if (e) { setPwErr(e.message); return; }
    setPwSaved(true); setNewPw(""); setConfirmPw(""); setChangingPw(false);
    setTimeout(() => setPwSaved(false), 3000);
  };

  const iS = { width:"100%", padding:"10px 13px", borderRadius:8, fontSize:14,
    border:"1px solid var(--border)", background:"var(--input-bg)", color:"var(--text)", fontFamily:"inherit" };
  const card = { background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, padding:24, marginBottom:14 };

  return (
    <div style={{maxWidth:540, margin:"0 auto", paddingBottom:40}}>
      <div style={{display:"flex", alignItems:"center", gap:12, margin:"20px 0 24px"}}>
        <button onClick={onBack} style={{background:"var(--card)", border:"1px solid var(--border)",
          borderRadius:8, padding:"8px 14px", color:"var(--text)", fontSize:13, cursor:"pointer", fontWeight:600}}>
          ← Back
        </button>
        <div style={{fontWeight:800, fontSize:18}}>Account & Profile</div>
      </div>

      {/* Avatar + info */}
      <div style={card}>
        <div style={{display:"flex", alignItems:"center", gap:16, marginBottom:20}}>
          <div style={{width:60, height:60, borderRadius:"50%", background:"var(--accent)", flexShrink:0,
            display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, fontWeight:800, color:"#fff"}}>
            {initials}
          </div>
          <div>
            <div style={{fontWeight:700, fontSize:15}}>{displayName || user?.email}</div>
            <div style={{color:"var(--muted)", fontSize:13}}>{user?.email}</div>
            <div style={{fontSize:11, color:"var(--muted)", marginTop:2}}>
              Member since {new Date(user?.created_at).toLocaleDateString("en-US",{month:"long",year:"numeric"})}
            </div>
          </div>
        </div>
        <div style={{display:"flex", flexDirection:"column", gap:10}}>
          <div>
            <label style={{fontSize:11, fontWeight:700, color:"var(--muted)", textTransform:"uppercase",
              letterSpacing:"0.06em", display:"block", marginBottom:4}}>Display Name</label>
            <input value={displayName} onChange={e=>setDisplayName(e.target.value)}
              placeholder="Your full name" style={iS} onKeyDown={e=>e.key==="Enter"&&saveProfile()} />
          </div>
          <div>
            <label style={{fontSize:11, fontWeight:700, color:"var(--muted)", textTransform:"uppercase",
              letterSpacing:"0.06em", display:"block", marginBottom:4}}>Email</label>
            <input value={user?.email || ""} disabled
              style={{...iS, opacity:0.55, cursor:"not-allowed"}} />
          </div>
          {profErr && <div style={{color:"#ef4444", fontSize:13}}>{profErr}</div>}
          {saved   && <div style={{color:"#10b981", fontSize:13, fontWeight:600}}>✓ Profile saved</div>}
          <button onClick={saveProfile} disabled={saving}
            style={{background:"var(--accent)", color:"#fff", border:"none", borderRadius:8,
              padding:"10px", fontSize:14, fontWeight:700, cursor:"pointer", opacity:saving?.7:1}}>
            {saving ? "Saving…" : "Save Profile"}
          </button>
        </div>
      </div>

      {/* Password */}
      <div style={card}>
        <div style={{fontWeight:700, fontSize:14, marginBottom:14}}>Password</div>
        {!changingPw
          ? <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
              <span style={{color:"var(--muted)", fontSize:13, letterSpacing:2}}>••••••••••</span>
              <button onClick={()=>setChangingPw(true)}
                style={{background:"var(--card)", border:"1px solid var(--border)", borderRadius:6,
                  padding:"7px 14px", fontSize:13, fontWeight:600, cursor:"pointer", color:"var(--text)"}}>
                Change
              </button>
            </div>
          : <div style={{display:"flex", flexDirection:"column", gap:10}}>
              <input type="password" placeholder="New password (min 8 chars)" value={newPw}
                onChange={e=>{setNewPw(e.target.value);setPwErr("");}} style={iS} />
              <input type="password" placeholder="Confirm new password" value={confirmPw}
                onChange={e=>{setConfirmPw(e.target.value);setPwErr("");}} style={iS}
                onKeyDown={e=>e.key==="Enter"&&changePw()} />
              {pwErr   && <div style={{color:"#ef4444", fontSize:13}}>{pwErr}</div>}
              {pwSaved && <div style={{color:"#10b981", fontSize:13, fontWeight:600}}>✓ Password updated</div>}
              <div style={{display:"flex", gap:8}}>
                <button onClick={changePw} disabled={saving}
                  style={{flex:1, background:"var(--accent)", color:"#fff", border:"none",
                    borderRadius:8, padding:"10px", fontSize:14, fontWeight:700, cursor:"pointer", opacity:saving?.7:1}}>
                  {saving ? "Updating…" : "Update Password"}
                </button>
                <button onClick={()=>{setChangingPw(false);setNewPw("");setConfirmPw("");setPwErr("");}}
                  style={{flex:1, background:"none", border:"1px solid var(--border)", borderRadius:8,
                    padding:"10px", fontSize:14, color:"var(--muted)", cursor:"pointer"}}>
                  Cancel
                </button>
              </div>
            </div>
        }
      </div>



      {/* Sign out */}
      <div style={card}>
        <div style={{fontWeight:700, fontSize:14, marginBottom:4}}>Sign Out</div>
        <div style={{color:"var(--muted)", fontSize:13, marginBottom:14}}>
          You'll need to sign back in to access your deals.
        </div>
        <button onClick={onSignOut}
          style={{background:"#fee2e2", color:"#991b1b", border:"1px solid #fca5a5",
            borderRadius:8, padding:"10px 20px", fontSize:14, fontWeight:700, cursor:"pointer"}}>
          Sign Out
        </button>
      </div>
    </div>
  );
}


// ─── SETTINGS PAGE ────────────────────────────────────────────────────────────

export default ProfilePage;
