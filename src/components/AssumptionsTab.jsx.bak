import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { FMT_USD, FMT_PCT, mapsUrl, RENTCAST_KEY, sbClient, SB_BUCKET } from '../lib/constants';;
import { resolveExpenses } from '../lib/calc';
import { useIsMobile } from '../lib/hooks';
import InputRow, { iSty, btnSm, srcSty, fmtInputDisplay, parseInputValue } from './ui/InputRow';
import { getFloodZoneForAddress, floodZoneInfo } from '../lib/floodZone';
import Section from './ui/Section';

// Hoisted to module scope — must NOT be defined inside render or IIFE
// (React would create a new component identity on every render, causing inputs to lose focus)
function FmtInt({value, onChange, placeholder, style}) {
  const [focused, setFocused] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const raw = Math.round(+value || 0);  // always integer — floats from DB (e.g. 20248.5) must be rounded
  const display = focused ? draft : (raw ? raw.toLocaleString() : '');
  return (
    <input
      type="text"
      inputMode="numeric"
      value={display}
      placeholder={placeholder}
      onFocus={()=>{ setFocused(true); setDraft(raw ? String(raw) : ''); }}
      onBlur={()=>{ setFocused(false); const n = parseInt(draft.replace(/,/g,''),10); onChange(isNaN(n)?0:n); }}
      onChange={e=>{ setDraft(e.target.value.replace(/[^0-9]/g,'')); }}
      style={style}/>
  );
}

function ExpenseInputRow({lbl, modeToggle, isItemPct, rawVal, onChange, mobile}) {
  const [focused, setFocused] = useState(false);
  const displayVal = focused
    ? (String(rawVal)==="0"||rawVal===0?"":String(rawVal).replace(/,/g,""))
    : fmtInputDisplay(rawVal);
  const handleChange = e => onChange(parseInputValue(e.target.value));
  if(mobile){return(
    <div style={{padding:"10px 0",borderBottom:"1px solid var(--border-faint)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
        <label style={{fontSize:13,color:"var(--muted)",fontWeight:600}}>{lbl}</label>{modeToggle}
      </div>
      <div style={{display:"flex",alignItems:"center",gap:4}}>
        {!isItemPct&&<span style={{fontSize:13,color:"var(--muted)"}}>$</span>}
        <input type="text" inputMode="decimal" value={displayVal} onChange={handleChange} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} placeholder="0" style={iSty}/>
        <span style={{fontSize:12,color:"var(--muted)",whiteSpace:"nowrap",flexShrink:0,marginLeft:2}}>{isItemPct?"% rent":"/yr"}</span>
      </div>
    </div>
  );}
  return(
    <div style={{display:"grid",gridTemplateColumns:"200px auto 1fr",gap:8,alignItems:"center",padding:"5px 0",borderBottom:"1px solid var(--border-faint)"}}>
      <label style={{fontSize:13,color:"var(--muted)",fontWeight:500}}>{lbl}</label>
      {modeToggle}
      <div style={{display:"flex",alignItems:"center",gap:4}}>
        {!isItemPct&&<span style={{fontSize:13,color:"var(--muted)"}}>$</span>}
        <input type="text" inputMode="decimal" value={displayVal} onChange={handleChange} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} placeholder="0" style={iSty}/>
        <span style={{fontSize:13,color:"var(--muted)",whiteSpace:"nowrap"}}>{isItemPct?"% of rent":"/yr"}</span>
      </div>
    </div>
  );
}

// ─── ASSUMPTIONS TAB ──────────────────────────────────────────────────────────

// ─── PROPERTY LOOKUP (RENTCAST) ────────────────────────────────────────────────
function parseAddressFromUrl(url) {
  try {
    const u = url.trim();
    // Zillow: /homedetails/123-main-st-chicago-il-60601/12345_zpid/
    const zillow = u.match(/zillow\.com\/homedetails\/([^/]+)/);
    if (zillow) return zillow[1].replace(/-zpid.*/, '').replace(/-/g, ' ').replace(/(\w{2})(\d{5})$/, '$1 $2').trim();
    // Redfin: /IL/Chicago/123-Main-St-60601/home/12345
    const redfin = u.match(/redfin\.com\/[A-Z]{2}\/[^/]+\/([^/]+)\/home/);
    if (redfin) return redfin[1].replace(/-/g, ' ').trim();
    // Realtor.com: /realestateandhomes-detail/123-Main-St_Chicago_IL_60601_M12345/
    const realtor = u.match(/realtor\.com\/realestateandhomes-detail\/([^_/]+_[^_/]+_[A-Z]{2}_\d{5})/);
    if (realtor) return realtor[1].replace(/_/g, ' ').trim();
    // If it doesn't look like a URL, treat as raw address
    if (!u.startsWith('http')) return u;
    return null;
  } catch(e) { return null; }
}

