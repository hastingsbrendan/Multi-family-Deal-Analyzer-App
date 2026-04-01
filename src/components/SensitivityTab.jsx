import React, { useState, useMemo } from 'react';
import { FMT_USD, FMT_PCT } from '../lib/constants';
import { calcDeal, calcSensitivity } from '../lib/calc';
import { useIsMobile } from '../lib/hooks';

// ─── DEFAULT SCENARIO OVERRIDES ───────────────────────────────────────────────
const DEFAULT_SCENARIOS = {
  adverse: {
    label: 'Adverse',
    icon: '🌧',
    color: 'var(--red)',
    softColor: 'rgba(239,68,68,0.12)',
    borderColor: 'rgba(239,68,68,0.4)',
    overrides: { rentDelta: -10, vacancyDelta: 5, expenseDelta: 10, appreciationDelta: -1, rateDelta: 1, propertyTaxDelta: 10 }
  },
  base: {
    label: 'Base',
    icon: '📊',
    color: 'var(--accent)',
    softColor: 'rgba(13,148,136,0.12)',
    borderColor: 'rgba(13,148,136,0.4)',
    overrides: { rentDelta: 0, vacancyDelta: 0, expenseDelta: 0, appreciationDelta: 0, rateDelta: 0, propertyTaxDelta: 0 }
  },
  optimal: {
    label: 'Optimal',
    icon: '🌤',
    color: 'var(--green)',
    softColor: 'rgba(16,185,129,0.12)',
    borderColor: 'rgba(16,185,129,0.4)',
    overrides: { rentDelta: 5, vacancyDelta: -2, expenseDelta: 0, appreciationDelta: 2, rateDelta: -0.5, propertyTaxDelta: 0 }
  }
};

// Apply scenario overrides to a deal to produce a modified copy for calc
function applyScenario(deal, overrides) {
  const m = JSON.parse(JSON.stringify(deal));
  const a = m.assumptions;
  if (overrides.rentDelta)         a.units = a.units.map(u => ({ ...u, rent: +u.rent * (1 + overrides.rentDelta/100) }));
  if (overrides.vacancyDelta)      a.vacancyRate = Math.max(0, +a.vacancyRate + overrides.vacancyDelta);
  if (overrides.appreciationDelta) a.appreciationRate = +a.appreciationRate + overrides.appreciationDelta;
  if (overrides.rateDelta)         a.interestRate = Math.max(0, +a.interestRate + overrides.rateDelta);
  if (overrides.expenseDelta || overrides.propertyTaxDelta) {
    const expModes = a.expenseModes || {};
    // Apply expense delta to flat $ values; property tax delta applied separately
    if (overrides.expenseDelta) {
      ['insurance','maintenance','capex','propertyMgmt','utilities'].forEach(k => {
        if (a.expenses?.[k]) a.expenses[k] = +a.expenses[k] * (1 + overrides.expenseDelta/100);
      });
      ['insurancePct','maintenancePct','capexPct','propertyMgmtPct','utilitiesPct'].forEach(k => {
        if (a[k]) a[k] = +a[k] * (1 + overrides.expenseDelta/100);
      });
    }
    if (overrides.propertyTaxDelta) {
      if (a.expenses?.propertyTax) a.expenses.propertyTax = +a.expenses.propertyTax * (1 + overrides.propertyTaxDelta/100);
      if (a.propertyTaxPct) a.propertyTaxPct = +a.propertyTaxPct * (1 + overrides.propertyTaxDelta/100);
    }
  }
  return m;
}

// ─── OVERRIDE FIELD DEFINITIONS ──────────────────────────────────────────────
const OVERRIDE_FIELDS = [
  { key:'rentDelta',          label:'Rent',            unit:'% change',  min:-30, max:30,  step:1 },
  { key:'vacancyDelta',       label:'Vacancy',         unit:'pp change', min:-10, max:15,  step:1 },
  { key:'expenseDelta',       label:'Expenses',        unit:'% change',  min:-20, max:30,  step:1 },
  { key:'propertyTaxDelta',   label:'Property Taxes',  unit:'% change',  min:-20, max:30,  step:1 },
  { key:'appreciationDelta',  label:'Appreciation',    unit:'pp change', min:-4,  max:6,   step:0.5 },
  { key:'rateDelta',          label:'Interest Rate',   unit:'pp change', min:-3,  max:3,   step:0.25 },
];

