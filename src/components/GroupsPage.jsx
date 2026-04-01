import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { iSty, btnSm, srcSty } from './ui/InputRow';
import { sbClient, FMT_USD } from '../lib/constants';
import { sbGetMyGroups, sbGetPendingInvites, sbCreateGroup, sbInviteMember, sbRespondToInvite, sbLeaveGroup, sbGetGroupMembers, sbUpdateMemberRole, sbRemoveMember } from '../lib/groups';

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

  const ROLE_COLORS = { Owner:'var(--accent)', Editor:'var(--green)', Viewer:'#94a3b8', pending:'var(--refi-amber)' };

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
                    style={{...btnGhost, padding:'8px 16px', fontSize:13, color:'var(--red)'}}>
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
                          style={{background:'none',border:'none',color:'var(--red)',cursor:'pointer',fontSize:16,padding:'0 4px'}}>
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

export default GroupsPage;
