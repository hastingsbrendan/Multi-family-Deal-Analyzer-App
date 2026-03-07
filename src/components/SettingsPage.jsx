import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { iSty, btnSm, srcSty } from './ui/InputRow';
import { FMT_USD, STATUS_OPTIONS } from '../lib/constants';
import { DEFAULT_PREFS } from '../lib/calc';
import { exportPortfolioCSV, dlFile } from '../lib/export';

function SettingsPage({ prefs, onSave, onBack, deals, dark, setDark }) {
  const [local, setLocal] = useState({ ...DEFAULT_PREFS, ...prefs });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const set = (key, val) => setLocal(p => ({ ...p, [key]: val }));
  const setCC = (key, val) => setLocal(p => ({ ...p, closingCosts: { ...p.closingCosts, [key]: val } }));

  const handleSave = (applyToDeals) => {
    setSaving(true);
    onSave(local, applyToDeals);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };


  const card  = { background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, padding:24, marginBottom:14 };
  const iS    = { width:"100%", padding:"9px 12px", borderRadius:7, fontSize:14, border:"1px solid var(--border)", background:"var(--input-bg)", color:"var(--text)", fontFamily:"inherit" };
  const label = (txt) => <label style={{fontSize:10,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.06em",display:"block",marginBottom:4}}>{txt}</label>;
  const row2  = { display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 };
  const row3  = { display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 };

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

      {/* ── Financing Defaults ───────────────────────────── */}
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

      {/* ── Income & Growth Defaults ─────────────────────── */}
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

      {/* ── Tax ─────────────────────────────────────────── */}
      <div style={card}>
        <div style={{fontWeight:700, fontSize:14, marginBottom:16}}>Tax</div>
        <div style={{maxWidth:180}}>
          {label("Income Tax Bracket %")}
          <input type="number" value={local.taxBracket} onChange={e=>set("taxBracket",+e.target.value)} style={iS} min={0} max={60}/>
        </div>
      </div>

      {/* ── Expense % Defaults ───────────────────────────── */}
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

      {/* ── Closing Costs ────────────────────────────────── */}
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

      {/* ── Red Flag Thresholds ──────────────────────────── */}
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

      {/* ── Actions ──────────────────────────────────────── */}
      <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,padding:20,marginBottom:14}}>
        <div style={{fontWeight:700,fontSize:14,marginBottom:4}}>Save Changes</div>
        <div style={{fontSize:13,color:"var(--muted)",marginBottom:16,lineHeight:1.6}}>
          Choose how to apply your updated assumptions.
          {deals?.length > 0 && <span> You have <strong style={{color:"var(--text)"}}>{(deals||[]).length} existing deal{(deals||[]).length!==1?"s":""}</strong>.</span>}
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <button onClick={()=>handleSave(true)} disabled={saving}
            style={{background:"var(--accent)",color:"#fff",border:"none",borderRadius:100,
              padding:"12px 20px",fontSize:14,fontWeight:700,cursor:"pointer",textAlign:"left",
              opacity:saving?0.7:1,display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:18}}>🔄</span>
            <div>
              <div>Push to All Deals</div>
              <div style={{fontSize:12,fontWeight:400,opacity:0.85}}>Updates financing, growth & tax assumptions on all existing deals</div>
            </div>
          </button>
          <button onClick={()=>handleSave(false)} disabled={saving}
            style={{background:"var(--card)",color:"var(--text)",border:"1px solid var(--accent)",borderRadius:8,
              padding:"12px 20px",fontSize:14,fontWeight:700,cursor:"pointer",textAlign:"left",
              opacity:saving?0.7:1,display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:18}}>✨</span>
            <div>
              <div>Apply to New Deals Only</div>
              <div style={{fontSize:12,fontWeight:400,color:"var(--muted)"}}>Existing deals are unchanged — new deals start with these defaults</div>
            </div>
          </button>
          <button onClick={()=>setLocal({...DEFAULT_PREFS})}
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


// ─── ONBOARDING TOUR ──────────────────────────────────────────────────────────

export default SettingsPage;
