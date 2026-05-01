import React, { useState } from 'react';
import { DEFAULT_PREFS } from '../lib/calc';
import { sbClient, authUpdatePassword, authUpdateProfile } from '../lib/constants';
import Button from './ui/Button';
import AppearanceTab from './SettingsPage/AppearanceTab';
import GroupsTab from './SettingsPage/GroupsTab';

// ── Field definitions for push-to-all-deals ──────────────────────────────────
const PUSH_FIELDS = [
  { key:'downPaymentPct',   section:'Financing',          label:'Down Payment %' },
  { key:'interestRate',     section:'Financing',          label:'Interest Rate %' },
  { key:'amortYears',       section:'Financing',          label:'Amortization (yrs)' },
  { key:'vacancyRate',      section:'Income & Growth',    label:'Vacancy Rate %' },
  { key:'rentGrowth',       section:'Income & Growth',    label:'Rent Growth % / yr' },
  { key:'expenseGrowth',    section:'Income & Growth',    label:'Expense Growth % / yr' },
  { key:'appreciationRate', section:'Income & Growth',    label:'Appreciation % / yr' },
  { key:'taxBracket',       section:'Tax',                label:'Income Tax Bracket %' },
  { key:'propertyTaxPct',   section:'Expense % Defaults', label:'Property Tax %' },
  { key:'insurancePct',     section:'Expense % Defaults', label:'Insurance %' },
  { key:'maintenancePct',   section:'Expense % Defaults', label:'Maintenance %' },
  { key:'capexPct',         section:'Expense % Defaults', label:'CapEx %' },
  { key:'propertyMgmtPct',  section:'Expense % Defaults', label:'Property Mgmt %' },
  { key:'cc_title',         section:'Closing Costs',      label:'Title & Escrow',  ccKey:'title' },
  { key:'cc_transferTax',   section:'Closing Costs',      label:'Transfer Tax',    ccKey:'transferTax' },
  { key:'cc_inspection',    section:'Closing Costs',      label:'Inspection',      ccKey:'inspection' },
  { key:'cc_attorney',      section:'Closing Costs',      label:'Attorney',        ccKey:'attorney' },
  { key:'cc_lenderFees',    section:'Closing Costs',      label:'Lender Fees',     ccKey:'lenderFees' },
  { key:'dscrFloor',        section:'Red Flag Thresholds', label:'DSCR Floor' },
  { key:'capRateFloor',     section:'Red Flag Thresholds', label:'Cap Rate Floor %' },
  { key:'expRatioCeiling',  section:'Red Flag Thresholds', label:'Exp. Ratio Ceiling %' },
];
const SECTIONS = [...new Set(PUSH_FIELDS.map(f => f.section))];

const TABS = ['Defaults', 'Account', 'Appearance', 'Groups'];

