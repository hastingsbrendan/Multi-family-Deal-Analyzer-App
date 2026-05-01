import React from 'react';
import * as Sentry from '@sentry/react';
import { sbClient } from '../../lib/constants';
import { useIsMobile } from '../../lib/hooks';
import { getFloodZoneForAddress, floodZoneInfo, getCountyAndMsaForAddress } from '../../lib/floodZone';

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

export default function PropertyLookupPanel({deal, onChange}) {
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
    setLoading(true); setError(''); setPreview(null);
    try {
      const addr = parseAddressFromUrl(input.trim());
      if (!addr) { setError('Could not parse address from URL. Try pasting the address directly.'); setLoading(false); return; }

      // Get session JWT for server-side proxy auth
      const { data: { session } } = await sbClient.auth.getSession();
      const token = session?.access_token;
      if (!token) { setError('Please sign in to use address lookup.'); setLoading(false); return; }
      const authHeaders = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' };

      const encAddr = encodeURIComponent(addr);

      // Call property records endpoint via server proxy
      const propRes = await fetch(`/api/rentcast?path=/v1/properties&address=${encAddr}&limit=1`, { headers: authHeaders });
      if (propRes.status === 503) {
        let b = {}; try { b = await propRes.json(); } catch {}
        if (b.paused) { setError('Rentcast API is temporarily paused — property lookup is unavailable. Try again later.'); setLoading(false); return; }
      }
      if (!propRes.ok) { const t = await propRes.text(); setError(`Rentcast error (${propRes.status}): ${t}`); setLoading(false); return; }
      const propData = await propRes.json();
      const prop = Array.isArray(propData) ? propData[0] : propData;

      if (!prop) { setError('No property found for that address. Try entering the address manually.'); setLoading(false); return; }

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
        const r = await fetch(`/api/rentcast?path=/v1/avm/rent/long-term&address=${encAddr}&bedrooms=${beds}&propertyType=Apartment`, { headers: authHeaders });
        if (r.ok) rentByBeds[beds] = await r.json();
      }
      // Also fetch whole-property estimate as fallback
      const rentRes = await fetch(`/api/rentcast?path=/v1/avm/rent/long-term&address=${encAddr}`, { headers: authHeaders });
      const rentData = rentRes.ok ? await rentRes.json() : null;

      setPreview({ prop, rent: rentData, rentByBeds, bedsPerUnit, parsedAddr: addr });
    } catch(e) { setError('Network error: ' + e.message); }
    setLoading(false);
  };

  const applyPreview = () => {
    if (!preview) return;
    const { prop, rent } = preview;
    const d = structuredClone(deal);
    const a = d.assumptions;

    // Address
    if (prop.formattedAddress) d.address = prop.formattedAddress;

    // Auto-detect state from formatted address (e.g. "123 Main St, Chicago, IL 60601")
    if (prop.formattedAddress && !a.state) {
      const stateMatch = prop.formattedAddress.match(/,\s*([A-Z]{2})(?:\s+\d{5}|,\s*\d{5}|$)/);
      if (stateMatch) a.state = stateMatch[1];
    }

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
    // HOA fee — Rentcast returns monthly; convert to annual and write to expenses
    if (prop.hoa?.fee) { a.expenses = a.expenses||{}; a.expenses.hoa = Math.round(prop.hoa.fee * 12); }
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

    // Async: fetch FEMA flood zone + county/MSA lookup in parallel
    const addrForAsync = d.address || preview.parsedAddr;
    if (addrForAsync) {
      sbClient.auth.getSession().then(({ data: { session } }) => {
        const token = session?.access_token;
        Promise.all([
          getFloodZoneForAddress(addrForAsync, token).catch(() => null),
          getCountyAndMsaForAddress(addrForAsync, token).catch(() => null),
        ]).then(([zone, countyMsa]) => {
          if (zone || countyMsa) {
            const upd2 = structuredClone(d);
            if (zone) upd2.assumptions.floodZone = zone;
            if (countyMsa) {
              upd2.assumptions.countyFips  = countyMsa.countyFips;
              upd2.assumptions.countyName  = countyMsa.countyName;
              upd2.assumptions.stateFips   = countyMsa.stateFips;
              upd2.assumptions.msaCode     = countyMsa.msaCode;
              upd2.assumptions.msaName     = countyMsa.msaName;
            }
            onChange(upd2);
          }
        }).catch(e => Sentry.captureException(e, { tags: { origin: 'AssumptionsTab.asyncLookup' } }));
      });
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
                <button onClick={applyPreview} style={{flex:1,background:'var(--green)',color:'#fff',border:'none',borderRadius:6,padding:'9px 0',fontWeight:700,fontSize:13,cursor:'pointer'}}>
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