function PropertyLookupPanel({deal, onChange}) {
  const [input, setInput] = React.useState(deal.address||'');
  // Keep input in sync if address is updated from outside (e.g. typed on Summary tab)
  React.useEffect(() => {
    setInput(prev => prev === '' && deal.address ? deal.address : prev);
  }, [deal.address]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [preview, setPreview] = React.useState(null);
  const [open, setOpen] = React.useState(false);
  const isMobile = useIsMobile();

  const doLookup = async () => {
    if (!input.trim()) return;
    if (!RENTCAST_KEY) { setError('Add your Rentcast API key to the RENTCAST_KEY constant in the source file.'); return; }
    setLoading(true); setError(''); setPreview(null);
    try {
      const addr = parseAddressFromUrl(input.trim());
      if (!addr) { setError('Could not parse address from URL. Try pasting the address directly.'); setLoading(false); return; }

      const headers = { 'X-Api-Key': RENTCAST_KEY, 'Accept': 'application/json' };
      const encAddr = encodeURIComponent(addr);

      // Call property records endpoint
      const propRes = await fetch(`https://api.rentcast.io/v1/properties?address=${encAddr}&limit=1`, { headers });
      if (!propRes.ok) { const t = await propRes.text(); setError(`Rentcast error (${propRes.status}): ${t}`); setLoading(false); return; }
      const propData = await propRes.json();
      const prop = Array.isArray(propData) ? propData[0] : propData;

      if (!prop) { setError('No property found for that address. Try entering the address manually.'); setLoading(false); return; }

      // Call rent estimate endpoint
      // Build unique bedroom counts across configured units so each unit type gets an accurate estimate
      const numUnits = prop.bedrooms
        ? (((prop.propertyType||'').toLowerCase().includes('duplex') ? 2
          : (prop.propertyType||'').toLowerCase().includes('triplex') ? 3
          : (prop.propertyType||'').toLowerCase().includes('fourplex') ? 4 : 2))
        : 2;
      // Fetch one rent estimate per bedroom configuration; default to 2br if unknown
      const bedroomCounts = [];
      const bedsPerUnit = prop.bedrooms ? Math.round(prop.bedrooms / numUnits) : 2;
      for (let i = 0; i < Math.min(numUnits, 4); i++) bedroomCounts.push(bedsPerUnit);
      const uniqueBeds = [...new Set(bedroomCounts)];
      const rentByBeds = {};
      for (const beds of uniqueBeds) {
        const r = await fetch(`https://api.rentcast.io/v1/avm/rent/long-term?address=${encAddr}&bedrooms=${beds}&propertyType=Apartment`, { headers });
        if (r.ok) rentByBeds[beds] = await r.json();
      }
      // Also fetch whole-property estimate as fallback
      const rentRes = await fetch(`https://api.rentcast.io/v1/avm/rent/long-term?address=${encAddr}`, { headers });
      const rentData = rentRes.ok ? await rentRes.json() : null;

      setPreview({ prop, rent: rentData, rentByBeds, bedsPerUnit, parsedAddr: addr });
    } catch(e) { setError('Network error: ' + e.message); }
    setLoading(false);
  };

  const applyPreview = () => {
    if (!preview) return;
    const { prop, rent } = preview;
    const d = JSON.parse(JSON.stringify(deal));
    const a = d.assumptions;

    // Address
    if (prop.formattedAddress) d.address = prop.formattedAddress;

    // Units — infer from bedrooms if propertyType is multi-family
    const propType = (prop.propertyType || '').toLowerCase();
    const isMF = propType.includes('multi') || propType.includes('duplex') || propType.includes('triplex') || propType.includes('fourplex');
    if (isMF) {
      const unitGuess = propType.includes('duplex') ? 2 : propType.includes('triplex') ? 3 : propType.includes('fourplex') ? 4 : prop.units || 2;
      a.numUnits = Math.min(4, Math.max(2, +unitGuess || 2));
    }

    // Property tax — Rentcast returns annual tax amount
    // propertyTaxes = actual annual tax bill (what we want)
    // taxAssessments[year].value = assessed property value (NOT the tax amount)
    if (prop.propertyTaxes) {
      const taxYears = Object.keys(prop.propertyTaxes).sort().reverse();
      if (taxYears.length > 0) {
        const annualTax = prop.propertyTaxes[taxYears[0]];
        if (annualTax) {
          a.expenses.propertyTax = Math.round(annualTax);
          a.expenseModes.propertyTax = 'value';
        }
      }
    }

    // Rent estimate — use per-bedroom estimates when available, fall back to whole-property estimate
    const { rentByBeds, bedsPerUnit } = preview;
    for (let i = 0; i < a.numUnits; i++) {
      if (!a.units[i]) a.units[i] = { rent: 0, listedRent: 0, rentcastRent: 0, rentSource: '' };
      // Try to get a bedroom-specific estimate for this unit
      const unitBeds = bedsPerUnit || 2;
      const rentSrc = (rentByBeds && rentByBeds[unitBeds]) ? rentByBeds[unitBeds] : rent;
      if (rentSrc && rentSrc.rent) {
        a.units[i].rentcastRent = Math.round(rentSrc.rent);
        const lo = rentSrc.rentRangeLow ? Math.round(rentSrc.rentRangeLow) : null;
        const hi = rentSrc.rentRangeHigh ? Math.round(rentSrc.rentRangeHigh) : null;
        if (lo && hi) a.units[i].rentcastRentRange = `$${lo.toLocaleString()}–$${hi.toLocaleString()}`;
        a.units[i].rentcastBeds = unitBeds;
      }
    }

    // Store property metadata for display
    // Resolve annual property tax from propertyTaxes field
    let annualTax = null;
    if (prop.propertyTaxes) {
      const taxYrs = Object.keys(prop.propertyTaxes).sort().reverse();
      if (taxYrs.length > 0) annualTax = prop.propertyTaxes[taxYrs[0]];
    }
    // Resolve assessed value from taxAssessments
    let assessedValue = prop.assessedValue || null;
    if (!assessedValue && prop.taxAssessments) {
      const assYrs = Object.keys(prop.taxAssessments).sort().reverse();
      if (assYrs.length > 0) assessedValue = prop.taxAssessments[assYrs[0]]?.value || null;
    }
    // Pre-populate Property Details fields from Rentcast
    if (prop.bedrooms != null)    a.beds            = prop.bedrooms;
    if (prop.bathrooms != null)   a.baths           = prop.bathrooms;
    if (prop.yearBuilt != null)   a.yearBuilt       = prop.yearBuilt;
    if (prop.squareFootage != null) a.sqftTotal     = prop.squareFootage;
    if (prop.lotSize != null)     a.lotSize         = prop.lotSize;
    if (annualTax != null) { a.annualPropertyTax = Math.round(annualTax); a.expenses = a.expenses||{}; a.expenses.propertyTax = Math.round(annualTax); if(!a.expenseModes) a.expenseModes={}; a.expenseModes.propertyTax = "value"; }
    a.rentcastData = {
      fetchedAt: new Date().toLocaleDateString(),
      bedsPerUnit: preview.bedsPerUnit || null,
      bedrooms: prop.bedrooms,
      bathrooms: prop.bathrooms,
      squareFootage: prop.squareFootage,
      lotSize: prop.lotSize,
      yearBuilt: prop.yearBuilt,
      propertyType: prop.propertyType,
      assessedValue: assessedValue,
      annualTax: annualTax,
      hoaFee: prop.hoa?.fee || null,
      lastSalePrice: prop.lastSalePrice,
      lastSaleDate: prop.lastSaleDate,
      rentEstimate: rent?.rent,
      rentEstimateLow: rent?.rentRangeLow,
      rentEstimateHigh: rent?.rentRangeHigh };

    onChange(d);
    setPreview(null);
    setInput('');
    setOpen(false);

    // Async: fetch FEMA flood zone and update deal
    const addrForFlood = d.address || preview.parsedAddr;
    if (addrForFlood) {
      getFloodZoneForAddress(addrForFlood).then(zone => {
        if (zone) {
          const upd2 = JSON.parse(JSON.stringify(d));
          upd2.assumptions.floodZone = zone;
          onChange(upd2);
        }
      }).catch(() => {/* silent */});
    }
  };

  const pv = preview;
  const rc = pv?.prop;
  const rv = pv?.rent;

  return (
    <div style={{marginBottom:20,border:'2px solid var(--accent)',borderRadius:10,overflow:'hidden'}}>
      <div onClick={()=>setOpen(v=>!v)} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',background:'var(--accent)',cursor:'pointer',userSelect:'none'}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={{fontSize:16}}>🔍</span>
          <span style={{fontWeight:800,fontSize:13,color:'#fff',letterSpacing:'0.04em'}}>AUTO-FILL FROM LISTING URL OR ADDRESS</span>
        </div>
        <span style={{color:'#fff',fontSize:12,opacity:0.8}}>{open ? '▲ collapse' : '▼ expand'}</span>
      </div>
      {open && (
        <div style={{padding:14,background:'var(--card)'}}>
          <div style={{fontSize:12,color:'var(--muted)',marginBottom:10}}>
            Paste a Zillow, Redfin, or Realtor.com listing URL — or type an address directly. Powered by Rentcast.
          </div>
          <div style={{display:'flex',gap:8,flexWrap:isMobile?'wrap':'nowrap'}}>
            <input
              value={input}
              onChange={e=>{setInput(e.target.value);setError('');}}
              onKeyDown={e=>e.key==='Enter'&&doLookup()}
              placeholder="https://www.zillow.com/homedetails/... or 123 Main St, Chicago IL 60601"
              style={{flex:1,background:'var(--input-bg)',border:'1px solid var(--border)',borderRadius:6,padding:'9px 12px',color:'var(--text)',fontSize:13,minWidth:0}}
            />
            <button
              onClick={doLookup}
              disabled={loading||!input.trim()}
              style={{background:loading?'var(--muted)':'var(--accent)',color:'#fff',border:'none',borderRadius:6,padding:'9px 18px',fontWeight:700,fontSize:13,cursor:loading?'not-allowed':'pointer',whiteSpace:'nowrap',flexShrink:0}}
            >
              {loading ? '⏳ Looking up…' : '🔍 Look Up'}
            </button>
          </div>

          {error && (
            <div style={{marginTop:10,padding:'8px 12px',background:'#FEE2E2',borderRadius:6,color:'#991B1B',fontSize:12}}>
              ⚠️ {error}
            </div>
          )}

          {!RENTCAST_KEY && (
            <div style={{marginTop:10,padding:'8px 12px',background:'#FEF3C7',borderRadius:6,color:'#92400E',fontSize:12}}>
              ⚠️ No API key set. Get a free key at <a href="https://app.rentcast.io/app/api" target="_blank" rel="noreferrer" style={{color:'#92400E',fontWeight:700}}>rentcast.io/app/api</a>, then paste it into the <code>RENTCAST_KEY</code> constant in this file.
            </div>
          )}

          {pv && (
            <div style={{marginTop:14,border:'1px solid var(--border)',borderRadius:8,overflow:'hidden'}}>
              <div style={{background:'var(--table-head)',padding:'8px 12px',fontWeight:800,fontSize:12,color:'var(--accent)',letterSpacing:'0.06em'}}>
                📋 FOUND — REVIEW BEFORE APPLYING
              </div>
              <div style={{padding:12,display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:'6px 16px'}}>
                {[
                  ['Address', rc?.formattedAddress || pv.parsedAddr],
                  ['Property Type', rc?.propertyType || '—'],
                  ['Bedrooms / Baths', rc ? `${rc.bedrooms||'?'} bed / ${rc.bathrooms||'?'} bath` : '—'],
                  ['Sq Footage', rc?.squareFootage ? rc.squareFootage.toLocaleString()+' sq ft' : '—'],
                  ['Year Built', rc?.yearBuilt || '—'],
                  ['Assessed Value', rc?.assessedValue ? '$'+Math.round(rc.assessedValue).toLocaleString() : '—'],
                  ['Est. Annual Tax', rc?.propertyTaxes ? (()=>{const yrs=Object.keys(rc.propertyTaxes).sort().reverse();return yrs.length?'$'+Math.round(rc.propertyTaxes[yrs[0]]||0).toLocaleString():'—';})() : '—'],
                  ['Assessed Value', rc?.taxAssessments ? (()=>{const yrs=Object.keys(rc.taxAssessments).sort().reverse();return yrs.length?'$'+Math.round(rc.taxAssessments[yrs[0]].value||0).toLocaleString():'—';})() : '—'],
                  ['Rent Est. (whole property)', rv?.rent ? '$'+Math.round(rv.rent).toLocaleString()+'/mo' : '—'],
                  ['Rent Range', rv ? `$${Math.round(rv.rentRangeLow||0).toLocaleString()} – $${Math.round(rv.rentRangeHigh||0).toLocaleString()}/mo` : '—'],
                  ['Rent Est. (per unit / '+( pv.bedsPerUnit||2)+'br)', (pv.rentByBeds&&pv.rentByBeds[pv.bedsPerUnit||2]) ? '$'+Math.round(pv.rentByBeds[pv.bedsPerUnit||2].rent||0).toLocaleString()+'/mo' : '—'],
                ].map(([label,val])=>(
                  <div key={label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'4px 0',borderBottom:'1px solid var(--border-faint)'}}>
                    <span style={{fontSize:12,color:'var(--muted)',fontWeight:600}}>{label}</span>
                    <span style={{fontSize:12,fontWeight:700,color:'var(--text)',textAlign:'right',maxWidth:'55%'}}>{val||'—'}</span>
                  </div>
                ))}
              </div>
              <div style={{padding:'6px 12px',background:'#DBEAFE',fontSize:11,color:'#1E40AF'}}>
                ✏️ <strong>What will be applied:</strong> Address · Property Tax · Rent per unit (all units) · Sq ft / Year Built stored as reference. You can override any values after applying.
              </div>
              <div style={{display:'flex',gap:8,padding:12}}>
                <button onClick={applyPreview} style={{flex:1,background:'#10B981',color:'#fff',border:'none',borderRadius:6,padding:'9px 0',fontWeight:700,fontSize:13,cursor:'pointer'}}>
                  ✅ Apply to Deal
                </button>
                <button onClick={()=>setPreview(null)} style={{flex:1,background:'var(--card)',color:'var(--muted)',border:'1px solid var(--border)',borderRadius:6,padding:'9px 0',fontWeight:700,fontSize:13,cursor:'pointer'}}>
                  ✕ Discard
                </button>
              </div>
            </div>
          )}

          {deal.assumptions.rentcastData && !pv && (
            <div style={{marginTop:10,fontSize:11,color:'var(--muted)',display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
              <span>✅ Last fetched: {deal.assumptions.rentcastData.fetchedAt}</span>
              {deal.assumptions.rentcastData.squareFootage && <span>· {deal.assumptions.rentcastData.squareFootage.toLocaleString()} sq ft</span>}
              {deal.assumptions.rentcastData.yearBuilt && <span>· Built {deal.assumptions.rentcastData.yearBuilt}</span>}
              {deal.assumptions.rentcastData.propertyType && <span>· {deal.assumptions.rentcastData.propertyType}</span>}
            </div>
          )}
          {deal.assumptions.floodZone && !pv && (() => {
            const fzi = floodZoneInfo(deal.assumptions.floodZone);
            if (!fzi) return null;
            return (
              <div style={{marginTop:8,display:'inline-flex',alignItems:'center',gap:6,padding:'5px 10px',borderRadius:100,background:fzi.bg,border:`1px solid ${fzi.color}55`,fontSize:11,fontWeight:700,color:fzi.color}}>
                {fzi.risk==='critical'?'🌊':fzi.risk==='high'?'⚠️':fzi.risk==='low'?'✅':'ℹ️'} FEMA {fzi.label}
                <span style={{fontWeight:400,color:'var(--muted)',fontSize:10}}>· {fzi.desc}</span>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

function AssumptionsTab({deal,onChange}){
  const a=deal.assumptions;
  const isMobile=useIsMobile();
  const upd=(path,val)=>{const d=JSON.parse(JSON.stringify(deal));const parts=path.split(".");let obj=d.assumptions;for(let i=0;i<parts.length-1;i++){if(obj[parts[i]]==null||typeof obj[parts[i]]!=="object")obj[parts[i]]={};obj=obj[parts[i]];}obj[parts[parts.length-1]]=val;onChange(d);};
  const grossRentYear0=a.units.slice(0,a.numUnits).reduce((s,u)=>s+(+u.rent||0)*12,0);
  const expFields=[["propertyTax","propertyTaxPct","Property Tax"],["maintenance","maintenancePct","Maintenance"],["capex","capexPct","CapEx Reserve"],["propertyMgmt","propertyMgmtPct","Property Management"],["utilities","utilitiesPct","Utilities"]];
  return(<div style={{padding:"16px 0"}}>
    <PropertyLookupPanel deal={deal} onChange={onChange}/>
    <Section title="Property Details">
      {(()=>{
        // Comma-formatted integer inputs (sqft, lot)

        // Property Tax mode toggle (mirrors Expenses section)
        const ptMode = (a.expenseModes?.propertyTax) || "value";
        const isPtPct = ptMode === "pct";
        const togglePtMode = () => {
          const d = JSON.parse(JSON.stringify(deal));
          if (!d.assumptions.expenseModes) d.assumptions.expenseModes = {};
          d.assumptions.expenseModes.propertyTax = isPtPct ? "value" : "pct";
          onChange(d);
        };
        const ptVal = isPtPct ? (a.expenses?.propertyTaxPct||"") : (a.expenses?.propertyTax||"");
        const ptKey = isPtPct ? "expenses.propertyTaxPct" : "expenses.propertyTax";
        const ptAnnual = isPtPct
          ? null  // can't show annual without gross rent context
          : (+a.expenses?.propertyTax||0);
        return (
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 12px"}}>
            {/* Number of Units */}
            <div style={{marginBottom:10}}>
              <div style={{fontSize:10,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>Number of Units</div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <button onClick={()=>{if(a.numUnits>2)upd("numUnits",a.numUnits-1);}} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:100,width:28,height:28,cursor:"pointer",color:"var(--text)",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
                <span style={{fontWeight:700,fontSize:15,minWidth:20,textAlign:"center"}}>{a.numUnits}</span>
                <button onClick={()=>{if(a.numUnits<4)upd("numUnits",a.numUnits+1);}} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:100,width:28,height:28,cursor:"pointer",color:"var(--text)",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
              </div>
            </div>
            {/* Purchase Price */}
            <div style={{marginBottom:10}}>
              <div style={{fontSize:10,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>Purchase Price</div>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{color:"var(--muted)",fontSize:13}}>$</span>
                <input type="text" inputMode="numeric" value={
                    (() => { const v = +a.purchasePrice||0; return v ? v.toLocaleString() : ""; })()
                  } placeholder="450,000"
                  onFocus={e=>{const v=+a.purchasePrice||0;e.target.value=v?String(v):"";}}
                  onBlur={e=>{const v=+e.target.value.replace(/,/g,"")||0;e.target.value=v?v.toLocaleString():"";}}
                  onChange={e=>upd("purchasePrice",+e.target.value.replace(/,/g,"")||0)}
                  style={{...{width:"100%",padding:"7px 10px",borderRadius:7,fontSize:14,border:"1px solid var(--border)",background:"var(--input-bg)",color:"var(--text)",fontFamily:"inherit"},flex:1}}/>
              </div>
            </div>
            {/* Bedrooms */}
            <div style={{marginBottom:10}}>
              <div style={{fontSize:10,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>Bedrooms (total)</div>
              <input type="number" value={a.beds||""} placeholder="e.g. 4"
                onChange={e=>upd("beds",e.target.value)}
                style={{width:"100%",padding:"7px 10px",borderRadius:7,fontSize:14,border:"1px solid var(--border)",background:"var(--input-bg)",color:"var(--text)",fontFamily:"inherit"}}/>
            </div>
            {/* Bathrooms */}
            <div style={{marginBottom:10}}>
              <div style={{fontSize:10,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>Bathrooms (total)</div>
              <input type="number" value={a.baths||""} placeholder="e.g. 2"
                onChange={e=>upd("baths",e.target.value)}
                style={{width:"100%",padding:"7px 10px",borderRadius:7,fontSize:14,border:"1px solid var(--border)",background:"var(--input-bg)",color:"var(--text)",fontFamily:"inherit"}}/>
            </div>
            {/* Sq Footage — comma formatted */}
            <div style={{marginBottom:10}}>
              <div style={{fontSize:10,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>Sq. Footage (total)</div>
              <FmtInt value={a.sqftTotal} onChange={v=>upd("sqftTotal",v)} placeholder="e.g. 2,400" style={{width:"100%",padding:"7px 10px",borderRadius:7,fontSize:14,border:"1px solid var(--border)",background:"var(--input-bg)",color:"var(--text)",fontFamily:"inherit"}}/>
            </div>
            {/* Lot Size — comma formatted */}
            <div style={{marginBottom:10}}>
              <div style={{fontSize:10,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>Lot Size (sq ft)</div>
              <FmtInt value={a.lotSize} onChange={v=>upd("lotSize",v)} placeholder="e.g. 5,200" style={{width:"100%",padding:"7px 10px",borderRadius:7,fontSize:14,border:"1px solid var(--border)",background:"var(--input-bg)",color:"var(--text)",fontFamily:"inherit"}}/>
            </div>
            {/* Property Tax — mirrors Expenses section, spans full width */}
            <div style={{marginBottom:10,gridColumn:"1 / -1"}}>
              <div style={{fontSize:10,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>Property Tax ($/yr)</div>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{color:"var(--muted)",fontSize:13}}>$</span>
                <FmtInt
                  value={a.expenses?.propertyTax||0}
                  onChange={v=>{const d=JSON.parse(JSON.stringify(deal));d.assumptions.expenses=d.assumptions.expenses||{};d.assumptions.expenses.propertyTax=v;d.assumptions.expenseModes=d.assumptions.expenseModes||{};d.assumptions.expenseModes.propertyTax="value";onChange(d);}}
                  placeholder="e.g. 23,707"
                  style={{width:"100%",padding:"7px 10px",borderRadius:7,fontSize:14,border:"1px solid var(--border)",background:"var(--input-bg)",color:"var(--text)",fontFamily:"inherit",flex:1,maxWidth:200}}/>
              </div>
              {(+a.expenses?.propertyTax||0)>0 && (
                <div style={{fontSize:11,color:"var(--muted)",marginTop:3}}>
                  {FMT_USD(+a.expenses.propertyTax)}/yr · {FMT_USD((+a.expenses.propertyTax)/12)}/mo
                </div>
              )}
              {a.rentcastData?.annualTax && !ptAnnual &&
                <div style={{fontSize:11,color:"var(--muted)",marginTop:3}}>
                  Rentcast: ${(+a.rentcastData.annualTax).toLocaleString()}/yr
                  <button onClick={()=>{const d=JSON.parse(JSON.stringify(deal));d.assumptions.expenses=d.assumptions.expenses||{};d.assumptions.expenses.propertyTax=Math.round(a.rentcastData.annualTax);d.assumptions.expenseModes=d.assumptions.expenseModes||{};d.assumptions.expenseModes.propertyTax="value";onChange(d);}}
                    style={{marginLeft:6,fontSize:11,color:"var(--accent)",background:"none",border:"none",cursor:"pointer",padding:0,fontFamily:"inherit"}}>
                    Use this
                  </button>
                </div>
              }
            </div>
            {/* Expected Close Date — bottom left */}
            <div style={{marginBottom:10}}>
              <div style={{fontSize:10,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>Expected Close Date</div>
              <input type="date" value={a.expectedCloseDate||""}
                onChange={e=>upd("expectedCloseDate",e.target.value)}
                style={{...{width:"100%",padding:"7px 10px",borderRadius:7,fontSize:14,border:"1px solid var(--border)",background:"var(--input-bg)",color:"var(--text)",fontFamily:"inherit"},colorScheme:"light dark"}}/>
            </div>
            {/* Showing Date & Time */}
            <div style={{marginBottom:10}}>
              <div style={{fontSize:10,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>Showing Date & Time</div>
              <div style={{display:"flex",gap:8}}>
                <input type="date" value={deal.showingDate||""}
                  onChange={e=>{const d=JSON.parse(JSON.stringify(deal));d.showingDate=e.target.value;onChange(d);}}
                  style={{...{flex:1,padding:"7px 10px",borderRadius:7,fontSize:14,border:"1px solid var(--border)",background:"var(--input-bg)",color:"var(--text)",fontFamily:"inherit"},colorScheme:"light dark"}}/>
                <input type="time" value={deal.showingTime||""}
                  onChange={e=>{const d=JSON.parse(JSON.stringify(deal));d.showingTime=e.target.value;onChange(d);}}
                  style={{...{width:110,padding:"7px 10px",borderRadius:7,fontSize:14,border:"1px solid var(--border)",background:"var(--input-bg)",color:"var(--text)",fontFamily:"inherit"},colorScheme:"light dark"}}/>
              </div>
            </div>
            {/* Year Built — bottom right */}
            <div style={{marginBottom:10}}>
              <div style={{fontSize:10,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>Year Built</div>
              <input type="number" value={a.yearBuilt||""} placeholder="e.g. 1985"
                onChange={e=>upd("yearBuilt",e.target.value)}
                style={{width:"100%",padding:"7px 10px",borderRadius:7,fontSize:14,border:"1px solid var(--border)",background:"var(--input-bg)",color:"var(--text)",fontFamily:"inherit"}}/>
            </div>
          </div>
        );
      })()}
      {a.rentcastData && (
        <div style={{fontSize:11,color:"var(--muted)",marginTop:4}}>
          ℹ️ Fields pre-filled from Rentcast data fetched {a.rentcastData.fetchedAt}
        </div>
      )}
    </Section>
    <Section title="Financing">
      {(()=>{
        const pp=+a.purchasePrice||0;
        const dpPct=(+a.downPaymentPct||25)/100;
        const dp=pp>0?pp*dpPct:(+a.downPaymentDollar||0);
        const naturalLoan=Math.max(0, pp-dp-(+a.sellerConcessions||0));
        const loanLimit=+a.loanLimit||0;
        const loanAmt=loanLimit>0?Math.min(naturalLoan,loanLimit):naturalLoan;
        const loanCapActive=loanLimit>0&&naturalLoan>loanLimit;
        const extraDownNeeded=loanCapActive?naturalLoan-loanLimit:0;
        const rate=(+a.interestRate||0)/100/12;
        const n=(+a.amortYears||30)*12;
        const pi=loanAmt>0&&rate>0?loanAmt*(rate*Math.pow(1+rate,n))/(Math.pow(1+rate,n)-1):loanAmt/n;
        // Property tax: use dollar value directly, or % of gross rent yr0 estimate
        const ptMode=(a.expenseModes?.propertyTax)||"value";
        const grossRentEst=a.units.slice(0,a.numUnits).reduce((s,u)=>s+(+(u.rent||u.listedRent)||0),0)*12;
        const annualPT=ptMode==="pct"?(grossRentEst*((+a.expenses?.propertyTaxPct||0)/100)):(+a.expenses?.propertyTax||0);
        const monthlyTax=annualPT/12;
        const ins=(+a.expenses?.insurance||0)/12;
        const pmi=+a.pmi||0;
        const piti=pi+monthlyTax+ins+pmi;
        return(<>
          <InputRow label="Interest Rate" value={a.interestRate} onChange={v=>upd("interestRate",v)} suffix="%"/>
          <InputRow label="Amortization" value={a.amortYears} onChange={v=>upd("amortYears",v)} suffix="yrs"/>
          {/* ── Down Payment + Loan Limit / Loan Amount — bidirectional ── */}
          {(()=>{
            const pp = +a.purchasePrice || 0;
            const dpPct = +a.downPaymentPct || 0;
            const dpDollar = pp > 0 ? Math.round(pp * dpPct / 100) : (+a.downPaymentDollar || 0);
            const natLoan = Math.max(0, pp - dpDollar - (+a.sellerConcessions||0));
            const loanLimitVal = +a.loanLimit || 0;
            const loanAmtVal = loanLimitVal > 0 ? Math.min(natLoan, loanLimitVal) : natLoan;
            const capActive = loanLimitVal > 0 && natLoan > loanLimitVal;
            const extraDP = capActive ? natLoan - loanLimitVal : 0;
            const inputSt = {flex:1,background:"var(--input-bg)",border:"1.5px solid var(--border)",borderRadius:10,padding:"8px 10px",fontSize:14,color:"var(--text)",fontFamily:"inherit",minWidth:0};
            const labelSt = {fontSize:10,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4,display:"block"};
            const dividerSt = {borderTop:"1px solid var(--border)",margin:"14px 0 12px"};
            return(
              <div style={{marginBottom:2}}>

                {/* — Loan Limit + Loan Amount — */}
                <div style={dividerSt}/>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  <div>
                    <label style={labelSt}>Loan Limit <span style={{fontWeight:400,textTransform:"none",fontSize:9}}>(optional cap)</span></label>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <span style={{color:"var(--muted)",fontSize:14,fontWeight:700,flexShrink:0}}>$</span>
                      <input type="text" inputMode="numeric"
                        value={loanLimitVal ? loanLimitVal.toLocaleString() : ""}
                        placeholder="e.g. 806,500"
                        onFocus={e=>{e.target.value=loanLimitVal?String(loanLimitVal):"";}}
                        onBlur={e=>{const v=+e.target.value.replace(/,/g,"")||0;e.target.value=v?v.toLocaleString():"";}}
                        onChange={e=>upd("loanLimit", +e.target.value.replace(/,/g,"")||0)}
                        style={{...inputSt, borderColor: loanLimitVal>0?"var(--accent)":"var(--border)"}}/>
                    </div>
                    {loanLimitVal>0&&<div style={{fontSize:10,color:"var(--muted)",marginTop:3}}>Conforming limit, FHA max, etc.</div>}
                  </div>
                  <div>
                    <label style={labelSt}>Loan Amount <span style={{fontWeight:400,textTransform:"none",fontSize:9}}>(calculated)</span></label>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <span style={{color:"var(--muted)",fontSize:14,fontWeight:700,flexShrink:0}}>$</span>
                      <div style={{...inputSt,
                        background: capActive?"#fef3c7":"var(--input-bg)",
                        border: capActive?"1.5px solid #D97706":"1.5px solid var(--border)",
                        color: capActive?"#92400e":"var(--text)",
                        fontWeight:700,
                        display:"flex", alignItems:"center",
                        userSelect:"none", cursor:"default"}}>
                        {loanAmtVal>0 ? loanAmtVal.toLocaleString() : <span style={{color:"var(--muted)",fontWeight:400}}>—</span>}
                      </div>
                    </div>
                    {capActive&&<div style={{fontSize:10,color:"#D97706",marginTop:3,fontWeight:600}}>⚠ Capped by loan limit</div>}
                  </div>
                </div>

                {/* — Down Payment — */}
                <div style={{fontSize:13,fontWeight:700,color:"var(--text)",marginBottom:6}}>Down Payment</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  <div>
                    <label style={labelSt}>Percentage</label>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <input type="number" min="0" max="100" step="0.5"
                        value={dpPct||""}
                        placeholder="25"
                        onChange={e=>{
                          const pct = +e.target.value;
                          const d=JSON.parse(JSON.stringify(deal));
                          d.assumptions.downPaymentPct=pct;
                          if(pp>0) d.assumptions.downPaymentDollar=Math.round(pp*pct/100);
                          onChange(d);
                        }}
                        style={inputSt}/>
                      <span style={{color:"var(--muted)",fontSize:14,fontWeight:700,flexShrink:0}}>%</span>
                    </div>
                  </div>
                  <div>
                    <label style={labelSt}>Cash Amount</label>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <span style={{color:"var(--muted)",fontSize:14,fontWeight:700,flexShrink:0}}>$</span>
                      <input type="number" min="0" step="1000"
                        value={dpDollar||""}
                        placeholder={pp>0?Math.round(pp*0.25):""}
                        onChange={e=>{
                          const dollar = +e.target.value;
                          const d=JSON.parse(JSON.stringify(deal));
                          d.assumptions.downPaymentDollar=dollar;
                          if(pp>0) d.assumptions.downPaymentPct=Math.round(dollar/pp*1000)/10;
                          onChange(d);
                        }}
                        style={inputSt}/>
                    </div>
                  </div>
                </div>

                {/* — Summary row — */}
                {pp>0 && dpPct>0 && (
                  <div style={{marginTop:10,padding:"10px 12px",background:"var(--bg2, var(--bg))",borderRadius:10,border:"1px solid var(--border)"}}>
                    <div style={{display:"flex",gap:16,flexWrap:"wrap",fontSize:11,color:"var(--muted)"}}>
                      <span>Loan: <strong style={{color:capActive?"#D97706":"var(--text)"}}>{FMT_USD(loanAmtVal)}</strong></span>
                      <span>LTV: <strong style={{color:"var(--text)"}}>{pp>0?(loanAmtVal/pp*100).toFixed(1):0}%</strong></span>
                      <span>Down: <strong style={{color:"var(--text)"}}>{FMT_USD(dpDollar)}</strong></span>
                      {capActive && <span style={{color:"#D97706",fontWeight:700}}>+{FMT_USD(extraDP)} extra down needed</span>}
                    </div>
                  </div>
                )}

              </div>
            );
          })()}
          <InputRow label="Seller Concessions" value={a.sellerConcessions} onChange={v=>upd("sellerConcessions",v)} prefix="$"/>
          <InputRow label="Property Insurance ($/yr)" value={a.expenses?.insurance} onChange={v=>upd("expenses.insurance",v)} prefix="$"/>
          <InputRow label="PMI ($/mo)" value={a.pmi} onChange={v=>upd("pmi",+v)} prefix="$"/>
          {piti>0&&<div style={{marginTop:8,padding:"14px 16px",background:"var(--accent-soft)",border:"1.5px solid var(--accent)",borderRadius:12,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
            <div>
              <div style={{fontSize:10,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:2}}>Est. Monthly PITI Payment</div>
              <div style={{fontFamily:"'Fraunces',serif",fontSize:28,fontWeight:900,color:"var(--accent)",letterSpacing:"-0.5px"}}>{FMT_USD(piti)}<span style={{fontSize:13,fontWeight:500,color:"var(--muted)",fontFamily:"'DM Sans',sans-serif"}}>/mo</span></div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"4px 16px",fontSize:11,color:"var(--muted)"}}>
              <span>P&I: <strong style={{color:"var(--text)"}}>{FMT_USD(pi)}</strong></span>
              <span>Tax: <strong style={{color:"var(--text)"}}>{FMT_USD(monthlyTax)}</strong></span>
              <span>Insurance: <strong style={{color:"var(--text)"}}>{FMT_USD(ins)}</strong></span>
              {pmi>0&&<span>PMI: <strong style={{color:"var(--text)"}}>{FMT_USD(pmi)}</strong></span>}
            </div>
          </div>}
        </>);
      })()}
    </Section>
    <Section title={"Units & Rent ("+a.numUnits+" units)"} action={<div style={{display:"flex",gap:8}}><button onClick={()=>{if(a.numUnits>2)upd("numUnits",a.numUnits-1);}} style={btnSm}>−</button><button onClick={()=>{if(a.numUnits<4)upd("numUnits",a.numUnits+1);}} style={btnSm}>+</button></div>}>
      {Array.from({length:a.numUnits}).map((_,i)=>{
        const u=a.units[i]||{};
        const effRent=+u.rent||+u.listedRent||0;
        return(<div key={i} style={{marginBottom:14,padding:12,background:"var(--row-sub)",borderRadius:8,border:"1px solid var(--border-faint)"}}>
          <div style={{fontWeight:800,fontSize:12,color:"var(--accent)",letterSpacing:"0.06em",marginBottom:8,textTransform:"uppercase"}}>Unit {i+1}</div>
          {/* Listed Rent */}
          <div style={{display:"grid",gridTemplateColumns:"160px 1fr",gap:6,alignItems:"center",marginBottom:6}}>
            <label style={{fontSize:12,color:"var(--muted)",fontWeight:600}}>Listed Rent</label>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              <span style={{color:"var(--muted)",fontSize:13}}>$</span>
              <input type="text" inputMode="numeric"
                value={(+u.listedRent||0) ? (+u.listedRent).toLocaleString() : ""}
                placeholder="0"
                onFocus={e=>{const v=+u.listedRent||0;e.target.value=v?String(v):"";}}
                onBlur={e=>{const v=+e.target.value.replace(/,/g,"")||0;e.target.value=v?v.toLocaleString():"";}}
                onChange={e=>{const d=JSON.parse(JSON.stringify(deal));d.assumptions.units[i]={...d.assumptions.units[i],listedRent:+e.target.value.replace(/,/g,"")};onChange(d);}}
                style={{...iSty,flex:1}}/>
              <span style={{fontSize:11,color:"var(--muted)"}}>/mo</span>
            </div>
          </div>
          {/* Rentcast Rent — read-only, only shown if populated */}
          {u.rentcastRent>0&&(<div style={{display:"grid",gridTemplateColumns:"160px 1fr",gap:6,alignItems:"center",marginBottom:6}}>
            <label style={{fontSize:12,color:"#6366F1",fontWeight:600}}>Rentcast Est.</label>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              <span style={{fontSize:13,fontWeight:700,color:"#6366F1"}}>{FMT_USD(u.rentcastRent)}/mo</span>
              {u.rentcastRentRange&&<span style={{fontSize:11,color:"var(--muted)"}}>({u.rentcastRentRange})</span>}
            </div>
          </div>)}
          {/* Adjusted Rent */}
          <div style={{display:"grid",gridTemplateColumns:"160px 1fr",gap:6,alignItems:"center"}}>
            <label style={{fontSize:12,color:"var(--text)",fontWeight:700}}>Adjusted Rent <span style={{fontSize:10,color:"var(--muted)",fontWeight:400}}>(used in model)</span></label>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              <span style={{color:"var(--muted)",fontSize:13}}>$</span>
              <input type="text" inputMode="numeric"
                value={(+u.rent||0) ? (+u.rent).toLocaleString() : ""}
                placeholder={effRent ? (+effRent).toLocaleString() : "0"}
                onFocus={e=>{const v=+u.rent||0;e.target.value=v?String(v):"";}}
                onBlur={e=>{const v=+e.target.value.replace(/,/g,"")||0;e.target.value=v?v.toLocaleString():"";}}
                onChange={e=>{const d=JSON.parse(JSON.stringify(deal));d.assumptions.units[i]={...d.assumptions.units[i],rent:+e.target.value.replace(/,/g,"")};onChange(d);}}
                style={{...iSty,flex:1,borderColor:"var(--accent)"}}/>
              <span style={{fontSize:11,color:"var(--muted)"}}>/mo</span>
            </div>
          </div>
          <div style={{fontSize:11,color:"var(--muted)",marginTop:4}}>
            {u.rent>0?"Using Adjusted Rent":u.listedRent>0?"No Adjusted Rent set — using Listed Rent":"No rent set"}
          </div>
        </div>);
      })}
      <div style={{fontSize:13,color:"var(--accent)",fontWeight:700,padding:"6px 0"}}>Blended Monthly Avg: {FMT_USD(a.units.slice(0,a.numUnits).reduce((s,u)=>s+(+(u.rent||u.listedRent)||0),0)/a.numUnits)} / unit</div>
      <InputRow label="Vacancy Rate" value={a.vacancyRate} onChange={v=>upd("vacancyRate",v)} suffix="%"/>
    </Section>
    <Section title="Expenses" action={<label style={{fontSize:12,color:"var(--muted)",display:"flex",gap:6,alignItems:"center",cursor:"pointer"}}><input type="checkbox" checked={a.selfManage} onChange={e=>upd("selfManage",e.target.checked)}/> Self-manage</label>}>
      {expFields.map(([vk,pk,lbl])=>{
        // Property Tax is edited in Property Details — show read-only here
        if(vk==="propertyTax"){
          const ptVal = +a.expenses?.propertyTax||0;
          const roLabel = {fontSize:12,fontWeight:600,color:"var(--muted)"};
          const roVal = {fontSize:13,fontWeight:700,color:"var(--text)"};
          if(isMobile){return(
            <div key={vk} style={{padding:"10px 0",borderBottom:"1px solid var(--border-faint)"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={roLabel}>Property Tax <span style={{fontSize:10,fontWeight:400,fontStyle:"italic"}}>(set in Property Details)</span></span>
                <span style={roVal}>{ptVal>0?FMT_USD(ptVal)+"/yr":"—"}</span>
              </div>
            </div>
          );}
          return(
            <div key={vk} style={{display:"flex",alignItems:"center",padding:"9px 0",borderBottom:"1px solid var(--border-faint)"}}>
              <span style={{...roLabel,flex:"0 0 160px"}}>Property Tax <span style={{fontSize:10,fontWeight:400,fontStyle:"italic"}}>(set in Property Details)</span></span>
              <span style={{...roVal,marginLeft:"auto"}}>{ptVal>0?FMT_USD(ptVal)+"/yr":"—"}</span>
            </div>
          );
        }
        const modes=a.expenseModes||{}, isItemPct=modes[vk]==="pct";
        const toggleMode=()=>{const d=JSON.parse(JSON.stringify(deal));if(!d.assumptions.expenseModes)d.assumptions.expenseModes={};d.assumptions.expenseModes[vk]=isItemPct?"value":"pct";onChange(d);};
        const modeToggle=(<div style={{display:"flex",background:"var(--input-bg)",borderRadius:4,border:"1px solid var(--border)",overflow:"hidden",flexShrink:0}}>{[["value","$"],["pct","%"]].map(([k,l2])=>(<button key={k} onClick={toggleMode} style={{padding:"3px 9px",fontSize:12,fontWeight:700,border:"none",cursor:"pointer",background:(modes[vk]||"value")===k?"var(--accent)":"transparent",color:(modes[vk]||"value")===k?"#fff":"var(--muted)"}}>{l2}</button>))}</div>);
        const expKey=isItemPct?pk:vk;
        const expRawVal=isItemPct?a.expenses[pk]:a.expenses[vk];
        if(isMobile){
          return(<ExpenseInputRow key={vk} lbl={lbl} modeToggle={modeToggle} isItemPct={isItemPct} rawVal={expRawVal} onChange={v=>upd(`expenses.${expKey}`,v)} mobile/>);
        }
        return(<ExpenseInputRow key={vk} lbl={lbl} modeToggle={modeToggle} isItemPct={isItemPct} rawVal={expRawVal} onChange={v=>upd(`expenses.${expKey}`,v)}/>);
      })}
      <div style={{fontSize:12,color:"var(--muted)",padding:"6px 0"}}>Year 1 computed total: <strong style={{color:"var(--text)"}}>{FMT_USD(resolveExpenses(a,grossRentYear0).total)}</strong></div>
    </Section>
    {(()=>{
      const [ccOpen, setCcOpen] = React.useState(false);
      // Compute all closing costs including optional insurance upfront
      const insUpfrontAmt = a.insuranceUpfront ? (+a.expenses?.insurance||0) : 0;
      const ccLineTotal = Object.values(a.closingCosts||{}).reduce((s,v)=>s+(+v||0),0);
      const ccTotal = ccLineTotal + insUpfrontAmt;
      // Down payment (mirrors Financing section logic)
      const ccPP = +a.purchasePrice||0;
      const ccDpPct = (+a.downPaymentPct||25)/100;
      const ccDp = ccPP>0 ? ccPP*ccDpPct : (+a.downPaymentDollar||0);
      const totalDueAtClosing = ccTotal + ccDp;
      const roSt = {
        flex:1, background:"var(--bg)", border:"1.5px solid var(--border)",
        borderRadius:10, padding:"8px 12px", fontSize:14, fontWeight:700,
        color:"var(--text)", display:"flex", alignItems:"center",
        userSelect:"none", cursor:"default"
      };
      const CC_FIELDS = [
        ["title","Title"],["transferTax","Transfer Tax"],["inspection","Inspection"],
        ["attorney","Attorney"],["lenderFees","Lender Fees"],
        ["discountPoints","Discount Points"],["appraisal","Appraisal"],["creditReport","Credit Report"]
      ];
      return (
        <div style={{marginBottom:24}}>
          {/* ── Collapsible header ── */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
            borderBottom:"2px solid var(--accent)",paddingBottom:6,marginBottom:ccOpen?12:0,cursor:"pointer"}}
            onClick={()=>setCcOpen(v=>!v)}>
            <div style={{fontSize:12,fontWeight:800,letterSpacing:"0.1em",color:"var(--accent)",textTransform:"uppercase"}}>
              Closing Costs <span style={{fontWeight:400,color:"var(--muted)",fontSize:11,textTransform:"none",letterSpacing:0}}>({FMT_USD(ccTotal)} total · {FMT_USD(totalDueAtClosing)} due at closing)</span>
            </div>
            <div style={{fontSize:14,color:"var(--muted)",transform:ccOpen?"rotate(180deg)":"none",transition:"transform 0.2s"}}>▾</div>
          </div>
          {ccOpen && (
            <div>
              {/* ── Editable line items ── */}
              {CC_FIELDS.map(([k,lbl])=>(
                <InputRow key={k} label={lbl} value={a.closingCosts[k]} onChange={v=>upd(`closingCosts.${k}`,v)} prefix="$"/>
              ))}

              {/* ── 1 Year Insurance Upfront checkbox ── */}
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                padding:"10px 0",borderTop:"1px solid var(--border)",marginTop:4}}>
                <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13,color:"var(--text)",fontWeight:500}}>
                  <input type="checkbox" checked={!!a.insuranceUpfront}
                    onChange={e=>upd("insuranceUpfront", e.target.checked)}
                    style={{width:15,height:15,accentColor:"var(--accent)",cursor:"pointer"}}/>
                  1 Year of Insurance Upfront
                </label>
                <span style={{fontSize:13,fontWeight:700,color:a.insuranceUpfront?"var(--accent)":"var(--muted)"}}>
                  {a.insuranceUpfront ? FMT_USD(insUpfrontAmt) : "—"}
                </span>
              </div>
              {a.insuranceUpfront && insUpfrontAmt===0 && (
                <div style={{fontSize:11,color:"#D97706",marginBottom:8,paddingLeft:2}}>
                  ⚠ Set Property Insurance ($/yr) in Financing to populate this value.
                </div>
              )}

              {/* ── Summary rows ── */}
              <div style={{marginTop:12,borderTop:"2px solid var(--border)",paddingTop:12,display:"flex",flexDirection:"column",gap:8}}>

                {/* Total Closing Costs */}
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
                  <span style={{fontSize:12,fontWeight:700,color:"var(--text)",whiteSpace:"nowrap"}}>Total Closing Costs</span>
                  <div style={{...roSt,maxWidth:160,justifyContent:"flex-end",
                    background:"var(--accent-soft)",border:"1.5px solid var(--accent)",
                    color:"var(--accent)",fontFamily:"'Fraunces',serif",fontSize:16,letterSpacing:"-0.3px"}}>
                    {FMT_USD(ccTotal)}
                  </div>
                </div>

                {/* Down Payment (read-only) */}
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
                  <span style={{fontSize:12,fontWeight:600,color:"var(--muted)",whiteSpace:"nowrap"}}>
                    Down Payment <span style={{fontSize:10,fontWeight:400}}>(from Financing)</span>
                  </span>
                  <div style={{...roSt,maxWidth:160,justifyContent:"flex-end",color:"var(--muted)"}}>
                    {ccDp>0 ? FMT_USD(ccDp) : <span style={{color:"var(--muted)",fontWeight:400,fontSize:12}}>Set in Financing</span>}
                  </div>
                </div>

                {/* Total Due at Closing */}
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,
                  background:"var(--card)",borderRadius:12,padding:"12px 14px",
                  border:"2px solid var(--accent)",marginTop:2}}>
                  <div>
                    <div style={{fontSize:10,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:2}}>Total Due at Closing</div>
                    <div style={{fontSize:11,color:"var(--muted)"}}>Closing Costs + Down Payment</div>
                  </div>
                  <div style={{fontFamily:"'Fraunces',serif",fontSize:26,fontWeight:900,
                    color:"var(--accent)",letterSpacing:"-0.5px",whiteSpace:"nowrap"}}>
                    {FMT_USD(totalDueAtClosing)}
                  </div>
                </div>

              </div>
            </div>
          )}
        </div>
      );
    })()}
    <div data-tour="advanced-features">
    <Section title="Owner Occupancy" action={<label style={{fontSize:12,color:"var(--muted)",display:"flex",gap:8,alignItems:"center",cursor:"pointer"}}><input type="checkbox" checked={!!a.ownerOccupied} onChange={e=>upd("ownerOccupied",e.target.checked)}/> Enable</label>}>
      {a.ownerOccupied ? (<>
        <div style={{display:isMobile?"block":"grid",gridTemplateColumns:"200px 1fr 1fr",gap:8,alignItems:"center",padding:"5px 0",borderBottom:"1px solid var(--border-faint)"}}>
          <label style={{fontSize:13,color:"var(--muted)",fontWeight:500,display:"block",marginBottom:isMobile?4:0}}>Your Unit</label>
          <select value={a.ownerUnit||0} onChange={e=>upd("ownerUnit",+e.target.value)} style={{...iSty,gridColumn:"span 2"}}>
            {Array.from({length:a.numUnits}).map((_,i)=><option key={i} value={i}>Unit {i+1}{a.units[i]?.rent>0?` — ${FMT_USD(+a.units[i].rent)}/mo`:""}</option>)}
          </select>
        </div>
        <InputRow label="Occupancy Duration" value={a.ownerOccupancyYears||2} onChange={v=>upd("ownerOccupancyYears",v)} suffix="yrs"/>
        <InputRow label="Alternative Rent" value={a.alternativeRent||0} onChange={v=>upd("alternativeRent",v)} prefix="$" suffix="/mo"/>
        <InputRow label="Owner Use Utilities" value={a.ownerUseUtilities||0} onChange={v=>upd("ownerUseUtilities",v)} prefix="$" suffix="/yr"/>
        <div style={{fontSize:12,color:"var(--muted)",padding:"6px 0",borderTop:"1px solid var(--border-faint)",marginTop:4}}>
          Rent foregone Yr 1–{a.ownerOccupancyYears||2}: <strong style={{color:"#f59e0b"}}>{FMT_USD((+a.units[Math.min(+a.ownerUnit||0,a.numUnits-1)]?.rent||0)*12)}/yr</strong> · Unit {(+a.ownerUnit||0)+1} rented at market rate from Year {(+a.ownerOccupancyYears||2)+1}
        </div>
      </>) : <div style={{fontSize:13,color:"var(--muted)",padding:"8px 0"}}>Enable to model living in one unit and not collecting rent during your occupancy period.</div>}
    </Section>
    <Section title="Growth & Exit">
      <InputRow label="Rent Growth" value={a.rentGrowth} onChange={v=>upd("rentGrowth",v)} suffix="%/yr"/>
      <InputRow label="Expense Growth" value={a.expenseGrowth} onChange={v=>upd("expenseGrowth",v)} suffix="%/yr"/>
      <InputRow label="Appreciation Rate" value={a.appreciationRate} onChange={v=>upd("appreciationRate",v)} suffix="%/yr"/>
      <InputRow label="Tax Bracket (MFJ)" value={a.taxBracket} onChange={v=>upd("taxBracket",v)} suffix="%"/>
    </Section>
    <Section title="Refinance Scenario" action={<label style={{fontSize:12,color:"var(--muted)",display:"flex",gap:8,alignItems:"center",cursor:"pointer"}}><input type="checkbox" checked={a.refi.enabled} onChange={e=>upd("refi.enabled",e.target.checked)}/> Enable</label>}>
      {a.refi.enabled?<><InputRow label="Refi Year" value={a.refi.year} onChange={v=>upd("refi.year",v)}/><InputRow label="New Rate" value={a.refi.newRate} onChange={v=>upd("refi.newRate",v)} suffix="%"/><InputRow label="New LTV" value={a.refi.newLTV} onChange={v=>upd("refi.newLTV",v)} suffix="%"/></>:<div style={{fontSize:13,color:"var(--muted)",padding:"8px 0"}}>Enable to model a cash-out refinance during the hold period.</div>}
    </Section>
    <Section title="Value Add" action={<label style={{fontSize:12,color:"var(--muted)",display:"flex",gap:8,alignItems:"center",cursor:"pointer"}}><input type="checkbox" checked={!!(a.valueAdd?.enabled)} onChange={e=>upd("valueAdd.enabled",e.target.checked)}/> Enable</label>}>
      {a.valueAdd?.enabled?<><InputRow label="Total Remodel Cost" value={a.valueAdd.reModelCost} onChange={v=>upd("valueAdd.reModelCost",v)} prefix="$"/><InputRow label="Rent Bump / Unit / Mo" value={a.valueAdd.rentBumpPerUnit} onChange={v=>upd("valueAdd.rentBumpPerUnit",v)} prefix="$"/><InputRow label="Units Renovated" value={a.valueAdd.unitsRenovated} onChange={v=>upd("valueAdd.unitsRenovated",Math.min(+v,a.numUnits))} suffix={"of "+a.numUnits}/><InputRow label="Completion Year" value={a.valueAdd.completionYear} onChange={v=>upd("valueAdd.completionYear",v)} suffix="yr"/><div style={{fontSize:12,color:"var(--muted)",padding:"6px 0",borderTop:"1px solid var(--border-faint)",marginTop:4}}>Annual rent lift: <strong style={{color:"var(--text)"}}>{FMT_USD((+a.valueAdd.rentBumpPerUnit||0)*Math.min(+a.valueAdd.unitsRenovated||0,a.numUnits)*12)}</strong> · Value implied via NOI/cap rate from Year {a.valueAdd.completionYear}</div></>:<div style={{fontSize:13,color:"var(--muted)",padding:"8px 0"}}>Enable to model remodeling costs and post-renovation rent uplift.</div>}
    </Section>
    {(()=>{
      const [taxOpen, setTaxOpen] = React.useState(false);
      const tax = a.tax || {};
      const taxEnabled = !!tax.enabled;
      const csEnabled = taxEnabled && !!tax.costSegEnabled;
      const pp2 = +a.purchasePrice || 0;
      const landAmt = pp2 * ((+tax.landValuePct||20)/100);
      const buildingAmt = pp2 - landAmt;
      const cs5Amt = buildingAmt * ((+tax.costSeg5YrPct||15)/100);
      const cs15Amt = buildingAmt * (Math.min(+tax.costSeg15YrPct||10, Math.max(0, 100-(+tax.costSeg5YrPct||15)))/100);
      const structAmt = buildingAmt - cs5Amt - cs15Amt;
      const summaryText = taxEnabled
        ? (csEnabled ? `Cost Seg · ${tax.bonusDepPct||100}% Bonus Dep` : `Land ${tax.landValuePct||20}% · No Cost Seg`)
        : 'Disabled — click to expand';
      return (
        <div style={{marginBottom:24}}>
          <div onClick={()=>setTaxOpen(v=>!v)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:"2px solid var(--accent)",paddingBottom:6,marginBottom:taxOpen?12:0,cursor:"pointer"}}>
            <div style={{fontSize:12,fontWeight:800,letterSpacing:"0.1em",color:"var(--accent)",textTransform:"uppercase"}}>
              Advanced Tax Modeling
              <span style={{fontWeight:400,color:"var(--muted)",fontSize:11,textTransform:"none",letterSpacing:0,marginLeft:6}}>({summaryText})</span>
            </div>
            <div style={{fontSize:14,color:"var(--muted)",transform:taxOpen?"rotate(180deg)":"none",transition:"transform 0.2s"}}>▾</div>
          </div>
          {taxOpen && (
            <div>
              {/* Enable toggle */}
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderBottom:"1px solid var(--border-faint)"}}>
                <div>
                  <div style={{fontSize:13,fontWeight:700,color:"var(--text)"}}>Enable Advanced Tax Modeling</div>
                  <div style={{fontSize:11,color:"var(--muted)",marginTop:2}}>Cost segregation, bonus depreciation, Section 179, and passive activity loss rules.</div>
                </div>
                <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",flexShrink:0,marginLeft:12}}>
                  <input type="checkbox" checked={taxEnabled} onChange={e=>upd("tax.enabled",e.target.checked)} style={{width:16,height:16,accentColor:"var(--accent)",cursor:"pointer"}}/>
                  <span style={{fontSize:13,fontWeight:700,color:taxEnabled?"var(--accent)":"var(--muted)"}}>{taxEnabled?"On":"Off"}</span>
                </label>
              </div>
              {!taxEnabled && (
                <div style={{fontSize:12,color:"var(--muted)",padding:"10px 0"}}>
                  Enable to model cost segregation, bonus depreciation (100% permanent under OBBBA), Section 179 expensing, and passive activity loss limitations. Results flow into the Cash Flow tab.
                </div>
              )}
              {taxEnabled && (<>
                {/* Core tax inputs */}
                <InputRow label="Land Value %" value={tax.landValuePct||20} onChange={v=>upd("tax.landValuePct",v)} suffix="% of purchase price"/>
                <InputRow label="Federal AGI" value={tax.agi||100000} onChange={v=>upd("tax.agi",v)} prefix="$"/>
                {/* PAL Status */}
                <div style={{display:isMobile?"block":"grid",gridTemplateColumns:"200px 1fr",gap:8,alignItems:"center",padding:"5px 0",borderBottom:"1px solid var(--border-faint)"}}>
                  <label style={{fontSize:13,color:"var(--muted)",fontWeight:500,display:"block",marginBottom:isMobile?4:0}}>Passive Activity Status</label>
                  <select value={tax.paStatus||'active_participant'} onChange={e=>upd("tax.paStatus",e.target.value)} style={{...iSty}}>
                    <option value="active_participant">Active Participant ($25k allowance)</option>
                    <option value="re_professional">RE Professional (unlimited deduction)</option>
                    <option value="passive">Passive Investor (no benefit)</option>
                  </select>
                </div>
                {(tax.paStatus||'active_participant')==='active_participant' && (
                  <div style={{fontSize:11,color:"var(--muted)",padding:"3px 0 8px",lineHeight:1.5}}>
                    $25k allowance phases out $1 for every $2 of AGI over $100k (fully phased at $150k AGI). Suspended losses carry forward to future years (not modeled).
                  </div>
                )}
                {tax.paStatus==='re_professional' && (
                  <div style={{fontSize:11,color:"var(--accent)",padding:"3px 0 8px"}}>
                    ✓ RE Professional: all rental losses deductible against ordinary income with no cap.
                  </div>
                )}
                {tax.paStatus==='passive' && (
                  <div style={{fontSize:11,color:"#D97706",padding:"3px 0 8px"}}>
                    ⚠ Passive: losses only offset passive income. Model assumes no other passive income; all excess losses carry forward.
                  </div>
                )}
                {/* Cost Segregation */}
                <div style={{marginTop:12,paddingTop:12,borderTop:"1px solid var(--border-faint)"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
                    <div>
                      <div style={{fontSize:13,fontWeight:700,color:"var(--text)"}}>Cost Segregation Study</div>
                      <div style={{fontSize:11,color:"var(--muted)"}}>Reclassify components to 5-yr and 15-yr schedules, then apply bonus depreciation.</div>
                    </div>
                    <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",flexShrink:0,marginLeft:12}}>
                      <input type="checkbox" checked={csEnabled} onChange={e=>upd("tax.costSegEnabled",e.target.checked)} style={{width:15,height:15,accentColor:"var(--accent)",cursor:"pointer"}}/>
                      <span style={{fontSize:13,fontWeight:700,color:csEnabled?"var(--accent)":"var(--muted)"}}>{csEnabled?"On":"Off"}</span>
                    </label>
                  </div>
                  {!csEnabled && (
                    <div style={{fontSize:11,color:"var(--muted)",padding:"4px 0 4px"}}>Enable to front-load depreciation via cost segregation + bonus dep (100% under OBBBA).</div>
                  )}
                  {csEnabled && (<>
                    {/* Cost Seg Study Fee — one-time Year 1 operating expense */}
                    <InputRow
                      label="Study Fee (Yr 1)"
                      value={tax.costSegFee||0}
                      onChange={v=>upd("tax.costSegFee",v)}
                      prefix="$"
                    />
                    <div style={{fontSize:11,color:"var(--muted)",padding:"2px 0 6px"}}>
                      One-time cost of the study. Flows into Year 1 operating expenses.
                    </div>
                    <InputRow label="5-yr Components" value={tax.costSeg5YrPct||15} onChange={v=>upd("tax.costSeg5YrPct",v)} suffix="% of building"/>
                    <InputRow label="15-yr Components" value={tax.costSeg15YrPct||10} onChange={v=>upd("tax.costSeg15YrPct",v)} suffix="% of building"/>
                    {/* Component breakdown display */}
                    {pp2>0 && (
                      <div style={{background:"var(--accent-soft)",border:"1px solid var(--border-faint)",borderRadius:8,padding:"8px 12px",marginTop:6,marginBottom:4}}>
                        <div style={{fontSize:10,fontWeight:800,color:"var(--accent)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Component Breakdown</div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"3px 16px",fontSize:11}}>
                          <span style={{color:"var(--muted)"}}>Land (excluded)</span><span style={{fontWeight:700,color:"var(--text)"}}>{FMT_USD(landAmt)}</span>
                          <span style={{color:"var(--muted)"}}>27.5-yr Structure</span><span style={{fontWeight:700,color:"var(--text)"}}>{FMT_USD(structAmt)}</span>
                          <span style={{color:"var(--muted)"}}>5-yr Personal Prop.</span><span style={{fontWeight:700,color:"var(--accent2)"}}>{FMT_USD(cs5Amt)}</span>
                          <span style={{color:"var(--muted)"}}>15-yr Land Improve.</span><span style={{fontWeight:700,color:"var(--accent2)"}}>{FMT_USD(cs15Amt)}</span>
                        </div>
                      </div>
                    )}
                    {/* Bonus Dep */}
                    <InputRow label="Bonus Dep. %" value={tax.bonusDepPct||100} onChange={v=>upd("tax.bonusDepPct",v)} suffix="% (Yr 1)"/>
                    <div style={{fontSize:11,color:"var(--muted)",padding:"2px 0 6px"}}>
                      Permanently 100% under OBBBA (signed July 4, 2025) for property placed in service after Jan. 19, 2025. Applies to 5-yr and 15-yr components only.
                    </div>
                    {/* Section 179 */}
                    <InputRow label="Section 179 (Yr 1)" value={tax.sec179Amount||0} onChange={v=>upd("tax.sec179Amount",v)} prefix="$"/>
                    <div style={{fontSize:11,color:"var(--muted)",padding:"2px 0 4px"}}>
                      OBBBA raised limit to $2.5M. Applied to 5-yr components before bonus dep. Max: {FMT_USD(cs5Amt)}.
                    </div>
                  </>)}
                </div>
              </>)}
            </div>
          )}
        </div>
      );
    })()}
    </div>
  </div>);
}

// ─── CASH FLOW TAB ────────────────────────────────────────────────────────────

export { ExpenseInputRow, PropertyLookupPanel };
export default AssumptionsTab;