function SettingsPage({ user, prefs, onSave, onBack, onSignOut, dark, setDark, deals, onOpenGroups }) {
  const [tab, setTab] = useState(0);

  // ── Defaults tab state ────────────────────────────────────────────────────
  const [local, setLocal] = useState({ ...DEFAULT_PREFS, ...prefs });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pushFields, setPushFields] = useState(() => new Set(PUSH_FIELDS.map(f => f.key)));
  const [showPushPanel, setShowPushPanel] = useState(false);

  const set    = (key, val) => setLocal(p => ({ ...p, [key]: val }));
  const setCC  = (key, val) => setLocal(p => ({ ...p, closingCosts: { ...p.closingCosts, [key]: val } }));
  const toggleField = (key) => setPushFields(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });
  const toggleSection = (section) => {
    const keys = PUSH_FIELDS.filter(f => f.section === section).map(f => f.key);
    const allChecked = keys.every(k => pushFields.has(k));
    setPushFields(prev => {
      const next = new Set(prev);
      keys.forEach(k => allChecked ? next.delete(k) : next.add(k));
      return next;
    });
  };
  const handleSaveDefaults = (applyToDeals) => {
    setSaving(true);
    onSave(local, applyToDeals ? pushFields : null);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // ── Account tab state ─────────────────────────────────────────────────────
  const [displayName, setDisplayName] = useState(user?.user_metadata?.display_name || '');
  const [organization, setOrganization] = useState(user?.user_metadata?.organization || '');
  const [profSaving, setProfSaving] = useState(false);
  const [profSaved, setProfSaved]   = useState(false);
  const [profErr, setProfErr]       = useState('');

  const [changingPw, setChangingPw] = useState(false);
  const [newPw, setNewPw]           = useState('');
  const [confirmPw, setConfirmPw]   = useState('');
  const [pwSaved, setPwSaved]       = useState(false);
  const [pwErr, setPwErr]           = useState('');

  const [exportLoading, setExportLoading] = useState(false);
  const [exportDone, setExportDone]       = useState(false);

  const [showDeleteModal, setShowDeleteModal]   = useState(false);
  const [deleteConfirm, setDeleteConfirm]       = useState('');
  const [deleteLoading, setDeleteLoading]       = useState(false);
  const [deleteError, setDeleteError]           = useState('');

  const initials = (() => {
    const n = displayName.trim();
    if (!n) return (user?.email || '?')[0].toUpperCase();
    const p = n.split(' ').filter(Boolean);
    return p.length >= 2 ? (p[0][0] + p[p.length-1][0]).toUpperCase() : n.slice(0,2).toUpperCase();
  })();

  const saveProfile = async () => {
    setProfSaving(true); setProfErr(''); setProfSaved(false);
    const { error } = await authUpdateProfile({ display_name: displayName.trim(), organization: organization.trim() });
    setProfSaving(false);
    if (error) { setProfErr(error.message); return; }
    setProfSaved(true); setTimeout(() => setProfSaved(false), 2500);
  };

  const changePw = async () => {
    if (newPw.length < 8) { setPwErr('Password must be at least 8 characters.'); return; }
    if (newPw !== confirmPw) { setPwErr('Passwords do not match.'); return; }
    setProfSaving(true); setPwErr(''); setPwSaved(false);
    const { error } = await authUpdatePassword(newPw);
    setProfSaving(false);
    if (error) { setPwErr(error.message); return; }
    setPwSaved(true); setNewPw(''); setConfirmPw(''); setChangingPw(false);
    setTimeout(() => setPwSaved(false), 3000);
  };

  const handleExport = async () => {
    setExportLoading(true);
    try {
      const blob = new Blob([JSON.stringify({
        exportedAt: new Date().toISOString(),
        user: { email: user?.email, displayName: user?.user_metadata?.display_name || '', createdAt: user?.created_at, plan: user?.user_metadata?.plan || 'free' },
        deals: (deals || []).map(d => ({ ...d })),
      }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'renthack_data_export_' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExportDone(true); setTimeout(() => setExportDone(false), 3000);
    } catch (e) { console.error('Export failed:', e); }
    setExportLoading(false);
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== 'DELETE') return;
    setDeleteLoading(true); setDeleteError('');
    try {
      const { data: { session } } = await sbClient.auth.getSession();
      if (!session) throw new Error('No active session — please sign in again.');
      const res  = await fetch('https://lxkwvayalxuoryuwxtsq.supabase.co/functions/v1/delete-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Deletion failed');
      localStorage.clear();
      await sbClient.auth.signOut();
      window.location.replace('/landing.html');
    } catch (e) {
      setDeleteError(e.message || 'Something went wrong. Please try again or contact support@renthack.io.');
      setDeleteLoading(false);
    }
  };

  // ── Shared styles ─────────────────────────────────────────────────────────
  const card  = { background:'var(--card)', border:'1px solid var(--border)', borderRadius:12, padding:24, marginBottom:14 };
  const iS    = { width:'100%', padding:'9px 12px', borderRadius:7, fontSize:14, border:'1px solid var(--border)', background:'var(--input-bg)', color:'var(--text)', fontFamily:'inherit' };
  const lbl   = (txt) => <label style={{fontSize:10,fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.06em',display:'block',marginBottom:4}}>{txt}</label>;
  const row2  = { display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 };
  const row3  = { display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 };

  const pushedCount = pushFields.size;
  const totalFields = PUSH_FIELDS.length;

  return (
    <div style={{maxWidth:640, margin:'0 auto', paddingBottom:40}}>
      {/* Header */}
      <div style={{display:'flex', alignItems:'center', gap:12, margin:'20px 0 20px'}}>
        <button onClick={onBack} style={{background:'var(--card)', border:'1px solid var(--border)',
          borderRadius:8, padding:'8px 14px', color:'var(--text)', fontSize:13, cursor:'pointer', fontWeight:600}}>
          ← Back
        </button>
        <div style={{fontWeight:800, fontSize:18}}>Settings</div>
      </div>

      {/* Tab bar */}
      <div style={{display:'flex', gap:4, marginBottom:20, borderBottom:'1px solid var(--border)', paddingBottom:0}}>
        {TABS.map((t, i) => (
          <button key={t} onClick={()=>setTab(i)}
            style={{background:'none', border:'none', padding:'8px 16px', fontSize:13, fontWeight:tab===i?700:500,
              color:tab===i?'var(--accent)':'var(--muted)', cursor:'pointer', borderBottom:tab===i?'2px solid var(--accent)':'2px solid transparent',
              marginBottom:-1, borderRadius:0, fontFamily:'inherit', transition:'color 0.15s'}}>
            {t}
          </button>
        ))}
      </div>

      {/* ── Tab 0: Defaults ──────────────────────────────────────────────────── */}
      {tab === 0 && (<>
        <div style={card}>
          <div style={{fontWeight:700, fontSize:14, marginBottom:16}}>Financing</div>
          <div style={row3}>
            <div>{lbl('Down Payment %')}<input type="number" value={local.downPaymentPct} onChange={e=>set('downPaymentPct',+e.target.value)} style={iS} min={0} max={100}/></div>
            <div>{lbl('Interest Rate %')}<input type="number" value={local.interestRate} onChange={e=>set('interestRate',+e.target.value)} style={iS} step={0.1}/></div>
            <div>{lbl('Amortization (yrs)')}<input type="number" value={local.amortYears} onChange={e=>set('amortYears',+e.target.value)} style={iS}/></div>
          </div>
        </div>

        <div style={card}>
          <div style={{fontWeight:700, fontSize:14, marginBottom:16}}>Income & Growth</div>
          <div style={row2}>
            <div>{lbl('Vacancy Rate %')}<input type="number" value={local.vacancyRate} onChange={e=>set('vacancyRate',+e.target.value)} style={iS} min={0} max={100}/></div>
            <div>{lbl('Rent Growth % / yr')}<input type="number" value={local.rentGrowth} onChange={e=>set('rentGrowth',+e.target.value)} style={iS} step={0.1}/></div>
            <div>{lbl('Expense Growth % / yr')}<input type="number" value={local.expenseGrowth} onChange={e=>set('expenseGrowth',+e.target.value)} style={iS} step={0.1}/></div>
            <div>{lbl('Appreciation % / yr')}<input type="number" value={local.appreciationRate} onChange={e=>set('appreciationRate',+e.target.value)} style={iS} step={0.1}/></div>
          </div>
        </div>

        <div style={card}>
          <div style={{fontWeight:700, fontSize:14, marginBottom:16}}>Tax</div>
          <div style={{maxWidth:180}}>
            {lbl('Income Tax Bracket %')}
            <input type="number" value={local.taxBracket} onChange={e=>set('taxBracket',+e.target.value)} style={iS} min={0} max={60}/>
          </div>
        </div>

        <div style={card}>
          <div style={{fontWeight:700, fontSize:14, marginBottom:4}}>Expense Defaults (%)</div>
          <div style={{fontSize:12, color:'var(--muted)', marginBottom:16}}>Used when expense mode is set to % of rent</div>
          <div style={row3}>
            <div>{lbl('Property Tax %')}<input type="number" value={local.propertyTaxPct} onChange={e=>set('propertyTaxPct',+e.target.value)} style={iS} step={0.1}/></div>
            <div>{lbl('Insurance %')}<input type="number" value={local.insurancePct} onChange={e=>set('insurancePct',+e.target.value)} style={iS} step={0.1}/></div>
            <div>{lbl('Maintenance %')}<input type="number" value={local.maintenancePct} onChange={e=>set('maintenancePct',+e.target.value)} style={iS} step={0.1}/></div>
            <div>{lbl('CapEx %')}<input type="number" value={local.capexPct} onChange={e=>set('capexPct',+e.target.value)} style={iS} step={0.1}/></div>
            <div>{lbl('Property Mgmt %')}<input type="number" value={local.propertyMgmtPct} onChange={e=>set('propertyMgmtPct',+e.target.value)} style={iS} step={0.1}/></div>
          </div>
        </div>

        <div style={card}>
          <div style={{fontWeight:700, fontSize:14, marginBottom:16}}>Closing Cost Defaults ($)</div>
          <div style={row3}>
            {[['title','Title & Escrow'],['transferTax','Transfer Tax'],['inspection','Inspection'],['attorney','Attorney'],['lenderFees','Lender Fees']].map(([k,l])=>(
              <div key={k}>{lbl(l)}<input type="number" value={local.closingCosts[k]||0} onChange={e=>setCC(k,+e.target.value)} style={iS}/></div>
            ))}
          </div>
        </div>

        <div style={card}>
          <div style={{fontWeight:700, fontSize:14, marginBottom:4}}>Red Flag Thresholds</div>
          <div style={{fontSize:12, color:'var(--muted)', marginBottom:16}}>Triggers warnings on the Red Flags tab</div>
          <div style={row3}>
            <div>{lbl('DSCR Floor (x)')}<input type="number" value={local.dscrFloor} onChange={e=>set('dscrFloor',+e.target.value)} style={iS} step={0.05}/></div>
            <div>{lbl('Cap Rate Floor %')}<input type="number" value={(local.capRateFloor*100).toFixed(1)} onChange={e=>set('capRateFloor',+e.target.value/100)} style={iS} step={0.1}/></div>
            <div>{lbl('Exp. Ratio Ceiling %')}<input type="number" value={(local.expRatioCeiling*100).toFixed(0)} onChange={e=>set('expRatioCeiling',+e.target.value/100)} style={iS}/></div>
          </div>
        </div>

        {/* Save actions */}
        <div style={{...card, marginBottom:0}}>
          <div style={{fontWeight:700, fontSize:14, marginBottom:4}}>Save Changes</div>
          <div style={{fontSize:13, color:'var(--muted)', marginBottom:16, lineHeight:1.6}}>
            Choose how to apply your updated assumptions.
            {deals?.length > 0 && <span> You have <strong style={{color:'var(--text)'}}>{deals.length} existing deal{deals.length!==1?'s':''}</strong>.</span>}
          </div>
          <div style={{display:'flex', flexDirection:'column', gap:10}}>
            <div style={{border:'1px solid var(--border)', borderRadius:10, overflow:'hidden'}}>
              <button onClick={()=>setShowPushPanel(p=>!p)}
                style={{width:'100%', background:'var(--accent)', color:'#fff', border:'none',
                  padding:'12px 20px', fontSize:14, fontWeight:700, cursor:'pointer', textAlign:'left',
                  display:'flex', alignItems:'center', gap:10}}>
                <span style={{fontSize:18}}>🔄</span>
                <div style={{flex:1}}>
                  <div>Push to All Deals</div>
                  <div style={{fontSize:12, fontWeight:400, opacity:0.85}}>
                    {pushedCount === totalFields ? `All ${totalFields} fields will be pushed` : `${pushedCount} of ${totalFields} fields selected`}
                  </div>
                </div>
                <span style={{fontSize:12, opacity:0.8}}>{showPushPanel ? '▲ Hide' : '▼ Select fields'}</span>
              </button>
              {showPushPanel && (
                <div style={{background:'var(--bg)', padding:16, borderTop:'1px solid var(--border)'}}>
                  <div style={{fontSize:12, color:'var(--muted)', marginBottom:12, lineHeight:1.5}}>
                    Uncheck fields you want to <strong style={{color:'var(--text)'}}>preserve</strong> on existing deals.
                  </div>
                  {SECTIONS.map(section => {
                    const sFields = PUSH_FIELDS.filter(f => f.section === section);
                    const allChk = sFields.every(f => pushFields.has(f.key));
                    const someChk = sFields.some(f => pushFields.has(f.key));
                    return (
                      <div key={section} style={{marginBottom:14}}>
                        <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:6, paddingBottom:6, borderBottom:'1px solid var(--border-faint)'}}>
                          <input type="checkbox" checked={allChk}
                            ref={el => { if (el) el.indeterminate = !allChk && someChk; }}
                            onChange={() => toggleSection(section)}
                            style={{width:15, height:15, accentColor:'var(--accent)', cursor:'pointer'}}/>
                          <span style={{fontSize:12, fontWeight:700, color:'var(--text)'}}>{section}</span>
                        </div>
                        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:4, paddingLeft:8}}>
                          {sFields.map(f => (
                            <label key={f.key} style={{display:'flex', alignItems:'center', gap:7, fontSize:12,
                              color:pushFields.has(f.key)?'var(--text)':'var(--muted)', cursor:'pointer', padding:'3px 0'}}>
                              <input type="checkbox" checked={pushFields.has(f.key)} onChange={() => toggleField(f.key)}
                                style={{width:14, height:14, accentColor:'var(--accent)', cursor:'pointer'}}/>
                              {f.label}
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  <div style={{display:'flex', gap:8, marginTop:8, paddingTop:10, borderTop:'1px solid var(--border-faint)'}}>
                    <button onClick={()=>setPushFields(new Set(PUSH_FIELDS.map(f=>f.key)))}
                      style={{fontSize:11,padding:'4px 10px',borderRadius:6,border:'1px solid var(--border)',background:'var(--card)',color:'var(--muted)',cursor:'pointer'}}>Select All</button>
                    <button onClick={()=>setPushFields(new Set())}
                      style={{fontSize:11,padding:'4px 10px',borderRadius:6,border:'1px solid var(--border)',background:'var(--card)',color:'var(--muted)',cursor:'pointer'}}>Clear All</button>
                    <button onClick={()=>{ if(pushedCount>0) handleSaveDefaults(true); }} disabled={pushedCount===0||saving}
                      style={{marginLeft:'auto',fontSize:12,padding:'6px 16px',borderRadius:100,border:'none',
                        background:pushedCount>0?'var(--accent)':'var(--border)',
                        color:pushedCount>0?'#fff':'var(--muted)',
                        cursor:pushedCount>0?'pointer':'not-allowed',fontWeight:700}}>
                      {pushedCount===0?'Select fields to push':`Push ${pushedCount} field${pushedCount!==1?'s':''} to ${(deals||[]).length} deal${(deals||[]).length!==1?'s':''}`}
                    </button>
                  </div>
                </div>
              )}
              {!showPushPanel && (
                <button onClick={()=>handleSaveDefaults(true)} disabled={saving}
                  style={{width:'100%',background:'var(--card)',border:'none',borderTop:'1px solid var(--border)',
                    padding:'10px 20px',fontSize:13,color:'var(--accent)',cursor:'pointer',fontWeight:600,opacity:saving?0.7:1}}>
                  ✓ Confirm & Push {pushedCount} field{pushedCount!==1?'s':''} →
                </button>
              )}
            </div>
            <button onClick={()=>handleSaveDefaults(false)} disabled={saving}
              style={{background:'var(--card)',color:'var(--text)',border:'1px solid var(--accent)',borderRadius:8,
                padding:'12px 20px',fontSize:14,fontWeight:700,cursor:'pointer',textAlign:'left',
                opacity:saving?0.7:1,display:'flex',alignItems:'center',gap:10}}>
              <span style={{fontSize:18}}>✨</span>
              <div>
                <div>Apply to New Deals Only</div>
                <div style={{fontSize:12,fontWeight:400,color:'var(--muted)'}}>Existing deals are unchanged</div>
              </div>
            </button>
            <button onClick={()=>setLocal({...DEFAULT_PREFS})}
              style={{background:'none',border:'1px solid var(--border)',borderRadius:8,
                padding:'12px 20px',fontSize:14,color:'var(--muted)',cursor:'pointer',textAlign:'left',
                display:'flex',alignItems:'center',gap:10}}>
              <span style={{fontSize:18}}>↩️</span>
              <div>
                <div>Reset to Defaults</div>
                <div style={{fontSize:12,fontWeight:400}}>Restore all values to system defaults (does not save)</div>
              </div>
            </button>
          </div>
          {saved && <div style={{color:'var(--green)',fontSize:13,fontWeight:600,marginTop:12}}>✓ Settings saved</div>}
        </div>
      </>)}

      {/* ── Tab 1: Account ────────────────────────────────────────────────────── */}
      {tab === 1 && (<>
        {/* Profile */}
        <div style={card}>
          <div style={{display:'flex', alignItems:'center', gap:16, marginBottom:20}}>
            <div style={{width:52, height:52, borderRadius:'50%', background:'var(--accent)', flexShrink:0,
              display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, fontWeight:800, color:'#fff'}}>
              {initials}
            </div>
            <div>
              <div style={{fontWeight:700, fontSize:15}}>{displayName || user?.email}</div>
              <div style={{color:'var(--muted)', fontSize:13}}>{user?.email}</div>
              <div style={{fontSize:11, color:'var(--muted)', marginTop:2}}>
                Member since {new Date(user?.created_at).toLocaleDateString('en-US',{month:'long',year:'numeric'})}
              </div>
            </div>
          </div>
          <div style={{display:'flex', flexDirection:'column', gap:10}}>
            <div>
              {lbl('Display Name')}
              <input value={displayName} onChange={e=>setDisplayName(e.target.value)}
                placeholder="Your full name" style={iS} onKeyDown={e=>e.key==='Enter'&&saveProfile()}/>
            </div>
            <div>
              {lbl('Email')}
              <input value={user?.email||''} disabled style={{...iS,opacity:0.55,cursor:'not-allowed'}}/>
            </div>
            <div>
              {lbl('Organization / Company')}
              <input value={organization} onChange={e=>setOrganization(e.target.value)}
                placeholder="e.g. GH Investment Properties, LLC" style={iS}
                onKeyDown={e=>e.key==='Enter'&&saveProfile()}/>
              <div style={{fontSize:11,color:'var(--muted)',marginTop:4}}>Appears on exported PDF reports</div>
            </div>
            {profErr && <div style={{color:'var(--red)',fontSize:13}}>{profErr}</div>}
            {profSaved && <div style={{color:'var(--green)',fontSize:13,fontWeight:600}}>✓ Profile saved</div>}
            <Button variant="primary" size="lg" onClick={saveProfile} disabled={profSaving} style={{borderRadius:8,padding:'10px'}}>
              {profSaving?'Saving…':'Save Profile'}
            </Button>
          </div>
        </div>

        {/* Password */}
        <div style={card}>
          <div style={{fontWeight:700, fontSize:14, marginBottom:14}}>Password</div>
          {!changingPw
            ? <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span style={{color:'var(--muted)',fontSize:13,letterSpacing:2}}>••••••••••</span>
                <Button variant="secondary" onClick={()=>setChangingPw(true)} style={{borderRadius:6,fontWeight:600}}>Change</Button>
              </div>
            : <div style={{display:'flex',flexDirection:'column',gap:10}}>
                <input type="password" placeholder="New password (min 8 chars)" value={newPw}
                  onChange={e=>{setNewPw(e.target.value);setPwErr('');}} style={iS}/>
                <input type="password" placeholder="Confirm new password" value={confirmPw}
                  onChange={e=>{setConfirmPw(e.target.value);setPwErr('');}} style={iS}
                  onKeyDown={e=>e.key==='Enter'&&changePw()}/>
                {pwErr   && <div style={{color:'var(--red)',fontSize:13}}>{pwErr}</div>}
                {pwSaved && <div style={{color:'var(--green)',fontSize:13,fontWeight:600}}>✓ Password updated</div>}
                <div style={{display:'flex',gap:8}}>
                  <Button variant="primary" size="lg" onClick={changePw} disabled={profSaving} style={{flex:1,borderRadius:8,padding:'10px'}}>
                    {profSaving?'Updating…':'Update Password'}
                  </Button>
                  <Button variant="secondary" size="lg" onClick={()=>{setChangingPw(false);setNewPw('');setConfirmPw('');setPwErr('');}} style={{flex:1,borderRadius:8,padding:'10px',background:'none',color:'var(--muted)'}}>
                    Cancel
                  </Button>
                </div>
              </div>
          }
        </div>

        {/* Data & Privacy */}
        <div style={card}>
          <div style={{fontWeight:700,fontSize:14,marginBottom:14}}>Data &amp; Privacy</div>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
            <div>
              <div style={{fontSize:14,fontWeight:500}}>Export my data</div>
              <div style={{fontSize:12,color:'var(--muted)',marginTop:2}}>Download all your deals, notes and preferences as JSON</div>
            </div>
            <button onClick={handleExport} disabled={exportLoading}
              style={{background:'none',border:'1px solid var(--border)',borderRadius:7,padding:'7px 14px',
                fontSize:13,cursor:exportLoading?'default':'pointer',color:'var(--text)',fontWeight:600,
                opacity:exportLoading?0.6:1,fontFamily:'inherit',flexShrink:0}}>
              {exportLoading?'Exporting…':exportDone?'✓ Downloaded':'Export'}
            </button>
          </div>
          <div style={{fontSize:12,color:'var(--muted)',lineHeight:1.5}}>
            Your data is yours.{' '}
            <a href="/legal/privacy.html" target="_blank" style={{color:'var(--accent)'}}>Privacy Policy</a>
            {' · '}
            <a href="/legal/tos.html" target="_blank" style={{color:'var(--accent)'}}>Terms of Service</a>
          </div>
        </div>

        {/* Sign Out */}
        <div style={card}>
          <div style={{fontWeight:700,fontSize:14,marginBottom:4}}>Sign Out</div>
          <div style={{color:'var(--muted)',fontSize:13,marginBottom:14}}>You'll need to sign back in to access your deals.</div>
          <Button variant="danger" size="lg" onClick={onSignOut} style={{background:'rgba(239,68,68,0.07)',color:'var(--red)',border:'1px solid rgba(239,68,68,0.3)',borderRadius:8}}>
            Sign Out
          </Button>
        </div>

        {/* Danger Zone */}
        <div style={{...card,border:'1px solid rgba(239,68,68,0.35)'}}>
          <div style={{fontWeight:700,fontSize:14,color:'var(--red)',marginBottom:4}}>Danger Zone</div>
          <div style={{color:'var(--muted)',fontSize:13,marginBottom:14,lineHeight:1.5}}>
            Permanently deletes your account, all deals, and cancels your subscription. This cannot be undone.
          </div>
          {!showDeleteModal
            ? <Button variant="danger" size="lg" onClick={()=>setShowDeleteModal(true)} style={{background:'rgba(239,68,68,0.07)',color:'var(--red)',border:'1px solid rgba(239,68,68,0.3)',borderRadius:8}}>
                Delete my account
              </Button>
            : <div>
                <div style={{fontSize:13,color:'var(--muted)',marginBottom:10,lineHeight:1.5}}>
                  Type <strong style={{color:'var(--text)'}}>DELETE</strong> to confirm permanent account deletion:
                </div>
                <input value={deleteConfirm} onChange={e=>setDeleteConfirm(e.target.value)}
                  placeholder="Type DELETE to confirm"
                  style={{width:'100%',padding:'10px 13px',borderRadius:8,fontSize:14,
                    border:'1px solid rgba(239,68,68,0.35)',background:'var(--input-bg)',
                    color:'var(--text)',fontFamily:'inherit',marginBottom:10}}/>
                {deleteError && <div style={{color:'var(--red)',fontSize:13,padding:'8px 10px',
                  background:'rgba(239,68,68,0.07)',borderRadius:6,marginBottom:10}}>{deleteError}</div>}
                <div style={{display:'flex',gap:10}}>
                  <Button variant="danger" size="lg" onClick={handleDeleteAccount} disabled={deleteConfirm!=='DELETE'||deleteLoading} style={{flex:1,borderRadius:8}}>
                    {deleteLoading?'Deleting…':'Permanently delete my account'}
                  </Button>
                  <Button variant="secondary" size="lg" onClick={()=>{setShowDeleteModal(false);setDeleteConfirm('');setDeleteError('');}} style={{borderRadius:8,background:'none'}}>
                    Cancel
                  </Button>
                </div>
              </div>
          }
        </div>
      </>)}

      {/* ── Tab 2: Appearance ─────────────────────────────────────────────────── */}
      {tab === 2 && <AppearanceTab dark={dark} setDark={setDark} card={card}/>}

      {/* ── Tab 3: Groups ─────────────────────────────────────────────────────── */}
      {tab === 3 && <GroupsTab onOpenGroups={onOpenGroups} card={card}/>}
    </div>
  );
}

export default SettingsPage;