// ─── SLIDER DEFINITIONS (Item 802) ───────────────────────────────────────────
const SLIDER_DEFS = [
  { key:'purchasePrice', label:'Purchase Price',    unit:'$',   min:0.8,  max:1.2,  step:0.005, format: v => FMT_USD(v), type:'multiplier' },
  { key:'rent',          label:'Monthly Rent / Unit', unit:'$', min:0.7,  max:1.3,  step:0.005, format: v => FMT_USD(v), type:'multiplier' },
  { key:'vacancyRate',   label:'Vacancy Rate',      unit:'%',   min:0,    max:20,   step:0.5,   format: v => v.toFixed(1)+'%', type:'absolute' },
  { key:'interestRate',  label:'Interest Rate',     unit:'%',   min:3,    max:10,   step:0.125, format: v => v.toFixed(2)+'%', type:'absolute' },
  { key:'downPaymentPct',label:'Down Payment',      unit:'%',   min:10,   max:30,   step:1,     format: v => v.toFixed(0)+'%', type:'absolute' },
  { key:'appreciationRate', label:'Appreciation',   unit:'%',   min:0,    max:6,    step:0.25,  format: v => v.toFixed(1)+'%', type:'absolute' },
  { key:'propertyTax',   label:'Property Tax',      unit:'$',   min:0.5,  max:2.0,  step:0.025, format: v => FMT_USD(v), type:'expense_multiplier' },
];

// Thresholds for "green zone"
const THRESHOLDS = { coc: 0.06, irr: 0.12, dscr: 1.25, cashFlow: 0 };

