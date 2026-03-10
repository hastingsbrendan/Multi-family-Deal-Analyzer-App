// ─── App Settings page ────────────────────────────────────────────────────────
// Appearance (dark mode), Account info, and Sign Out.
// Extracted from App.jsx inline block — props mirror the original callbacks.

import React from 'react';

function AppSettingsPage({ user, dark, setDark, onBack, onEditProfile, onSignOut }) {
  const toggleDark = () => {
    const nd = !dark;
    setDark(nd);
    localStorage.setItem("rh_dark", nd);
  };

  return (
    <div style={{maxWidth:480, margin:"0 auto", paddingBottom:40}}>
      <div style={{display:"flex", alignItems:"center", gap:12, margin:"20px 0 24px"}}>
        <button onClick={onBack} style={{background:"var(--card)", border:"1px solid var(--border)",
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
          <button onClick={toggleDark} style={{background:dark?"var(--accent)":"#cbd5e1",
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
          <button onClick={onEditProfile}
            style={{background:"none", border:"1px solid var(--border)", borderRadius:7,
              padding:"7px 14px", fontSize:13, cursor:"pointer", color:"var(--text)", fontWeight:600}}>
            Edit Profile
          </button>
        </div>
      </div>

      {/* Sign Out */}
      <div style={{background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, padding:24}}>
        <div style={{fontWeight:700, fontSize:14, marginBottom:4}}>Sign Out</div>
        <div style={{color:"var(--muted)", fontSize:13, marginBottom:14}}>You'll need to sign back in to access your deals.</div>
        <button onClick={onSignOut}
          style={{background:"#fee2e2", color:"#991b1b", border:"1px solid #fca5a5",
            borderRadius:8, padding:"10px 20px", fontSize:14, fontWeight:700, cursor:"pointer"}}>
          Sign Out
        </button>
      </div>
    </div>
  );
}

export default AppSettingsPage;
