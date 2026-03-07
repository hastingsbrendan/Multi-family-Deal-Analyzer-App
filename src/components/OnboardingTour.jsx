import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { sbGetMyGroups, sbGetPendingInvites, sbCreateGroup, sbInviteMember, sbRespondToInvite, sbLeaveGroup, sbGetGroupMembers, sbUpdateMemberRole, sbRemoveMember, sbShareDealToGroup } from '../lib/calc';

const TOUR_STEPS = [
  {
    title: "Welcome to RentHack 🏠",
    body: "This tool helps you underwrite 2–4 unit multifamily properties from first look to closing. We'll walk you through the key features in about 60 seconds.",
    icon: "🏠" },
  {
    title: "Your Deal Portfolio",
    body: "The portfolio is your command center. Every deal you're analyzing, under contract, or own lives here. Filter by status, sort by returns, and spot your best opportunities at a glance.",
    icon: "📋" },
  {
    title: "Add a Deal & Enter Assumptions",
    body: "Click '+ Add' to create a new deal. On the Assumptions tab, enter the purchase price, financing terms, rents, and expenses. Every input has a source field so you can track where your numbers came from.",
    icon: "✏️" },
  {
    title: "Auto-fill with Rentcast",
    body: "Paste a Zillow or Redfin listing URL into the Property Lookup panel to auto-fill the address, property details, taxes, and rent estimates — saving you 10+ minutes per deal.",
    icon: "⚡" },
  {
    title: "Deal Summary & Cash Flow",
    body: "The Summary tab shows your key metrics instantly: NOI, CoC return, IRR, cap rate, and monthly cash flow. The Cash Flow tab projects 10 years of performance with full income, expense, and equity detail.",
    icon: "📊" },
  {
    title: "Red Flags & Sensitivity",
    body: "The Red Flags tab auto-checks DSCR, cap rate, and expense ratio against your thresholds. The Sensitivity tab shows how returns shift with different rent or purchase price assumptions.",
    icon: "🚩" },
  {
    title: "Global Assumptions",
    body: "Set your default financing terms, growth rates, and analysis thresholds once in Global Assumptions (⚙️ menu). Every new deal will start with your preferred numbers.",
    icon: "⚙️" },
  {
    title: "You're ready to analyze deals.",
    body: "Start by clicking '+ Add' to create your first deal, or paste a listing URL directly into the Property Lookup panel. Your data syncs automatically across all your devices.",
    icon: "🚀" },
];