function SensitivityTab({ deal }) {
  const isMobile = useIsMobile();
  const [metric, setMetric] = useState('irr');
  const [activeScenario, setActiveScenario] = useState('base');
  const [customScenarios, setCustomScenarios] = useState({
    adverse: { ...DEFAULT_SCENARIOS.adverse.overrides },
    base:    { ...DEFAULT_SCENARIOS.base.overrides },
    optimal: { ...DEFAULT_SCENARIOS.optimal.overrides },
  });
  const [editingScenario, setEditingScenario] = useState(null);

  // Slider state — null means use base deal value
  const [sliderOverrides, setSliderOverrides] = useState({});

  // ── Build the scenario-modified deal ──────────────────────────────────────
  const scenarioDeal = useMemo(() => {
    const overrides = customScenarios[activeScenario];
    return activeScenario === 'base' ? deal : applyScenario(deal, overrides);
  }, [deal, activeScenario, customScenarios]);

  // ── Build slider-modified deal ─────────────────────────────────────────────
  const sliderDeal = useMemo(() => {
    const m = JSON.parse(JSON.stringify(deal));
    const a = m.assumptions;
    Object.entries(sliderOverrides).forEach(([key, val]) => {
      if (key === 'purchasePrice') a.purchasePrice = val;
      else if (key === 'rent') a.units = a.units.map(u => ({ ...u, rent: val }));
      else if (key === 'propertyTax') { if (a.expenses?.propertyTax) a.expenses.propertyTax = val; }
      else a[key] = val;
    });
    return m;
  }, [deal, sliderOverrides]);

  const base      = useMemo(() => calcDeal(deal), [deal]);
  const scenCalc  = useMemo(() => calcDeal(scenarioDeal), [scenarioDeal]);
  const sliderCalc = useMemo(() => calcDeal(sliderDeal), [sliderDeal]);
  const sens      = useMemo(() => calcSensitivity(deal), [deal]);

  // Sensitivity (tornado) uses the base deal
  const baseVal   = metric === 'irr' ? base.irr : base.cocReturn;
  const sorted    = useMemo(() => [...sens].sort((a,b) => {
    const rA = Math.abs((metric==='irr'?a.irrLowDelta:a.cocLowDelta) - (metric==='irr'?a.irrHighDelta:a.cocHighDelta));
    const rB = Math.abs((metric==='irr'?b.irrLowDelta:b.cocLowDelta) - (metric==='irr'?b.irrHighDelta:b.cocHighDelta));
    return rB - rA;
  }), [sens, metric]);
  const maxDelta  = Math.max(...sorted.flatMap(s => [
    Math.abs(metric==='irr'?s.irrLowDelta:s.cocLowDelta),
    Math.abs(metric==='irr'?s.irrHighDelta:s.cocHighDelta)
  ]), 0.001);
  const BAR_PCT   = 36;

  // Slider helpers
  const getSliderBase = (def) => {
    const a = deal.assumptions;
    if (def.key === 'purchasePrice') return +a.purchasePrice;
    if (def.key === 'rent') return a.units?.length ? +a.units[0].rent : 1500;
    if (def.key === 'propertyTax') return +a.expenses?.propertyTax || 0;
    return +a[def.key] || 0;
  };

  const getSliderValue = (def) => {
    if (sliderOverrides[def.key] !== undefined) return sliderOverrides[def.key];
    return getSliderBase(def);
  };

  const getSliderMin = (def) => {
    const base = getSliderBase(def);
    return def.type === 'multiplier' || def.type === 'expense_multiplier' ? base * def.min : def.min;
  };
  const getSliderMax = (def) => {
    const base = getSliderBase(def);
    return def.type === 'multiplier' || def.type === 'expense_multiplier' ? base * def.max : def.max;
  };
  const getSliderStep = (def) => {
    const base = getSliderBase(def);
    return def.type === 'multiplier' || def.type === 'expense_multiplier' ? base * def.step : def.step;
  };

  // Find break-even for CoC (where monthly CF = 0) on rent slider
  const rentBreakeven = useMemo(() => {
    const a = deal.assumptions;
    // Binary search for rent where monthly CF ≈ 0
    let lo = getSliderMin(SLIDER_DEFS[1]);
    let hi = getSliderMax(SLIDER_DEFS[1]);
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      const m = JSON.parse(JSON.stringify(deal));
      m.assumptions.units = m.assumptions.units.map(u => ({ ...u, rent: mid }));
      const r = calcDeal(m);
      if (r.monthlyCF > 0) hi = mid; else lo = mid;
    }
    return (lo + hi) / 2;
  }, [deal]);

  const delta = (val, base) => {
    if (!base) return null;
    const d = ((val - base) / Math.abs(base)) * 100;
    return d;
  };

  const sBtn = (id) => {
    const sc = DEFAULT_SCENARIOS[id];
    const isActive = activeScenario === id;
    return (
      <button key={id} onClick={() => setActiveScenario(id)}
        style={{flex:1, padding:"10px 8px", borderRadius:8, cursor:"pointer", fontWeight:700, fontSize:13,
          border: isActive ? `2px solid ${sc.color}` : "1px solid var(--border)",
          background: isActive ? sc.softColor : "var(--card)",
          color: isActive ? sc.color : "var(--muted)",
          transition:"all 0.15s"}}>
        <div style={{fontSize:18,marginBottom:2}}>{sc.icon}</div>
        {sc.label}
        {isActive && <div style={{fontSize:9,fontWeight:600,marginTop:2,opacity:0.8}}>ACTIVE</div>}
      </button>
    );
  };

  const metricCard = (label, base, scen, fmt, good) => {
    const d = delta(scen, base);
    const isGood = d !== null ? (good ? d >= 0 : d <= 0) : null;
    return (
      <div style={{background:"var(--bg)",border:"1px solid var(--border)",borderRadius:8,padding:"10px 12px",textAlign:"center"}}>
        <div style={{fontSize:10,color:"var(--muted)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>{label}</div>
        <div style={{fontSize:16,fontWeight:800,color:"var(--text)"}}>{fmt(scen)}</div>
        {d !== null && Math.abs(d) > 0.1 && (
          <div style={{fontSize:10,fontWeight:700,color:isGood?"var(--green)":"var(--red)",marginTop:2}}>
            {d > 0 ? "▲" : "▼"} {Math.abs(d).toFixed(1)}% vs base
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{padding:"16px 0"}}>

      {/* ══════════════════════════════════════════════════════
          ITEM 801 — SCENARIO ANALYSIS
      ══════════════════════════════════════════════════════ */}
      <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,padding:16,marginBottom:20}}>
        <div style={{fontSize:11,fontWeight:800,letterSpacing:"0.1em",color:"var(--muted)",marginBottom:12,textTransform:"uppercase"}}>
          📐 Scenario Analysis
        </div>

        {/* Scenario toggle buttons */}
        <div style={{display:"flex",gap:8,marginBottom:16}}>
          {Object.keys(DEFAULT_SCENARIOS).map(id => sBtn(id))}
        </div>

        {/* Scenario metrics */}
        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)",gap:8,marginBottom:14}}>
          {metricCard("CoC Yr1",    base.cocReturn,  scenCalc.cocReturn,  FMT_PCT, true)}
          {metricCard("Cap Rate",   base.capRate,    scenCalc.capRate,    FMT_PCT, true)}
          {metricCard("IRR 10yr",   base.irr,        scenCalc.irr,        FMT_PCT, true)}
          {metricCard("DSCR",       base.dscr,       scenCalc.dscr,       v => v?.toFixed(2)+'x', true)}
        </div>
        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(3,1fr)",gap:8,marginBottom:14}}>
          {metricCard("Monthly CF", base.monthlyCF,  scenCalc.monthlyCF,  FMT_USD, true)}
          {metricCard("NOI Yr1",    base.noi,        scenCalc.noi,        FMT_USD, true)}
          {metricCard("Eq. Multiple", base.eqMultiple, scenCalc.eqMultiple, v => (v||0).toFixed(2)+'x', true)}
        </div>

        {/* Customize scenario overrides */}
        <button onClick={() => setEditingScenario(editingScenario === activeScenario ? null : activeScenario)}
          style={{background:"none",border:"1px solid var(--border)",borderRadius:7,padding:"6px 12px",
            fontSize:11,color:"var(--muted)",cursor:"pointer",fontWeight:600,width:"100%"}}>
          {editingScenario === activeScenario ? "▲ Hide override editor" : `✏️ Customize ${DEFAULT_SCENARIOS[activeScenario].label} overrides`}
        </button>

        {editingScenario === activeScenario && (
          <div style={{marginTop:12,padding:12,background:"var(--bg)",borderRadius:8,border:"1px solid var(--border-faint)"}}>
            <div style={{fontSize:11,color:"var(--muted)",marginBottom:10,lineHeight:1.5}}>
              Adjust the {DEFAULT_SCENARIOS[activeScenario].label} scenario assumptions. Changes are relative to your base deal inputs.
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              {OVERRIDE_FIELDS.map(f => (
                <div key={f.key}>
                  <label style={{fontSize:10,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.05em",display:"block",marginBottom:4}}>
                    {f.label} <span style={{fontWeight:400,textTransform:"none"}}>({f.unit})</span>
                  </label>
                  <input type="number"
                    value={customScenarios[activeScenario][f.key]}
                    step={f.step}
                    min={f.min}
                    max={f.max}
                    onChange={e => setCustomScenarios(prev => ({
                      ...prev,
                      [activeScenario]: { ...prev[activeScenario], [f.key]: +e.target.value }
                    }))}
                    style={{width:"100%",padding:"7px 10px",borderRadius:7,fontSize:13,
                      border:"1px solid var(--border)",background:"var(--input-bg)",color:"var(--text)",fontFamily:"inherit"}}/>
                </div>
              ))}
            </div>
            <button onClick={() => setCustomScenarios(prev => ({
                ...prev,
                [activeScenario]: { ...DEFAULT_SCENARIOS[activeScenario].overrides }
              }))}
              style={{marginTop:10,background:"none",border:"1px solid var(--border)",borderRadius:6,
                padding:"5px 12px",fontSize:11,color:"var(--muted)",cursor:"pointer"}}>
              ↩ Reset to defaults
            </button>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════
          ITEM 802 — INTERACTIVE SENSITIVITY SLIDERS
      ══════════════════════════════════════════════════════ */}
      <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,padding:16,marginBottom:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:800,letterSpacing:"0.1em",color:"var(--muted)",textTransform:"uppercase"}}>
            🎚 Interactive Sliders
          </div>
          {Object.keys(sliderOverrides).length > 0 && (
            <button onClick={() => setSliderOverrides({})}
              style={{background:"none",border:"1px solid var(--border)",borderRadius:6,padding:"3px 10px",
                fontSize:11,color:"var(--muted)",cursor:"pointer",fontWeight:600}}>
              ↩ Reset
            </button>
          )}
        </div>

        {/* Live metrics strip */}
        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)",gap:6,marginBottom:16,
          padding:10,background:"var(--bg)",borderRadius:8,border:"1px solid var(--border-faint)"}}>
          {[
            ["CoC",  FMT_PCT(sliderCalc.cocReturn),  sliderCalc.cocReturn  >= THRESHOLDS.coc],
            ["IRR",  FMT_PCT(sliderCalc.irr),         sliderCalc.irr        >= THRESHOLDS.irr],
            ["DSCR", (sliderCalc.dscr||0).toFixed(2)+'x', sliderCalc.dscr  >= THRESHOLDS.dscr],
            ["Mo. CF", FMT_USD(sliderCalc.monthlyCF), sliderCalc.monthlyCF >= THRESHOLDS.cashFlow],
          ].map(([lbl, val, isGood]) => (
            <div key={lbl} style={{textAlign:"center"}}>
              <div style={{fontSize:9,color:"var(--muted)",fontWeight:700,textTransform:"uppercase",marginBottom:2}}>{lbl}</div>
              <div style={{fontSize:14,fontWeight:800,color:isGood?"var(--green)":"var(--red)"}}>{val}</div>
            </div>
          ))}
        </div>

        {/* Sliders */}
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {SLIDER_DEFS.map(def => {
            const baseVal = getSliderBase(def);
            const curVal  = getSliderValue(def);
            const minVal  = getSliderMin(def);
            const maxVal  = getSliderMax(def);
            const stepVal = getSliderStep(def);
            const pct     = maxVal > minVal ? (curVal - minVal) / (maxVal - minVal) : 0.5;
            const hasOverride = sliderOverrides[def.key] !== undefined;

            // Rent break-even marker position
            const showBreakeven = def.key === 'rent' && rentBreakeven >= minVal && rentBreakeven <= maxVal;
            const bevenPct      = maxVal > minVal ? (rentBreakeven - minVal) / (maxVal - minVal) : null;

            return (
              <div key={def.key}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                  <span style={{fontSize:12,fontWeight:700,color:hasOverride?"var(--accent)":"var(--text)"}}>
                    {def.label}{hasOverride?" ✦":""}
                  </span>
                  <span style={{fontSize:13,fontWeight:800,color:"var(--text)",fontVariantNumeric:"tabular-nums"}}>
                    {def.format(curVal)}
                    {hasOverride && <span style={{fontSize:10,color:"var(--muted)",marginLeft:6}}>base: {def.format(baseVal)}</span>}
                  </span>
                </div>
                <div style={{position:"relative",marginBottom:2}}>
                  <input type="range"
                    min={minVal} max={maxVal} step={stepVal} value={curVal}
                    onChange={e => setSliderOverrides(prev => ({ ...prev, [def.key]: +e.target.value }))}
                    style={{width:"100%",accentColor:"var(--accent)",cursor:"pointer"}}/>
                  {/* Break-even marker for rent */}
                  {showBreakeven && bevenPct !== null && (
                    <div style={{position:"absolute",top:-18,left:`calc(${bevenPct*100}% - 1px)`,
                      borderLeft:"2px dashed var(--refi-amber)",height:36,pointerEvents:"none"}}>
                      <div style={{position:"absolute",top:-14,left:4,fontSize:9,fontWeight:700,
                        color:"var(--refi-amber)",whiteSpace:"nowrap"}}>
                        CF=0 @ {def.format(rentBreakeven)}
                      </div>
                    </div>
                  )}
                </div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"var(--muted)"}}>
                  <span>{def.format(minVal)}</span>
                  <span>{def.format(maxVal)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          TORNADO CHART (existing, unchanged)
      ══════════════════════════════════════════════════════ */}
      <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:20,flexWrap:"wrap"}}>
        <span style={{fontSize:13,color:"var(--muted)",fontWeight:600}}>Tornado Metric:</span>
        {[["irr","IRR (10yr)"],["coc","CoC (Yr1)"]].map(([k,lbl])=>(
          <button key={k} onClick={()=>setMetric(k)}
            style={{padding:"7px 14px",borderRadius:6,border:"1px solid var(--border)",
              background:metric===k?"var(--accent)":"var(--card)",
              color:metric===k?"#fff":"var(--text)",cursor:"pointer",fontSize:13,fontWeight:700}}>
            {lbl}
          </button>
        ))}
        <span style={{fontSize:13,color:"var(--muted)"}}>Base: <strong style={{color:"var(--text)"}}>{FMT_PCT(baseVal)}</strong></span>
      </div>
      <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,padding:"20px 16px"}}>
        <div style={{fontSize:11,fontWeight:800,letterSpacing:"0.1em",color:"var(--muted)",marginBottom:16,textTransform:"uppercase"}}>
          Tornado Chart — {metric==="irr"?`${Math.max(1,Math.min(30,+(deal?.assumptions?.holdPeriod||10)))}-Year IRR`:"Year 1 CoC"}
        </div>
        <div style={{display:"grid",gridTemplateColumns:`${isMobile?70:90}px 1fr`,gap:0,marginBottom:6}}>
          <div/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1px 1fr"}}>
            <div style={{textAlign:"center",fontSize:10,fontWeight:700,color:"var(--red)",paddingBottom:4,borderBottom:"1px solid var(--border-faint)"}}>↙ Downside</div>
            <div/>
            <div style={{textAlign:"center",fontSize:10,fontWeight:700,color:"var(--green)",paddingBottom:4,borderBottom:"1px solid var(--border-faint)"}}>Upside ↗</div>
          </div>
        </div>
        {sorted.map((s,i)=>{
          const lowD  = metric==="irr"?s.irrLowDelta:s.cocLowDelta;
          const highD = metric==="irr"?s.irrHighDelta:s.cocHighDelta;
          const lowAbs  = metric==="irr"?s.irrLowAbs:s.cocLowAbs;
          const highAbs = metric==="irr"?s.irrHighAbs:s.cocHighAbs;
          const lowW  = (Math.abs(lowD)/maxDelta)*BAR_PCT;
          const highW = (Math.abs(highD)/maxDelta)*BAR_PCT;
          return (
            <div key={i} style={{display:"grid",gridTemplateColumns:`${isMobile?70:90}px 1fr`,gap:0,marginBottom:10,alignItems:"center"}}>
              <div style={{paddingRight:8,textAlign:"right"}}>
                <div style={{fontSize:11,fontWeight:700,color:"var(--text)"}}>{s.label}</div>
                <div style={{fontSize:9,color:"var(--muted)"}}>{s.unit}</div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1px 1fr",alignItems:"center"}}>
                <div style={{display:"flex",alignItems:"center",gap:4,justifyContent:"flex-end"}}>
                  <span style={{fontSize:10,color:"var(--muted)",whiteSpace:"nowrap",minWidth:44,textAlign:"right",fontWeight:600}}>{FMT_PCT(lowAbs)}</span>
                  <div style={{width:`${BAR_PCT}%`,display:"flex",justifyContent:"flex-end"}}>
                    <div style={{width:`${lowW}%`,height:24,background:"rgba(239,68,68,0.8)",borderRadius:"3px 0 0 3px",minWidth:lowW>0?3:0}}/>
                  </div>
                </div>
                <div style={{background:"var(--border)",height:24,width:1}}/>
                <div style={{display:"flex",alignItems:"center",gap:4}}>
                  <div style={{width:`${BAR_PCT}%`,display:"flex",justifyContent:"flex-start"}}>
                    <div style={{width:`${highW}%`,height:24,background:"rgba(16,185,129,0.8)",borderRadius:"0 3px 3px 0",minWidth:highW>0?3:0}}/>
                  </div>
                  <span style={{fontSize:10,color:"var(--muted)",whiteSpace:"nowrap",minWidth:44,fontWeight:600}}>{FMT_PCT(highAbs)}</span>
                </div>
              </div>
            </div>
          );
        })}
        <div style={{display:"flex",gap:16,marginTop:12,paddingTop:12,borderTop:"1px solid var(--border-faint)",fontSize:10,color:"var(--muted)",flexWrap:"wrap"}}>
          <span><span style={{color:"var(--red)",fontWeight:700}}>■</span> Downside</span>
          <span><span style={{color:"var(--green)",fontWeight:700}}>■</span> Upside</span>
        </div>
      </div>
    </div>
  );
}

export default SensitivityTab;
