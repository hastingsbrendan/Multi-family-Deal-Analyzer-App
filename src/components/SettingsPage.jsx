import React, { useState } from 'react';
import { iSty, btnSm, srcSty } from './ui/InputRow';
import { FMT_USD, STATUS_OPTIONS } from '../lib/constants';
import { DEFAULT_PREFS } from '../lib/calc';

// ── Field definitions — each field knows its section, label, and prefs key ──
const PUSH_FIELDS = [
  // Financing
  { key:'downPaymentPct',   section:'Financing',        label:'Down Payment %' },
  { key:'interestRate',     section:'Financing',        label:'Interest Rate %' },
  { key:'amortYears',       section:'Financing',        label:'Amortization (yrs)' },
  // Income & Growth
  { key:'vacancyRate',      section:'Income & Growth',  label:'Vacancy Rate %' },
  { key:'rentGrowth',       section:'Income & Growth',  label:'Rent Growth % / yr' },
  { key:'expenseGrowth',    section:'Income & Growth',  label:'Expense Growth % / yr' },
  { key:'appreciationRate', section:'Income & Growth',  label:'Appreciation % / yr' },
  // Tax
  { key:'taxBracket',       section:'Tax',              label:'Income Tax Bracket %' },
  // Expense % Defaults
  { key:'propertyTaxPct',   section:'Expense % Defaults', label:'Property Tax %' },
  { key:'insurancePct',     section:'Expense % Defaults', label:'Insurance %' },
  { key:'maintenancePct',   section:'Expense % Defaults', label:'Maintenance %' },
  { key:'capexPct',         section:'Expense % Defaults', label:'CapEx %' },
  { key:'propertyMgmtPct',  section:'Expense % Defaults', label:'Property Mgmt %' },
  // Closing Costs
  { key:'cc_title',         section:'Closing Costs',    label:'Title & Escrow',   ccKey:'title' },
  { key:'cc_transferTax',   section:'Closing Costs',    label:'Transfer Tax',     ccKey:'transferTax' },
  { key:'cc_inspection',    section:'Closing Costs',    label:'Inspection',       ccKey:'inspection' },
  { key:'cc_attorney',      section:'Closing Costs',    label:'Attorney',         ccKey:'attorney' },
  { key:'cc_lenderFees',    section:'Closing Costs',    label:'Lender Fees',      ccKey:'lenderFees' },
  // Red Flag Thresholds
  { key:'dscrFloor',        section:'Red Flag Thresholds', label:'DSCR Floor' },
  { key:'capRateFloor',     section:'Red Flag Thresholds', label:'Cap Rate Floor %' },
  { key:'expRatioCeiling',  section:'Red Flag Thresholds', label:'Exp. Ratio Ceiling %' },
];

const SECTIONS = [...new Set(PUSH_FIELDS.map(f => f.section))];