// ─── GROUPS PAGE ─────────────────────────────────────────────────────
// ─── SHARE DEAL MODAL ────────────────────────────────────────────────
function ShareDealModal({ deal, user, onClose, onShared }) {
  const [groups, setGroups]   = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [sharing, setSharing] = React.useState(false);
  const [selected, setSelected] = React.useState(null);
  const [msg, setMsg]         = React.useState(null);

  React.useEffect(() => {
    sbGetMyGroups()
      .then(g => {
        setGroups(g.filter(gr => gr.status === 'active' && gr.role !== 'Viewer'));
      })
      .catch(e => {
        setMsg('Could not load groups: ' + e.message);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleShare = async () => {
    if (!selected) return;
    setSharing(true);
    try {
      await sbShareDealToGroup(deal, selected.id);
      onShared(selected.name);
    } catch(e) {
      setMsg('Failed to share: ' + e.message);
      setSharing(false);
    }
  };

  const overlay = {position:'fixed',inset:0,background:'rgba(0,0,0,0.65)',display:'flex',
    alignItems:'center',justifyContent:'center',zIndex:2000,padding:16};
  const box = {background:'var(--card)',border:'1px solid var(--border)',borderRadius:14,
    padding:28,maxWidth:400,width:'100%'};
  const btnPrimary = {background:'var(--accent)',color:'#fff',border:'none',borderRadius:8,
    padding:'10px 20px',fontSize:14,fontWeight:700,cursor:'pointer'};
  const btnGhost = {background:'none',border:'1px solid var(--border)',borderRadius:8,
    padding:'9px 16px',fontSize:13,color:'var(--muted)',cursor:'pointer'};

  return (
    <div style={overlay} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={box}>
        <div style={{fontWeight:800,fontSize:17,marginBottom:4}}>Share Deal</div>
        <div style={{fontSize:13,color:'var(--muted)',marginBottom:18}}>
          {deal.address || 'Untitled Deal'}
        </div>

        {msg && <div style={{background:'#fee2e2',color:'#991b1b',borderRadius:8,
          padding:'8px 12px',marginBottom:12,fontSize:13}}>{msg}</div>}

        {loading ? (
          <div style={{color:'var(--muted)',padding:'20px 0',textAlign:'center'}}>Loading groups…</div>
        ) : groups.length === 0 ? (
          <div style={{textAlign:'center',padding:'20px 0'}}>
            <div style={{fontSize:32,marginBottom:10}}>👥</div>
            <div style={{fontWeight:600,marginBottom:6}}>No groups yet</div>
            <div style={{fontSize:13,color:'var(--muted)'}}>
              Create a group first via the profile menu → Deal Groups.
            </div>
          </div>
        ) : (
          <div style={{marginBottom:18}}>
            <div style={{fontSize:12,fontWeight:700,color:'var(--muted)',textTransform:'uppercase',
              letterSpacing:'0.06em',marginBottom:10}}>Share to Group</div>
            {groups.map(g => (
              <div key={g.id}
                onClick={()=>setSelected(g)}
                style={{display:'flex',alignItems:'center',gap:12,padding:'12px 14px',
                  borderRadius:8,marginBottom:6,cursor:'pointer',
                  border:`2px solid ${selected?.id===g.id ? 'var(--accent)' : 'var(--border)'}`,
                  background: selected?.id===g.id ? 'var(--accent)11' : 'var(--bg)'}}>
                <div style={{width:36,height:36,borderRadius:'50%',background:'var(--accent, #0D9488)',
                  display:'flex',alignItems:'center',justifyContent:'center',
                  fontSize:16,color:'#fff',flexShrink:0}}>
                  {g.name[0].toUpperCase()}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,fontSize:14}}>{g.name}</div>
                  <div style={{fontSize:12,color:'var(--muted)'}}>{g.role}</div>
                </div>
                {selected?.id===g.id && <span style={{color:'var(--accent)',fontSize:18}}>✓</span>}
              </div>
            ))}
          </div>
        )}

        <div style={{display:'flex',gap:10}}>
          <button onClick={handleShare}
            disabled={!selected||sharing||groups.length===0}
            style={{...btnPrimary, opacity:(!selected||sharing)?0.5:1}}>
            {sharing ? 'Sharing…' : 'Share Deal'}
          </button>
          <button onClick={onClose} style={btnGhost}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function GroupsPage({ user, dark, onBack, onSelectGroup }) {
  const [groups, setGroups]           = React.useState([]);
  const [pending, setPending]         = React.useState([]);
  const [loading, setLoading]         = React.useState(true);
  const [showCreate, setShowCreate]   = React.useState(false);
  const [showInvite, setShowInvite]   = React.useState(null); // groupId
  const [showMembers, setShowMembers] = React.useState(null); // group obj
  const [members, setMembers]         = React.useState([]);
  const [newName, setNewName]         = React.useState('');
  const [newDesc, setNewDesc]         = React.useState('');
  const [inviteEmail, setInviteEmail] = React.useState('');
  const [inviteRole, setInviteRole]   = React.useState('Editor');
  const [msg, setMsg]                 = React.useState(null);
  const [saving, setSaving]           = React.useState(false);

  const flash = (text, ok=true) => { setMsg({text,ok}); setTimeout(()=>setMsg(null),3000); };

  const reload = async () => {
    setLoading(true);
    try {
      const [g, p] = await Promise.all([sbGetMyGroups(), sbGetPendingInvites()]);
      setGroups(g); setPending(p);
    } catch(e) {
      console.error('Groups load error:', e);
      flash('Could not load groups — check Supabase tables are created.', false);
    }
    setLoading(false);
  };
  React.useEffect(() => { reload(); }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      await sbCreateGroup(newName.trim(), newDesc.trim());
      setNewName(''); setNewDesc(''); setShowCreate(false);
      flash('Group created!');
      reload();
    } catch(e) { flash(e.message, false); }
    setSaving(false);
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setSaving(true);
    try {
      const res = await sbInviteMember(showInvite, inviteEmail.trim(), inviteRole);
      setInviteEmail('');
      flash(res.pending ? "Invite saved — they'll see it when they join." : "Invite sent!");
      if (showMembers) {
        const m = await sbGetGroupMembers(showMembers.id);
        setMembers(m);
      }
    } catch(e) { flash(e.message, false); }
    setSaving(false);
  };

  const handleRespond = async (groupId, accept) => {
    await sbRespondToInvite(groupId, accept);
    flash(accept ? 'Joined group!' : 'Invite declined');
    reload();
  };

  const handleLeave = async (groupId) => {
    if (!confirm('Leave this group? You will lose access to shared deals.')) return;
    await sbLeaveGroup(groupId);
    flash('Left group');
    reload();
  };

  const openMembers = async (group) => {
    setShowMembers(group);
    const m = await sbGetGroupMembers(group.id);
    setMembers(m);
  };

  const handleRoleChange = async (groupId, memberId, newRole) => {
    await sbUpdateMemberRole(groupId, memberId, newRole);
    const m = await sbGetGroupMembers(groupId);
    setMembers(m);
  };

  const handleRemoveMember = async (groupId, memberId) => {
    if (!confirm('Remove this member?')) return;
    await sbRemoveMember(groupId, memberId);
    const m = await sbGetGroupMembers(groupId);
    setMembers(m);
  };

  const card  = { background:'var(--card)', border:'1px solid var(--border)', borderRadius:12, padding:20, marginBottom:12 };
  const iS    = { width:'100%', padding:'9px 12px', borderRadius:7, fontSize:14, border:'1px solid var(--border)', background:'var(--input-bg)', color:'var(--text)', fontFamily:'inherit', marginBottom:10 };
  const btnPrimary = { background:'var(--accent)', color:'#fff', border:'none', borderRadius:8, padding:'10px 20px', fontSize:14, fontWeight:700, cursor:'pointer' };
  const btnGhost   = { background:'none', border:'1px solid var(--border)', borderRadius:8, padding:'9px 16px', fontSize:13, color:'var(--muted)', cursor:'pointer' };

  const ROLE_COLORS = { Owner:'#0D9488', Editor:'#10b981', Viewer:'#94a3b8', pending:'#f59e0b' };

  return (
    <div style={{minHeight:'100vh', background:'var(--bg)', color:'var(--text)'}}>
      <div style={{maxWidth:640, margin:'0 auto', padding:'0 16px 60px'}}>

        {/* Header */}
        <div style={{display:'flex', alignItems:'center', gap:12, margin:'20px 0 24px'}}>
          <button onClick={onBack} style={btnGhost}>← Back</button>
          <div style={{fontWeight:800, fontSize:18}}>Deal Groups</div>
          <div style={{marginLeft:'auto'}}>
            <button onClick={()=>setShowCreate(true)} style={btnPrimary}>+ New Group</button>
          </div>
        </div>

        {msg && (
          <div style={{background: msg.ok ? '#d1fae5' : '#fee2e2', color: msg.ok ? '#065f46' : '#991b1b',
            borderRadius:8, padding:'10px 14px', marginBottom:14, fontSize:13, fontWeight:600}}>
            {msg.text}
          </div>
        )}

        {/* Pending invites */}
        {pending.length > 0 && (
          <div style={{...card, border:'1px solid #f59e0b', background:'#fffbeb'}}>
            <div style={{fontWeight:700, fontSize:13, color:'#92400e', marginBottom:12}}>
              📬 Pending Invites ({pending.length})
            </div>
            {pending.map(inv => (
              <div key={inv.group_id} style={{display:'flex', justifyContent:'space-between', alignItems:'center',
                padding:'10px 0', borderBottom:'1px solid #fde68a'}}>
                <div>
                  <div style={{fontWeight:700, fontSize:14}}>{inv.groups?.name}</div>
                  <div style={{fontSize:12, color:'#92400e', marginTop:2}}>
                    Invited as <strong>{inv.role}</strong>
                    {inv.groups?.description && ` · ${inv.groups.description}`}
                  </div>
                </div>
                <div style={{display:'flex', gap:8}}>
                  <button onClick={()=>handleRespond(inv.group_id, true)}
                    style={{...btnPrimary, padding:'7px 14px', fontSize:13}}>Accept</button>
                  <button onClick={()=>handleRespond(inv.group_id, false)}
                    style={{...btnGhost, padding:'7px 14px', fontSize:13}}>Decline</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Group list */}
        {loading ? (
          <div style={{textAlign:'center', padding:40, color:'var(--muted)'}}>Loading groups…</div>
        ) : groups.length === 0 && pending.length === 0 ? (
          <div style={{textAlign:'center', padding:'60px 20px'}}>
            <div style={{fontSize:48, marginBottom:16}}>👥</div>
            <div style={{fontWeight:700, fontSize:16, marginBottom:8}}>No groups yet</div>
            <div style={{color:'var(--muted)', fontSize:14, marginBottom:20}}>
              Create a group to share deals with partners, co-investors, or your team.
            </div>
            <button onClick={()=>setShowCreate(true)} style={btnPrimary}>Create Your First Group</button>
          </div>
        ) : (
          groups.filter(g=>g.status==='active').map(group => (
            <div key={group.id} style={card}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10}}>
                <div style={{flex:1}}>
                  <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:4}}>
                    <div style={{fontWeight:800, fontSize:15}}>{group.name}</div>
                    <span style={{fontSize:11, fontWeight:700, color:ROLE_COLORS[group.role]||'var(--muted)',
                      background:'var(--bg)', border:`1px solid ${ROLE_COLORS[group.role]||'var(--border)'}`,
                      borderRadius:20, padding:'2px 8px'}}>{group.role}</span>
                  </div>
                  {group.description && <div style={{fontSize:13, color:'var(--muted)'}}>{group.description}</div>}
                </div>
              </div>
              <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
                <button onClick={()=>onSelectGroup(group)}
                  style={{...btnPrimary, padding:'8px 16px', fontSize:13}}>
                  📂 Open Deals
                </button>
                <button onClick={()=>openMembers(group)}
                  style={{...btnGhost, padding:'8px 16px', fontSize:13}}>
                  👥 Members
                </button>
                {(group.role === 'Owner' || group.role === 'Editor') && (
                  <button onClick={()=>{ setShowInvite(group.id); setInviteEmail(''); }}
                    style={{...btnGhost, padding:'8px 16px', fontSize:13}}>
                    + Invite
                  </button>
                )}
                {group.role !== 'Owner' && (
                  <button onClick={()=>handleLeave(group.id)}
                    style={{...btnGhost, padding:'8px 16px', fontSize:13, color:'#ef4444'}}>
                    Leave
                  </button>
                )}
              </div>
            </div>
          ))
        )}

        {/* ── Create Group Modal ── */}
        {showCreate && (
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',display:'flex',
            alignItems:'center',justifyContent:'center',zIndex:1000,padding:16}}
            onClick={e=>{if(e.target===e.currentTarget)setShowCreate(false);}}>
            <div style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:14,padding:28,maxWidth:420,width:'100%'}}>
              <div style={{fontWeight:800,fontSize:17,marginBottom:16}}>Create a Group</div>
              <input style={iS} placeholder="Group name (e.g. Smith Family Investments)"
                value={newName} onChange={e=>setNewName(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&handleCreate()}/>
              <textarea style={{...iS,height:80,resize:'vertical'}}
                placeholder="Description (optional)"
                value={newDesc} onChange={e=>setNewDesc(e.target.value)}/>
              <div style={{fontSize:12,color:'var(--muted)',marginBottom:16}}>
                You'll be the Owner. Invite others after creating.
              </div>
              <div style={{display:'flex',gap:10}}>
                <button onClick={handleCreate} disabled={!newName.trim()||saving} style={btnPrimary}>
                  {saving?'Creating…':'Create Group'}
                </button>
                <button onClick={()=>setShowCreate(false)} style={btnGhost}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Invite Modal ── */}
        {showInvite && (
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',display:'flex',
            alignItems:'center',justifyContent:'center',zIndex:1000,padding:16}}
            onClick={e=>{if(e.target===e.currentTarget)setShowInvite(null);}}>
            <div style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:14,padding:28,maxWidth:420,width:'100%'}}>
              <div style={{fontWeight:800,fontSize:17,marginBottom:16}}>Invite to Group</div>
              <input style={iS} type="email" placeholder="Email address"
                value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)}/>
              <div style={{marginBottom:14}}>
                <div style={{fontSize:12,fontWeight:700,color:'var(--muted)',textTransform:'uppercase',
                  letterSpacing:'0.06em',marginBottom:8}}>Role</div>
                {['Editor','Viewer'].map(r=>(
                  <label key={r} style={{display:'flex',alignItems:'center',gap:10,marginBottom:8,cursor:'pointer'}}>
                    <input type="radio" name="inviteRole" checked={inviteRole===r}
                      onChange={()=>setInviteRole(r)} style={{accentColor:'var(--accent)'}}/>
                    <div>
                      <div style={{fontSize:14,fontWeight:600,color:ROLE_COLORS[r]}}>{r}</div>
                      <div style={{fontSize:12,color:'var(--muted)'}}>
                        {r==='Editor'?'Can add, edit, and analyze deals':'Can view deals and analysis — cannot edit'}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
              <div style={{display:'flex',gap:10}}>
                <button onClick={handleInvite} disabled={!inviteEmail.trim()||saving} style={btnPrimary}>
                  {saving?'Sending…':'Send Invite'}
                </button>
                <button onClick={()=>setShowInvite(null)} style={btnGhost}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Members Panel ── */}
        {showMembers && (
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',display:'flex',
            alignItems:'center',justifyContent:'center',zIndex:1000,padding:16}}
            onClick={e=>{if(e.target===e.currentTarget)setShowMembers(null);}}>
            <div style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:14,
              padding:28,maxWidth:460,width:'100%',maxHeight:'80vh',overflowY:'auto'}}>
              <div style={{fontWeight:800,fontSize:17,marginBottom:4}}>{showMembers.name}</div>
              <div style={{fontSize:13,color:'var(--muted)',marginBottom:16}}>Members</div>
              {members.map(m => {
                const isMe = m.user_id === user?.id;
                const name = m.profiles?.display_name || m.profiles?.email || m.user_id?.slice(0,8)+'…';
                const isOwner = showMembers.role === 'Owner';
                return (
                  <div key={m.user_id} style={{display:'flex',alignItems:'center',gap:10,
                    padding:'10px 0',borderBottom:'1px solid var(--border-faint)'}}>
                    <div style={{width:34,height:34,borderRadius:'50%',background:'var(--accent)',
                      display:'flex',alignItems:'center',justifyContent:'center',
                      fontSize:13,fontWeight:700,color:'#fff',flexShrink:0}}>
                      {(m.profiles?.display_name||m.profiles?.email||'?')[0].toUpperCase()}
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:14,fontWeight:600}}>{name}{isMe&&' (you)'}</div>
                      <div style={{fontSize:12,color:'var(--muted)'}}>{m.profiles?.email}</div>
                    </div>
                    {m.status==='pending' && (
                      <span style={{fontSize:11,fontWeight:700,color:'#92400e',background:'#fef3c7',
                        borderRadius:20,padding:'2px 8px'}}>Pending</span>
                    )}
                    {isOwner && !isMe ? (
                      <div style={{display:'flex',alignItems:'center',gap:6}}>
                        <select value={m.role}
                          onChange={e=>handleRoleChange(showMembers.id, m.user_id, e.target.value)}
                          style={{fontSize:12,padding:'4px 8px',borderRadius:6,border:'1px solid var(--border)',
                            background:'var(--input-bg)',color:ROLE_COLORS[m.role]||'var(--text)',fontWeight:700,
                            fontFamily:'inherit'}}>
                          {['Owner','Editor','Viewer'].map(r=><option key={r} value={r}>{r}</option>)}
                        </select>
                        <button onClick={()=>handleRemoveMember(showMembers.id, m.user_id)}
                          style={{background:'none',border:'none',color:'#ef4444',cursor:'pointer',fontSize:16,padding:'0 4px'}}>
                          ×
                        </button>
                      </div>
                    ) : (
                      <span style={{fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:20,
                        color:ROLE_COLORS[m.role]||'var(--muted)',border:`1px solid ${ROLE_COLORS[m.role]||'var(--border)'}`,
                        background:'var(--bg)'}}>
                        {m.role}
                      </span>
                    )}
                  </div>
                );
              })}
              {(showMembers.role === 'Owner' || showMembers.role === 'Editor') && (
                <div style={{marginTop:14}}>
                  <div style={{display:'flex',gap:8}}>
                    <input style={{...iS,margin:0,flex:1}} type="email" placeholder="Invite by email"
                      value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)}/>
                    <select value={inviteRole} onChange={e=>setInviteRole(e.target.value)}
                      style={{padding:'9px 10px',borderRadius:7,fontSize:13,border:'1px solid var(--border)',
                        background:'var(--input-bg)',color:'var(--text)',fontFamily:'inherit'}}>
                      <option>Editor</option><option>Viewer</option>
                    </select>
                    <button onClick={()=>{setShowInvite(showMembers.id); handleInvite();}}
                      style={{...btnPrimary,padding:'9px 14px',fontSize:13,whiteSpace:'nowrap'}}
                      disabled={!inviteEmail.trim()}>
                      Invite
                    </button>
                  </div>
                </div>
              )}
              <button onClick={()=>setShowMembers(null)} style={{...btnGhost,marginTop:14,width:'100%'}}>Close</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function OnboardingTour({ onClose, onDone }) {
  const [step, setStep] = useState(0);
  const total = TOUR_STEPS.length;
  const s = TOUR_STEPS[step];
  const isLast = step === total - 1;

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",
      alignItems:"center",justifyContent:"center",zIndex:2000,padding:16}}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:18,
        padding:"36px 32px",maxWidth:460,width:"100%",position:"relative",
        boxShadow:"0 24px 64px rgba(0,0,0,0.5)"}}>

        {/* Close */}
        <button onClick={onClose} style={{position:"absolute",top:14,right:16,background:"none",
          border:"none",color:"var(--muted)",fontSize:20,cursor:"pointer",lineHeight:1}}>✕</button>

        {/* Step indicator */}
        <div style={{display:"flex",gap:5,marginBottom:24,justifyContent:"center"}}>
          {TOUR_STEPS.map((_,i)=>(
            <div key={i} onClick={()=>setStep(i)} style={{height:3,flex:1,borderRadius:2,cursor:"pointer",
              background:i<=step?"var(--accent)":"var(--border)",transition:"background 0.2s"}}/>
          ))}
        </div>

        {/* Content */}
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{fontSize:48,marginBottom:16,lineHeight:1}}>{s.icon}</div>
          <div style={{fontWeight:800,fontSize:19,marginBottom:10,lineHeight:1.3}}>{s.title}</div>
          <div style={{color:"var(--muted)",fontSize:15,lineHeight:1.7}}>{s.body}</div>
        </div>

        {/* Navigation */}
        <div style={{display:"flex",gap:10,alignItems:"center",justifyContent:"space-between"}}>
          <button onClick={()=>setStep(s=>Math.max(0,s-1))} disabled={step===0}
            style={{background:"none",border:"1px solid var(--border)",borderRadius:8,
              padding:"10px 18px",fontSize:14,cursor:step===0?"not-allowed":"pointer",
              color:"var(--muted)",opacity:step===0?0.4:1}}>
            ← Back
          </button>
          <span style={{fontSize:12,color:"var(--muted)"}}>{step+1} of {total}</span>
          {isLast
            ? <button onClick={onDone} style={{background:"var(--accent)",color:"#fff",border:"none",
                borderRadius:8,padding:"10px 22px",fontSize:14,fontWeight:700,cursor:"pointer"}}>
                Get Started →
              </button>
            : <button onClick={()=>setStep(s=>s+1)} style={{background:"var(--accent)",color:"#fff",
                border:"none",borderRadius:8,padding:"10px 22px",fontSize:14,fontWeight:700,cursor:"pointer"}}>
                Next →
              </button>
          }
        </div>
      </div>
    </div>
  );
}

export default OnboardingTour;
