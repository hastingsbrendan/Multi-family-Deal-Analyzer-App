// ─── App Settings page ────────────────────────────────────────────────────────
// Appearance (dark mode), Account info, and Sign Out.
// Extracted from App.jsx inline block — props mirror the original callbacks.

import React, { useState } from 'react';

function AppSettingsPage({ user, dark, setDark, onBack, onEditProfile, onSignOut, deals }) {
  const toggleDark = () => {
    const nd = !dark;
    setDark(nd);
    localStorage.setItem("rh_dark", nd);
  };

  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportDone, setExportDone] = useState(false);

  const handleExport = async () => {
    setExportLoading(true);
    try {
      const exportPayload = {
        exportedAt: new Date().toISOString(),
        user: {
          email: user?.email,
          displayName: user?.user_metadata?.display_name || '',
          createdAt: user?.created_at,
          plan: user?.user_metadata?.plan || 'free',
        },
        deals: (deals || []).map(d => ({ ...d })),
      };
      const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'renthack_data_export_' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExportDone(true);
      setTimeout(() => setExportDone(false), 3000);
    } catch (e) {
      console.error('Export failed:', e);
    }
    setExportLoading(false);
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== 'DELETE') return;
    setDeleteLoading(true);
    setDeleteError('');
    try {
      const { sbClient } = await import('../lib/constants');
      const { data: { session } } = await sbClient.auth.getSession();
      if (!session) throw new Error('No active session — please sign in again.');
      const res = await fetch(
        'https://lxkwvayalxuoryuwxtsq.supabase.co/functions/v1/delete-account',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + session.access_token,
          },
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Deletion failed');
      // Clear local state and redirect
      localStorage.clear();
      await sbClient.auth.signOut();
      window.location.replace('/landing.html');
    } catch (e) {
      setDeleteError(e.message || 'Something went wrong. Please try again or contact support@renthack.io.');
      setDeleteLoading(false);
    }
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
          style={{background:"rgba(239,68,68,0.07)", color:"var(--red)", border:"1px solid rgba(239,68,68,0.3)",
            borderRadius:8, padding:"10px 20px", fontSize:14, fontWeight:700, cursor:"pointer"}}>
          Sign Out
        </button>
      </div>

      {/* Data & Privacy */}
      <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,padding:24,marginBottom:14}}>
        <div style={{fontWeight:700,fontSize:14,marginBottom:14}}>Data &amp; Privacy</div>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <div>
            <div style={{fontSize:14,fontWeight:500}}>Export my data</div>
            <div style={{fontSize:12,color:"var(--muted)",marginTop:2}}>Download all your deals, notes and preferences as JSON</div>
          </div>
          <button
            onClick={handleExport}
            disabled={exportLoading}
            style={{background:"none",border:"1px solid var(--border)",borderRadius:7,padding:"7px 14px",fontSize:13,cursor:exportLoading?"default":"pointer",color:"var(--text)",fontWeight:600,opacity:exportLoading?0.6:1,fontFamily:"inherit",flexShrink:0}}
          >
            {exportLoading ? 'Exporting…' : exportDone ? '✓ Downloaded' : 'Export'}
          </button>
        </div>
        <div style={{fontSize:12,color:"var(--muted)",lineHeight:1.5}}>
          Your data is yours.{' '}
          <a href="/legal/privacy.html" target="_blank" style={{color:"var(--accent)"}}>Privacy Policy</a>
          {' '}·{' '}
          <a href="/legal/tos.html" target="_blank" style={{color:"var(--accent)"}}>Terms of Service</a>
        </div>
      </div>

      {/* Danger Zone */}
      <div style={{background:"var(--card)",border:"1px solid rgba(239,68,68,0.35)",borderRadius:12,padding:24,marginBottom:14}}>
        <div style={{fontWeight:700,fontSize:14,color:"var(--red)",marginBottom:4}}>Danger Zone</div>
        <div style={{color:"var(--muted)",fontSize:13,marginBottom:14,lineHeight:1.5}}>
          Permanently deletes your account, all deals, and cancels your subscription. This cannot be undone.
        </div>
        {!showDeleteModal ? (
          <button
            onClick={() => setShowDeleteModal(true)}
            style={{background:"rgba(239,68,68,0.07)",color:"var(--red)",border:"1px solid rgba(239,68,68,0.3)",borderRadius:8,padding:"10px 20px",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}
          >
            Delete my account
          </button>
        ) : (
          <div>
            <div style={{fontSize:13,color:"var(--muted)",marginBottom:10,lineHeight:1.5}}>
              Type <strong style={{color:"var(--text)"}}>DELETE</strong> to confirm permanent account deletion:
            </div>
            <input
              value={deleteConfirm}
              onChange={e => setDeleteConfirm(e.target.value)}
              placeholder="Type DELETE to confirm"
              style={{width:"100%",padding:"10px 13px",borderRadius:8,fontSize:14,border:"1px solid rgba(239,68,68,0.35)",background:"var(--input-bg)",color:"var(--text)",fontFamily:"inherit",marginBottom:10}}
            />
            {deleteError && (
              <div style={{color:"var(--red)",fontSize:13,padding:"8px 10px",background:"rgba(239,68,68,0.07)",borderRadius:6,marginBottom:10}}>{deleteError}</div>
            )}
            <div style={{display:'flex',gap:10}}>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteConfirm !== 'DELETE' || deleteLoading}
                style={{background:"var(--red)",color:"#fff",border:"none",borderRadius:8,padding:"10px 20px",fontSize:14,fontWeight:700,cursor:(deleteConfirm==='DELETE'&&!deleteLoading)?"pointer":"default",opacity:(deleteConfirm==='DELETE'&&!deleteLoading)?1:0.5,fontFamily:"inherit",flex:1}}
              >
                {deleteLoading ? 'Deleting…' : 'Permanently delete my account'}
              </button>
              <button
                onClick={() => { setShowDeleteModal(false); setDeleteConfirm(''); setDeleteError(''); }}
                style={{background:"none",border:"1px solid var(--border)",borderRadius:8,padding:"10px 16px",fontSize:14,cursor:"pointer",color:"var(--text)",fontFamily:"inherit"}}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Legal footer */}
      <div style={{textAlign:'center',marginTop:32,paddingTop:20,borderTop:'1px solid var(--border)'}}>
        <div style={{fontSize:12,color:'var(--muted)',lineHeight:1.6}}>
          For informational purposes only. Not financial, legal, or tax advice.
        </div>
        <div style={{fontSize:12,marginTop:6,display:'flex',gap:16,justifyContent:'center'}}>
          <a href="/legal/tos.html" target="_blank" style={{color:'var(--muted)',textDecoration:'none',fontSize:12}}>Terms of Service</a>
          <a href="/legal/privacy.html" target="_blank" style={{color:'var(--muted)',textDecoration:'none',fontSize:12}}>Privacy Policy</a>
        </div>
      </div>
    </div>
  );
}

export default AppSettingsPage;