function SettingsPage({ prefs, onSave, onBack, deals, dark, setDark }) {
  const [local, setLocal] = useState({ ...DEFAULT_PREFS, ...prefs });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // pushFields: set of field keys to push — all checked by default
  const [pushFields, setPushFields] = useState(() => new Set(PUSH_FIELDS.map(f => f.key)));
  const [showPushPanel, setShowPushPanel] = useState(false);

  const set = (key, val) => setLocal(p => ({ ...p, [key]: val }));
  const setCC = (key, val) => setLocal(p => ({ ...p, closingCosts: { ...p.closingCosts, [key]: val } }));

  const toggleField = (key) => setPushFields(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });
  const toggleSection = (section) => {
    const sectionKeys = PUSH_FIELDS.filter(f => f.section === section).map(f => f.key);
    const allChecked = sectionKeys.every(k => pushFields.has(k));
    setPushFields(prev => {
      const next = new Set(prev);
      sectionKeys.forEach(k => allChecked ? next.delete(k) : next.add(k));
      return next;
    });
  };

  const handleSave = (applyToDeals) => {
    setSaving(true);
    onSave(local, applyToDeals ? pushFields : null);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const card  = { background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, padding:24, marginBottom:14 };
  const iS    = { width:"100%", padding:"9px 12px", borderRadius:7, fontSize:14, border:"1px solid var(--border)", background:"var(--input-bg)", color:"var(--text)", fontFamily:"inherit" };
  const label = (txt) => <label style={{fontSize:10,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.06em",display:"block",marginBottom:4}}>{txt}</label>;
  const row2  = { display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 };
  const row3  = { display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 };

  const pushedCount = pushFields.size;
  const totalFields = PUSH_FIELDS.length;

  return (
    <div style={{maxWidth:600, margin:"0 auto", paddingBottom:40}}>
      <div style={{display:"flex", alignItems:"center", gap:12, margin:"20px 0 24px"}}>
        <button onClick={onBack} style={{background:"var(--card)", border:"1px solid var(--border)",
          borderRadius:8, padding:"8px 14px", color:"var(--text)", fontSize:13, cursor:"pointer", fontWeight:600}}>
          ← Back
        </button>
        <div>
          <div style={{fontWeight:800, fontSize:18}}>Global Assumptions</div>
          <div style={{fontSize:12, color:"var(--muted)", marginTop:2}}>Applied to every new deal you create</div>
        </div>
      </div>

      {/* ── Financing ───────────────────────────── */}
      <div style={card}>
        <div style={{fontWeight:700, fontSize:14, marginBottom:16}}>Financing</div>
        <div style={row3}>
          <div>
            {label("Down Payment %")}
            <input type="number" value={local.downPaymentPct} onChange={e=>set("downPaymentPct",+e.target.value)} style={iS} min={0} max={100}/>
          </div>
          <div>
            {label("Interest Rate %")}
            <input type="number" value={local.interestRate} onChange={e=>set("interestRate",+e.target.value)} style={iS} step={0.1}/>
          </div>
          <div>
            {label("Amortization (yrs)")}
            <input type="number" value={local.amortYears} onChange={e=>set("amortYears",+e.target.value)} style={iS}/>
          </div>
        </div>
      </div>

      {/* ── Income & Growth ─────────────────────── */}
      <div style={card}>
        <div style={{fontWeight:700, fontSize:14, marginBottom:16}}>Income & Growth</div>
        <div style={row2}>
          <div>
            {label("Vacancy Rate %")}
            <input type="number" value={local.vacancyRate} onChange={e=>set("vacancyRate",+e.target.value)} style={iS} min={0} max={100}/>
          </div>
          <div>
            {label("Rent Growth % / yr")}
            <input type="number" value={local.rentGrowth} onChange={e=>set("rentGrowth",+e.target.value)} style={iS} step={0.1}/>
          </div>
          <div>
            {label("Expense Growth % / yr")}
            <input type="number" value={local.expenseGrowth} onChange={e=>set("expenseGrowth",+e.target.value)} style={iS} step={0.1}/>
          </div>
          <div>
            {label("Appreciation % / yr")}
            <input type="number" value={local.appreciationRate} onChange={e=>set("appreciationRate",+e.target.value)} style={iS} step={0.1}/>
          </div>
        </div>
      </div>

      {/* ── Tax ─────────────────────────────────── */}
      <div style={card}>
        <div style={{fontWeight:700, fontSize:14, marginBottom:16}}>Tax</div>
        <div style={{maxWidth:180}}>
          {label("Income Tax Bracket %")}
          <input type="number" value={local.taxBracket} onChange={e=>set("taxBracket",+e.target.value)} style={iS} min={0} max={60}/>
        </div>
      </div>

      {/* ── Expense % Defaults ───────────────────── */}
      <div style={card}>
        <div style={{fontWeight:700, fontSize:14, marginBottom:4}}>Expense Defaults (%)</div>
        <div style={{fontSize:12, color:"var(--muted)", marginBottom:16}}>Used when expense mode is set to % of rent</div>
        <div style={row3}>
          <div>
            {label("Property Tax %")}
            <input type="number" value={local.propertyTaxPct} onChange={e=>set("propertyTaxPct",+e.target.value)} style={iS} step={0.1}/>
          </div>
          <div>
            {label("Insurance %")}
            <input type="number" value={local.insurancePct} onChange={e=>set("insurancePct",+e.target.value)} style={iS} step={0.1}/>
          </div>
          <div>
            {label("Maintenance %")}
            <input type="number" value={local.maintenancePct} onChange={e=>set("maintenancePct",+e.target.value)} style={iS} step={0.1}/>
          </div>
          <div>
            {label("CapEx %")}
            <input type="number" value={local.capexPct} onChange={e=>set("capexPct",+e.target.value)} style={iS} step={0.1}/>
          </div>
          <div>
            {label("Property Mgmt %")}
            <input type="number" value={local.propertyMgmtPct} onChange={e=>set("propertyMgmtPct",+e.target.value)} style={iS} step={0.1}/>
          </div>
        </div>
      </div>

      {/* ── Closing Costs ────────────────────────── */}
      <div style={card}>
        <div style={{fontWeight:700, fontSize:14, marginBottom:16}}>Closing Cost Defaults ($)</div>
        <div style={row3}>
          {[["title","Title & Escrow"],["transferTax","Transfer Tax"],["inspection","Inspection"],["attorney","Attorney"],["lenderFees","Lender Fees"]].map(([k,lbl])=>(
            <div key={k}>
              {label(lbl)}
              <input type="number" value={local.closingCosts[k]||0} onChange={e=>setCC(k,+e.target.value)} style={iS}/>
            </div>
          ))}
        </div>
      </div>

      {/* ── Red Flag Thresholds ──────────────────── */}
      <div style={card}>
        <div style={{fontWeight:700, fontSize:14, marginBottom:4}}>Red Flag Thresholds</div>
        <div style={{fontSize:12, color:"var(--muted)", marginBottom:16}}>Triggers warnings on the Red Flags tab</div>
        <div style={row3}>
          <div>
            {label("DSCR Floor (x)")}
            <input type="number" value={local.dscrFloor} onChange={e=>set("dscrFloor",+e.target.value)} style={iS} step={0.05}/>
          </div>
          <div>
            {label("Cap Rate Floor %")}
            <input type="number" value={(local.capRateFloor*100).toFixed(1)} onChange={e=>set("capRateFloor",+e.target.value/100)} style={iS} step={0.1}/>
          </div>
          <div>
            {label("Exp. Ratio Ceiling %")}
            <input type="number" value={(local.expRatioCeiling*100).toFixed(0)} onChange={e=>set("expRatioCeiling",+e.target.value/100)} style={iS}/>
          </div>
        </div>
      </div>

      {/* ── Actions ──────────────────────────────── */}
      <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,padding:20,marginBottom:14}}>
        <div style={{fontWeight:700,fontSize:14,marginBottom:4}}>Save Changes</div>
        <div style={{fontSize:13,color:"var(--muted)",marginBottom:16,lineHeight:1.6}}>
          Choose how to apply your updated assumptions.
          {deals?.length > 0 && <span> You have <strong style={{color:"var(--text)"}}>{(deals||[]).length} existing deal{(deals||[]).length!==1?"s":""}</strong>.</span>}
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>

          {/* Push to All Deals — with field selector */}
          <div style={{border:"1px solid var(--border)",borderRadius:10,overflow:"hidden"}}>
            <button onClick={()=>setShowPushPanel(p=>!p)}
              style={{width:"100%",background:"var(--accent)",color:"#fff",border:"none",
                padding:"12px 20px",fontSize:14,fontWeight:700,cursor:"pointer",textAlign:"left",
                display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:18}}>🔄</span>
              <div style={{flex:1}}>
                <div>Push to All Deals</div>
                <div style={{fontSize:12,fontWeight:400,opacity:0.85}}>
                  {pushedCount === totalFields
                    ? `All ${totalFields} fields will be pushed`
                    : `${pushedCount} of ${totalFields} fields selected`}
                </div>
              </div>
              <span style={{fontSize:12,opacity:0.8}}>{showPushPanel ? "▲ Hide" : "▼ Select fields"}</span>
            </button>

            {/* Field selector panel */}
            {showPushPanel && (
              <div style={{background:"var(--bg)",padding:16,borderTop:"1px solid var(--border)"}}>
                <div style={{fontSize:12,color:"var(--muted)",marginBottom:12,lineHeight:1.5}}>
                  Uncheck any fields you want to <strong style={{color:"var(--text)"}}>preserve</strong> on existing deals (e.g. a locked-in rate on a deal under contract).
                </div>
                {SECTIONS.map(section => {
                  const sectionFields = PUSH_FIELDS.filter(f => f.section === section);
                  const allChecked = sectionFields.every(f => pushFields.has(f.key));
                  const someChecked = sectionFields.some(f => pushFields.has(f.key));
                  return (
                    <div key={section} style={{marginBottom:14}}>
                      {/* Section header with select-all toggle */}
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,paddingBottom:6,borderBottom:"1px solid var(--border-faint)"}}>
                        <input type="checkbox"
                          checked={allChecked}
                          ref={el => { if (el) el.indeterminate = !allChecked && someChecked; }}
                          onChange={() => toggleSection(section)}
                          style={{width:15,height:15,accentColor:"var(--accent)",cursor:"pointer"}}/>
                        <span style={{fontSize:12,fontWeight:700,color:"var(--text)"}}>{section}</span>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,paddingLeft:8}}>
                        {sectionFields.map(f => (
                          <label key={f.key} style={{display:"flex",alignItems:"center",gap:7,fontSize:12,color:pushFields.has(f.key)?"var(--text)":"var(--muted)",cursor:"pointer",padding:"3px 0"}}>
                            <input type="checkbox"
                              checked={pushFields.has(f.key)}
                              onChange={() => toggleField(f.key)}
                              style={{width:14,height:14,accentColor:"var(--accent)",cursor:"pointer"}}/>
                            {f.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
                <div style={{display:"flex",gap:8,marginTop:8,paddingTop:10,borderTop:"1px solid var(--border-faint)"}}>
                  <button onClick={() => setPushFields(new Set(PUSH_FIELDS.map(f=>f.key)))}
                    style={{fontSize:11,padding:"4px 10px",borderRadius:6,border:"1px solid var(--border)",background:"var(--card)",color:"var(--muted)",cursor:"pointer"}}>
                    Select All
                  </button>
                  <button onClick={() => setPushFields(new Set())}
                    style={{fontSize:11,padding:"4px 10px",borderRadius:6,border:"1px solid var(--border)",background:"var(--card)",color:"var(--muted)",cursor:"pointer"}}>
                    Clear All
                  </button>
                  <button onClick={() => { if (pushedCount > 0) handleSave(true); }}
                    disabled={pushedCount === 0 || saving}
                    style={{marginLeft:"auto",fontSize:12,padding:"6px 16px",borderRadius:100,border:"none",
                      background:pushedCount > 0 ? "var(--accent)" : "var(--border)",
                      color:pushedCount > 0 ? "#fff" : "var(--muted)",
                      cursor:pushedCount > 0 ? "pointer" : "not-allowed",fontWeight:700}}>
                    {pushedCount === 0 ? "Select fields to push" : `Push ${pushedCount} field${pushedCount!==1?"s":""} to ${(deals||[]).length} deal${(deals||[]).length!==1?"s":""}`}
                  </button>
                </div>
              </div>
            )}

            {/* Quick confirm if panel closed */}
            {!showPushPanel && (
              <button onClick={() => handleSave(true)} disabled={saving}
                style={{width:"100%",background:"var(--card)",border:"none",borderTop:"1px solid var(--border)",
                  padding:"10px 20px",fontSize:13,color:"var(--accent)",cursor:"pointer",fontWeight:600,
                  opacity:saving?0.7:1}}>
                ✓ Confirm & Push {pushedCount} field{pushedCount!==1?"s":""} →
              </button>
            )}
          </div>

          <button onClick={() => handleSave(false)} disabled={saving}
            style={{background:"var(--card)",color:"var(--text)",border:"1px solid var(--accent)",borderRadius:8,
              padding:"12px 20px",fontSize:14,fontWeight:700,cursor:"pointer",textAlign:"left",
              opacity:saving?0.7:1,display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:18}}>✨</span>
            <div>
              <div>Apply to New Deals Only</div>
              <div style={{fontSize:12,fontWeight:400,color:"var(--muted)"}}>Existing deals are unchanged — new deals start with these defaults</div>
            </div>
          </button>

          <button onClick={() => setLocal({...DEFAULT_PREFS})}
            style={{background:"none",border:"1px solid var(--border)",borderRadius:8,
              padding:"12px 20px",fontSize:14,color:"var(--muted)",cursor:"pointer",textAlign:"left",
              display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:18}}>↩️</span>
            <div>
              <div>Reset to Defaults</div>
              <div style={{fontSize:12,fontWeight:400}}>Restore all values to system defaults (does not save)</div>
            </div>
          </button>
        </div>
        {saved && <div style={{color:"#10b981",fontSize:13,fontWeight:600,marginTop:12}}>✓ Settings saved</div>}
      </div>
    </div>
  );
}

export default SettingsPage;