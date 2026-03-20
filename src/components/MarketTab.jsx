import React, { useState, useEffect, useCallback } from 'react';
import { RENTCAST_KEY, GMAPS_KEY, FMT_USD } from '../lib/constants';
import { useIsMobile } from '../lib/hooks';
import MetricCard from './ui/MetricCard';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';

const CENSUS_VARS = 'B19013_001E,B25003_001E,B25003_002E,B25003_003E,B25002_001E,B25002_003E,B01002_001E,B01003_001E';
const FRED_MORTGAGE_SERIES = 'MORTGAGE30US';
// Additional FRED series fetched alongside mortgage rate
const FRED_BATCH = 'MORTGAGE30US,DGS10,DFEDTARU,CUUR0000SEHA,CSUSHPINSA';
const SPREAD_HIST_AVG = 1.7; // historical mortgage-Treasury spread average

function floodZoneInfo(zone){
  if(!zone)return null;
  const z=zone.toUpperCase();
  if(z==='X'||z==='X500')return{risk:'low',label:`Zone ${zone}`,color:'#10b981',bg:'#10b98115',desc:'Minimal flood risk — outside 500-year floodplain'};
  if(z.startsWith('V'))return{risk:'critical',label:`Zone ${zone}`,color:'#ef4444',bg:'#ef444415',desc:'Coastal high-risk — mandatory flood insurance likely required'};
  if(z.startsWith('A'))return{risk:'high',label:`Zone ${zone}`,color:'#f59e0b',bg:'#f59e0b15',desc:'High-risk flood zone — flood insurance typically required by lenders'};
  if(z==='D')return{risk:'unknown',label:`Zone ${zone}`,color:'#6366f1',bg:'#6366f115',desc:'Undetermined flood risk — possible but not assessed by FEMA'};
  return{risk:'moderate',label:`Zone ${zone}`,color:'#f59e0b',bg:'#f59e0b15',desc:'Moderate-to-low flood risk'};
}

// Parse FRED observations array → clean [{date, value}] newest-last
function parseFredObs(obs=[]) {
  return obs
    .filter(o => o.value !== '.' && +o.value > 0)
    .map(o => ({ date: o.date, value: +o.value }))
    .sort((a, b) => a.date.localeCompare(b.date)); // oldest → newest
}
// Latest non-missing value from a parsed obs array
function latest(obs) { return obs.length ? obs[obs.length - 1] : null; }
// YoY % change: compare newest to item ~12 monthly obs ago
function yoyPct(obs, periodsBack = 12) {
  if (obs.length < 2) return null;
  const now = obs[obs.length - 1].value;
  const then = obs[Math.max(0, obs.length - periodsBack - 1)].value;
  return then > 0 ? +((now / then - 1) * 100).toFixed(2) : null;
}
// 52-week delta for weekly series
function deltaWeekly(obs, weeksBack = 52) {
  if (obs.length < 2) return null;
  const now = obs[obs.length - 1].value;
  const then = obs[Math.max(0, obs.length - weeksBack - 1)].value;
  return +((now - then).toFixed(2));
}

function SectionHeader({title,subtitle}){return(<div style={{marginBottom:16}}><div style={{fontSize:13,fontWeight:800,color:'var(--text)',letterSpacing:'-0.2px',fontFamily:"'Fraunces',serif"}}>{title}</div>{subtitle&&<div style={{fontSize:11,color:'var(--muted)',marginTop:2}}>{subtitle}</div>}</div>);}
function StatRow({label,value,sub,accent}){return(<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid var(--border)'}}><div style={{fontSize:12,color:'var(--muted)',fontWeight:600}}>{label}</div><div style={{textAlign:'right'}}><div style={{fontSize:13,fontWeight:800,color:accent?'var(--accent)':'var(--text)'}}>{value}</div>{sub&&<div style={{fontSize:10,color:'var(--muted)',marginTop:1}}>{sub}</div>}</div></div>);}
function Section({children,style}){return(<div style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:14,padding:'18px 20px',...style}}>{children}</div>);}
function EmptyState({icon,title,sub}){return(<div style={{textAlign:'center',padding:'32px 16px',color:'var(--muted)'}}><div style={{fontSize:32,marginBottom:8}}>{icon}</div><div style={{fontSize:13,fontWeight:700,color:'var(--text)',marginBottom:4}}>{title}</div><div style={{fontSize:12}}>{sub}</div></div>);}
function ChartTooltip({active,payload,label,formatter}){if(!active||!payload?.length)return null;return(<div style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px',fontSize:12}}><div style={{color:'var(--muted)',marginBottom:4}}>{label}</div>{payload.map((p,i)=>(<div key={i} style={{color:p.color,fontWeight:700}}>{p.name}: {formatter?formatter(p.value):p.value}</div>))}</div>);}
function extractZip(address){if(!address)return null;const m=address.match(/\b(\d{5})\b/);return m?m[1]:null;}

function RateCompare({fredRate, dealRate}) {
  if (!fredRate || !dealRate) return null;
  const diff = dealRate - fredRate;
  const absDiff = Math.abs(diff).toFixed(2);
  const isHigher = diff > 0.05, isLower = diff < -0.05;
  return (
    <div style={{marginTop:12,padding:'10px 14px',borderRadius:10,background:isHigher?'#f59e0b18':isLower?'#10b98115':'var(--card)',border:`1px solid ${isHigher?'#f59e0b55':isLower?'#10b98144':'var(--border)'}`}}>
      <div style={{fontSize:12,fontWeight:700,color:'var(--text)',marginBottom:4}}>{isHigher?'⚠️':isLower?'✅':'ℹ️'} Your Deal Rate vs. Market</div>
      <div style={{fontSize:12,color:'var(--muted)'}}>
        You modeled <strong style={{color:'var(--text)'}}>{dealRate.toFixed(2)}%</strong> vs current 30-yr avg of <strong style={{color:'var(--accent)'}}>{fredRate.toFixed(2)}%</strong> — {isHigher?`${absDiff}% above market (conservative ✓)`:isLower?`${absDiff}% below market — review your rate assumption`:'roughly in line with market rates'}
      </div>
    </div>
  );
}

// ── Rate Context panel ────────────────────────────────────────────────────────
function RateContextPanel({ fredAllData }) {
  if (!fredAllData) return null;
  const { mortgage, treasury10, fedTarget, rentCPI, hpi } = fredAllData;
  if (!mortgage || !treasury10) return null;

  const mortgageRate = latest(mortgage)?.value;
  const treasuryRate = latest(treasury10)?.value;
  const fedRate      = latest(fedTarget)?.value;
  const spread       = mortgageRate && treasuryRate ? +(mortgageRate - treasuryRate).toFixed(2) : null;
  const impliedNorm  = treasuryRate ? +(treasuryRate + SPREAD_HIST_AVG).toFixed(2) : null;
  const spreadDiff   = spread ? +(spread - SPREAD_HIST_AVG).toFixed(2) : null;

  const rentYoY      = rentCPI ? yoyPct(rentCPI, 12) : null;
  const hpiYoY       = hpi     ? yoyPct(hpi, 12)     : null;

  const spreadColor  = spread > SPREAD_HIST_AVG + 0.3 ? 'var(--accent2)' : spread < SPREAD_HIST_AVG - 0.1 ? 'var(--green)' : 'var(--text)';
  const spreadNote   = spread > SPREAD_HIST_AVG + 0.3
    ? `${spreadDiff}% above hist. avg — suggests room for rates to fall without a Treasury move`
    : spread < SPREAD_HIST_AVG
    ? 'At or below historical avg — rates are fairly priced vs Treasuries'
    : 'Near historical average';

  return (
    <div style={{marginTop:16,display:'flex',flexDirection:'column',gap:10}}>
      <div style={{fontSize:11,fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.08em'}}>Rate Context</div>

      {/* Key rate grid */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
        {[
          { label:'10-Yr Treasury', value: treasuryRate ? `${treasuryRate.toFixed(2)}%` : '—', sub:'Mortgage rate driver' },
          { label:'Fed Funds Upper', value: fedRate ? `${fedRate.toFixed(2)}%` : '—',      sub:'Current policy ceiling' },
          { label:'Mortgage Spread', value: spread ? `${spread.toFixed(2)}%` : '—',        sub:`Hist. avg ~${SPREAD_HIST_AVG}%`, color: spreadColor },
        ].map(({label,value,sub,color})=>(
          <div key={label} style={{background:'var(--bg2)',borderRadius:10,padding:'10px 12px'}}>
            <div style={{fontSize:9,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',color:'var(--muted)',marginBottom:4}}>{label}</div>
            <div style={{fontSize:18,fontWeight:900,color: color || 'var(--text)',letterSpacing:'-0.5px',lineHeight:1}}>{value}</div>
            <div style={{fontSize:10,color:'var(--muted)',marginTop:4}}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Spread interpretation */}
      {spread && (
        <div style={{padding:'10px 14px',borderRadius:10,background:'rgba(13,148,136,0.06)',border:'1px solid rgba(13,148,136,0.2)'}}>
          <div style={{fontSize:11,fontWeight:700,color:'var(--accent)',marginBottom:3}}>
            📊 Spread Signal
          </div>
          <div style={{fontSize:11,color:'var(--muted)',lineHeight:1.55}}>
            {spreadNote}. If spread compressed to historical avg, the 30-yr rate would fall to ~<strong style={{color:'var(--text)'}}>{impliedNorm}%</strong> with no change in Treasuries.
          </div>
        </div>
      )}

      {/* Macro benchmarks */}
      {(rentYoY !== null || hpiYoY !== null) && (
        <>
          <div style={{fontSize:11,fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.08em',marginTop:4}}>National Benchmarks</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            {rentYoY !== null && (
              <div style={{background:'var(--bg2)',borderRadius:10,padding:'10px 12px'}}>
                <div style={{fontSize:9,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',color:'var(--muted)',marginBottom:4}}>CPI Rent YoY</div>
                <div style={{fontSize:18,fontWeight:900,color:'var(--text)',letterSpacing:'-0.5px',lineHeight:1}}>{rentYoY > 0 ? '+' : ''}{rentYoY}%</div>
                <div style={{fontSize:10,color:'var(--muted)',marginTop:4}}>National rent inflation</div>
              </div>
            )}
            {hpiYoY !== null && (
              <div style={{background:'var(--bg2)',borderRadius:10,padding:'10px 12px'}}>
                <div style={{fontSize:9,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',color:'var(--muted)',marginBottom:4}}>Case-Shiller HPI YoY</div>
                <div style={{fontSize:18,fontWeight:900,color:'var(--text)',letterSpacing:'-0.5px',lineHeight:1}}>{hpiYoY > 0 ? '+' : ''}{hpiYoY}%</div>
                <div style={{fontSize:10,color:'var(--muted)',marginTop:4}}>National home appreciation</div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Assumptions Check panel ───────────────────────────────────────────────────
function AssumptionsCheckPanel({ deal, fredAllData }) {
  if (!deal || !fredAllData) return null;
  const { rentCPI, hpi } = fredAllData;
  const a = deal.assumptions;

  const rentYoY = rentCPI ? yoyPct(rentCPI, 12) : null;
  const hpiYoY  = hpi     ? yoyPct(hpi, 12)     : null;

  const dealRentGrowth = +a.rentGrowth || 0;
  const dealAppreciation = +a.appreciationRate || 0;

  if (rentYoY === null && hpiYoY === null) return null;

  const Check = ({ label, dealVal, marketVal, unit, higherIsBetter = true, note }) => {
    if (marketVal === null) return null;
    const diff = dealVal - marketVal;
    const isOptimistic = higherIsBetter ? diff > 0.5 : diff < -0.5;
    const isConservative = higherIsBetter ? diff < -0.5 : diff > 0.5;
    const isAligned = !isOptimistic && !isConservative;
    const color = isOptimistic ? 'var(--accent2)' : isConservative ? 'var(--green)' : 'var(--accent)';
    const icon  = isOptimistic ? '⚠️' : isConservative ? '✅' : '✓';
    const verdict = isOptimistic
      ? `Your assumption (${dealVal}${unit}) is above the current national rate (${marketVal}${unit}) — optimistic`
      : isConservative
      ? `Your assumption (${dealVal}${unit}) is below the current national rate (${marketVal}${unit}) — conservative`
      : `Your assumption (${dealVal}${unit}) is in line with the current national rate (${marketVal}${unit})`;

    return (
      <div style={{padding:'10px 0',borderBottom:'1px solid var(--border-faint)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
          <span style={{fontSize:12,color:'var(--muted)',fontWeight:600}}>{label}</span>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <span style={{fontSize:11,color:'var(--muted)'}}>Your deal: <strong style={{color:'var(--text)'}}>{dealVal}{unit}</strong></span>
            <span style={{fontSize:11,color:'var(--muted)'}}>National: <strong style={{color}}>{marketVal}{unit}</strong></span>
          </div>
        </div>
        <div style={{fontSize:11,color:'var(--muted)',lineHeight:1.4}}>
          {icon} {verdict}{note ? ` — ${note}` : ''}
        </div>
      </div>
    );
  };

  return (
    <div style={{marginTop:16,padding:'14px 16px',borderRadius:10,background:'var(--bg2)',border:'1px solid var(--border)'}}>
      <div style={{fontSize:11,fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:10}}>
        Assumptions vs. National Data
      </div>
      <Check
        label="Rent Growth assumption"
        dealVal={dealRentGrowth}
        marketVal={rentYoY}
        unit="%/yr"
        higherIsBetter={false}
        note="CPI Rent is a national trailing average — local markets may differ"
      />
      <Check
        label="Appreciation assumption"
        dealVal={dealAppreciation}
        marketVal={hpiYoY}
        unit="%/yr"
        higherIsBetter={false}
        note="Case-Shiller measures past appreciation — not a forward forecast"
      />
      <div style={{fontSize:10,color:'var(--muted)',marginTop:10,lineHeight:1.5}}>
        National benchmarks sourced from FRED (Bureau of Labor Statistics + S&P CoreLogic). Local market conditions may differ significantly.
      </div>
    </div>
  );
}

function MarketTab({deal}) {
  const isMobile = useIsMobile();
  const [marketData, setMarketData]   = useState(null);
  const [censusData, setCensusData]   = useState(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState(null);
  const [lastZip, setLastZip]         = useState(null);
  const [saleFilter, setSaleFilter]   = useState('mf');
  const [fredAllData, setFredAllData] = useState(null); // { mortgage, treasury10, fedTarget, rentCPI, hpi }
  const [fredLoading, setFredLoading] = useState(false);

  const zip = extractZip(deal?.address);

  const fetchFred = useCallback(async () => {
    setFredLoading(true);
    try {
      const url = `/api/fred?series_id=${FRED_BATCH}&sort_order=desc&limit=60`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`FRED proxy ${res.status}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);

      // Batch response: { results: { SERIES_ID: observations[] } }
      const r = json.results || {};
      setFredAllData({
        mortgage:  parseFredObs(r['MORTGAGE30US'] || []),
        treasury10:parseFredObs(r['DGS10']        || []),
        fedTarget: parseFredObs(r['DFEDTARU']     || []),
        rentCPI:   parseFredObs(r['CUUR0000SEHA'] || []),
        hpi:       parseFredObs(r['CSUSHPINSA']   || []),
      });
    } catch (e) { console.warn('FRED fetch failed:', e.message); }
    finally { setFredLoading(false); }
  }, []);

  const fetchAll = useCallback(async (zipCode) => {
    setLoading(true); setError(null);
    try {
      const headers = { 'X-Api-Key': RENTCAST_KEY, 'Accept': 'application/json' };
      const mktRes = await fetch(`https://api.rentcast.io/v1/markets?zipCode=${zipCode}&dataType=All&historyMonths=12`, { headers });
      if (!mktRes.ok) throw new Error(`Rentcast ${mktRes.status}: ${await mktRes.text()}`);
      setMarketData(await mktRes.json());
      const censusRes = await fetch(`https://api.census.gov/data/2023/acs/acs5?get=${CENSUS_VARS}&for=zip%20code%20tabulation%20area:${zipCode}`);
      if (censusRes.ok) {
        const raw = await censusRes.json();
        if (raw.length >= 2) { const h=raw[0],v=raw[1],obj={}; h.forEach((k,i)=>{obj[k]=v[i];}); setCensusData(obj); }
      }
      setLastZip(zipCode);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (zip && zip !== lastZip && !loading) fetchAll(zip); }, [zip, lastZip, loading, fetchAll]);
  useEffect(() => { fetchFred(); }, [fetchFred]);

  // Census derived
  const income    = censusData ? +censusData['B19013_001E'] : null;
  const totalOcc  = censusData ? +censusData['B25003_001E'] : null;
  const renterOcc = censusData ? +censusData['B25003_003E'] : null;
  const totalUnits= censusData ? +censusData['B25002_001E'] : null;
  const vacantUnits=censusData ? +censusData['B25002_003E'] : null;
  const medianAge = censusData ? +censusData['B01002_001E'] : null;
  const population= censusData ? +censusData['B01003_001E'] : null;
  const renterPct = totalOcc && renterOcc ? (renterOcc / totalOcc) * 100 : null;
  const vacancyPct= totalUnits && vacantUnits ? (vacantUnits / totalUnits) * 100 : null;

  // Rentcast derived
  const rd = marketData?.rentalData;
  const sd = marketData?.saleData;
  const rentTrend = rd?.history ? Object.entries(rd.history).sort(([a],[b])=>a.localeCompare(b)).slice(-12).map(([month,d])=>({month:month.slice(0,7),avg:Math.round(d.averageRent||0),median:Math.round(d.medianRent||0)})).filter(d=>d.avg>0) : [];
  const saleTrend = sd?.history ? Object.entries(sd.history).sort(([a],[b])=>a.localeCompare(b)).slice(-12).map(([month,d])=>({month:month.slice(0,7),avg:Math.round(d.averagePrice||0),median:Math.round(d.medianPrice||0)})).filter(d=>d.avg>0) : [];
  const bedroomRents = rd?.dataByBedrooms ? Object.entries(rd.dataByBedrooms).sort(([a],[b])=>+a-+b).map(([beds,d])=>({beds:beds==='0'?'Studio':`${beds} BR`,avg:d.averageRent,median:d.medianRent,count:d.totalListings})) : [];
  const MF_TYPES = ['Multi-Family','Duplex','Triplex','Quadruplex'];
  const sdMF = sd?.dataByPropertyType?.find(t=>MF_TYPES.includes(t.propertyType)) || null;
  const sdActive = (saleFilter==='mf' && sdMF) ? sdMF : sd;
  const sdIsMF   = (saleFilter==='mf' && !!sdMF);
  const saleTrendMF = sd?.history
    ? Object.entries(sd.history).sort(([a],[b])=>a.localeCompare(b)).slice(-12).map(([month,d])=>{ const mfEntry=d.dataByPropertyType?.find(t=>MF_TYPES.includes(t.propertyType)); return({month:month.slice(0,7),avg:Math.round(mfEntry?.averagePrice||0),median:Math.round(mfEntry?.medianPrice||0),allAvg:Math.round(d.averagePrice||0)}); }).filter(d=>d.avg>0)
    : [];

  // FRED derived
  const mortgage    = fredAllData?.mortgage    || [];
  const currentRate = latest(mortgage)?.value  || null;
  const rateDelta   = mortgage.length ? deltaWeekly(mortgage, 52) : null;
  const rateLastYear= mortgage.length > 51 ? mortgage[mortgage.length - 52]?.value : null;
  const fredChartData = mortgage.slice(-26).map(d => ({ date: d.date.slice(0,7), rate: d.value }));
  const dealRate    = deal?.assumptions?.interestRate ? +deal.assumptions.interestRate : null;
  const lastUpdated = latest(mortgage)?.date || null;

  const floodZone = deal?.assumptions?.floodZone;
  const fzInfo    = floodZoneInfo(floodZone);
  const fmtK = v => v >= 1000000 ? `$${(v/1000000).toFixed(2)}M` : v >= 1000 ? `$${(v/1000).toFixed(0)}K` : FMT_USD(v);

  if (!zip) return (<div style={{padding:'16px 0'}}><EmptyState icon="🗺️" title="Enter a property address" sub="Market data will load automatically once an address with a zip code is set."/></div>);
  if (loading) return (<div style={{padding:'16px 0'}}><div style={{textAlign:'center',padding:48,color:'var(--muted)'}}><div style={{fontSize:28,marginBottom:12}}>⏳</div><div style={{fontSize:13,fontWeight:700,color:'var(--text)'}}>Loading market data…</div><div style={{fontSize:12,marginTop:4}}>Fetching Rentcast + Census data for ZIP {zip}</div></div></div>);
  if (error) return (<div style={{padding:'16px 0'}}><EmptyState icon="⚠️" title="Could not load market data" sub={error}/><div style={{textAlign:'center',marginTop:12}}><button onClick={()=>fetchAll(zip)} style={{background:'var(--accent)',color:'#fff',border:'none',borderRadius:100,padding:'8px 20px',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>Retry</button></div></div>);
  if (!marketData && !censusData) return (<div style={{padding:'16px 0'}}><EmptyState icon="📊" title="Market data not loaded" sub={`ZIP ${zip} detected. Click below to fetch market data.`}/><div style={{textAlign:'center',marginTop:12}}><button onClick={()=>fetchAll(zip)} style={{background:'var(--accent)',color:'#fff',border:'none',borderRadius:100,padding:'8px 20px',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>Load Market Data</button></div></div>);

  const gridStyle = isMobile ? {display:'flex',flexDirection:'column',gap:14} : {display:'grid',gridTemplateColumns:'1fr 1fr',gap:16};

  return (
    <div style={{padding:'16px 0'}}>

      {/* HEADER */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
        <div>
          <div style={{fontFamily:"'Fraunces',serif",fontSize:18,fontWeight:900,color:'var(--text)',letterSpacing:'-0.5px'}}>Market Overview · ZIP {zip}</div>
          <div style={{fontSize:11,color:'var(--muted)',marginTop:2}}>Rentcast · US Census ACS 2023 · Federal Reserve (FRED)</div>
        </div>
        <button onClick={()=>{fetchAll(zip);fetchFred();}} style={{background:'none',border:'1px solid var(--border)',borderRadius:100,padding:'6px 14px',fontSize:11,fontWeight:700,color:'var(--muted)',cursor:'pointer',fontFamily:'inherit'}}>↻ Refresh</button>
      </div>

      {/* FLOOD ZONE BANNER */}
      {fzInfo && fzInfo.risk !== 'low' && (
        <div style={{marginBottom:16,padding:'12px 16px',borderRadius:10,background:fzInfo.bg,border:`1px solid ${fzInfo.color}55`,display:'flex',alignItems:'center',gap:12}}>
          <span style={{fontSize:20}}>{fzInfo.risk==='critical'?'🌊':'⚠️'}</span>
          <div>
            <div style={{fontSize:13,fontWeight:700,color:fzInfo.color}}>Flood Zone{fzInfo.risk==='critical'?' — Critical Risk':' — Elevated Risk'}: {fzInfo.label}</div>
            <div style={{fontSize:12,color:'var(--muted)',marginTop:2}}>{fzInfo.desc}</div>
          </div>
        </div>
      )}

      {/* KPI STRIP */}
      <div style={{display:'flex',gap:12,marginBottom:20,flexWrap:'wrap'}}>
        {rd?.averageRent  > 0 && <MetricCard label="Avg Market Rent"      value={FMT_USD(rd.averageRent)}                         sub={`Median ${FMT_USD(rd.medianRent)}`} highlight/>}
        {sd?.averagePrice > 0 && <MetricCard label={sdIsMF?"Avg MF Sale Price":"Avg Sale Price"} value={fmtK(sdActive?.averagePrice||sd.averagePrice)} sub={sdIsMF?`Median ${fmtK(sdActive.medianPrice||0)} · MF only`:`Median ${fmtK(sd.medianPrice)}`}/>}
        {income           > 0 && <MetricCard label="Median HH Income"     value={FMT_USD(income)}                                  sub="Census ACS 2023"/>}
        {renterPct !== null    && <MetricCard label="Renter Occupied"      value={`${renterPct.toFixed(0)}%`}                       sub="of occupied units"/>}
        {currentRate           && <MetricCard label="30-Yr Mortgage"       value={`${currentRate.toFixed(2)}%`}                     sub={rateDelta != null ? `${rateDelta > 0 ? '▲' : '▼'} ${Math.abs(rateDelta).toFixed(2)}% vs 1yr ago` : 'FRED'}/>}
      </div>

      <div style={gridStyle}>

        {/* RENTAL MARKET */}
        {rd && (
          <Section>
            <SectionHeader title="🏘️ Rental Market" subtitle="Active rental listings · Rentcast"/>
            {bedroomRents.length > 0 && (
              <div style={{marginBottom:16}}>
                <div style={{fontSize:11,fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:8}}>Avg Rent by Bedrooms</div>
                {bedroomRents.map(b => (
                  <div key={b.beds} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'7px 0',borderBottom:'1px solid var(--border)'}}>
                    <div style={{fontSize:12,color:'var(--muted)',fontWeight:600}}>{b.beds}</div>
                    <div style={{display:'flex',gap:16,alignItems:'center'}}>
                      {b.count > 0 && <div style={{fontSize:10,color:'var(--muted)'}}>{b.count} listings</div>}
                      <div style={{fontSize:13,fontWeight:800,color:'var(--accent)'}}>{b.avg ? FMT_USD(b.avg) : '—'}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {rd.averageRent       > 0 && <StatRow label="Average Rent"        value={FMT_USD(rd.averageRent)}/>}
            {rd.medianRent        > 0 && <StatRow label="Median Rent"         value={FMT_USD(rd.medianRent)}/>}
            {rd.averageRentPerSqFt> 0 && <StatRow label="Avg Rent / Sq Ft"   value={`$${rd.averageRentPerSqFt.toFixed(2)}`}/>}
            {rd.averageDaysOnMarket>0  && <StatRow label="Avg Days on Market" value={`${Math.round(rd.averageDaysOnMarket)} days`}/>}
            {rd.totalListings     > 0 && <StatRow label="Active Listings"     value={rd.totalListings.toLocaleString()}/>}
          </Section>
        )}

        {/* SALE MARKET */}
        {sd && (
          <Section>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16}}>
              <div>
                <div style={{fontSize:13,fontWeight:800,color:'var(--text)',letterSpacing:'-0.2px',fontFamily:"'Fraunces',serif"}}>🏷️ Sale Market</div>
                <div style={{fontSize:11,color:'var(--muted)',marginTop:2}}>{sdIsMF?`${sdActive.totalListings||0} multi-family listings · Rentcast`:`${sd.totalListings||0} listings (all types) · Rentcast`}</div>
              </div>
              {sdMF && (
                <div style={{display:'flex',background:'var(--bg2)',borderRadius:100,padding:2,border:'1px solid var(--border)',flexShrink:0}}>
                  {[['mf','Multi-Family'],['all','All Types']].map(([val,label])=>(
                    <button key={val} onClick={()=>setSaleFilter(val)} style={{padding:'4px 11px',fontSize:11,fontWeight:700,borderRadius:100,border:'none',cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap',background:saleFilter===val?'var(--accent)':'transparent',color:saleFilter===val?'#fff':'var(--muted)'}}>
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {!sdMF && saleFilter==='mf' && <div style={{fontSize:11,color:'var(--accent2)',fontStyle:'italic',marginBottom:10,padding:'6px 8px',background:'rgba(217,119,6,0.07)',borderRadius:6}}>⚠ No multi-family listings — showing all types.</div>}
            {sdActive.averagePrice      > 0 && <StatRow label="Average Price"        value={fmtK(sdActive.averagePrice)} accent/>}
            {sdActive.medianPrice       > 0 && <StatRow label="Median Price"         value={fmtK(sdActive.medianPrice)}/>}
            {sdActive.averagePricePerSqFt>0  && <StatRow label="Avg Price / Sq Ft"  value={`$${Math.round(sdActive.averagePricePerSqFt)}`}/>}
            {sdActive.averageDaysOnMarket>0   && <StatRow label="Avg Days on Market" value={`${Math.round(sdActive.averageDaysOnMarket)} days`}/>}
            {sdActive.totalListings     > 0 && <StatRow label="Active Listings"      value={sdActive.totalListings.toLocaleString()}/>}
            {!sdIsMF && sd.newListings  > 0 && <StatRow label="New This Month"       value={sd.newListings.toLocaleString()}/>}
          </Section>
        )}

        {/* DEMOGRAPHICS */}
        {censusData && (
          <Section>
            <SectionHeader title="👥 Neighborhood Demographics" subtitle="US Census ACS 5-Year 2023"/>
            {population  > 0   && <StatRow label="Population"              value={population.toLocaleString()}/>}
            {medianAge   > 0   && <StatRow label="Median Age"              value={`${medianAge} yrs`}/>}
            {income      > 0   && <StatRow label="Median Household Income" value={FMT_USD(income)} accent/>}
            {renterPct !== null && <StatRow label="Renter Occupied"        value={`${renterPct.toFixed(1)}%`} sub="of occupied units"/>}
            {vacancyPct !== null&& <StatRow label="Vacancy Rate"           value={`${vacancyPct.toFixed(1)}%`} sub="all housing units"/>}
            {totalUnits  > 0   && <StatRow label="Total Housing Units"     value={totalUnits.toLocaleString()}/>}
          </Section>
        )}

        {/* MARKET RATIOS */}
        {rd?.averageRent > 0 && sd?.medianPrice > 0 && (
          <Section>
            <SectionHeader title="📐 Market Ratios" subtitle="Calculated from Rentcast data"/>
            <StatRow label="Market GRM"         value={`${(sd.medianPrice/(rd.averageRent*12)).toFixed(1)}x`} sub="Median Price ÷ Annual Avg Rent" accent/>
            <StatRow label="Market Gross Yield" value={`${((rd.averageRent*12)/sd.medianPrice*100).toFixed(1)}%`} sub="Annual Rent ÷ Median Price"/>
            {deal?.assumptions?.purchasePrice > 0 && (() => {
              const pp = deal.assumptions.purchasePrice;
              const numUnits = deal.assumptions.numUnits || 2;
              const annualRent = rd.averageRent * 12 * numUnits;
              const grm   = pp / annualRent;
              const yield_ = annualRent / pp * 100;
              const mktGrm = sd.medianPrice / (rd.averageRent * 12);
              return (
                <>
                  <div style={{height:1,background:'var(--border)',margin:'10px 0'}}/>
                  <div style={{fontSize:11,fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}}>Your Deal vs. Market</div>
                  <StatRow label="Your GRM"         value={`${grm.toFixed(1)}x`}    sub={`vs ${mktGrm.toFixed(1)}x market`} accent={grm < mktGrm}/>
                  <StatRow label="Your Gross Yield" value={`${yield_.toFixed(1)}%`} sub={`vs ${((rd.averageRent*12)/sd.medianPrice*100).toFixed(1)}% market`}/>
                </>
              );
            })()}
          </Section>
        )}
      </div>

      {/* RENT TREND CHART */}
      {rentTrend.length > 2 && (
        <Section style={{marginTop:16}}>
          <SectionHeader title="📈 Rental Price Trend (12 months)" subtitle={`ZIP ${zip} · Average and median monthly rent · Rentcast`}/>
          <ResponsiveContainer width="100%" height={200}><LineChart data={rentTrend} margin={{top:4,right:16,left:0,bottom:4}}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/><XAxis dataKey="month" tick={{fontSize:10,fill:'var(--muted)'}} tickFormatter={v=>v.slice(5)}/><YAxis tick={{fontSize:10,fill:'var(--muted)'}} tickFormatter={v=>`$${(v/1000).toFixed(1)}k`} width={48}/><Tooltip content={<ChartTooltip formatter={FMT_USD}/>}/><Line type="monotone" dataKey="avg" stroke="var(--accent)" strokeWidth={2} dot={false} name="Avg Rent"/><Line type="monotone" dataKey="median" stroke="var(--accent2)" strokeWidth={2} dot={false} name="Median Rent" strokeDasharray="4 2"/></LineChart></ResponsiveContainer>
          <div style={{display:'flex',gap:16,justifyContent:'center',marginTop:8}}><div style={{display:'flex',alignItems:'center',gap:6,fontSize:11,color:'var(--muted)'}}><div style={{width:24,height:2,background:'var(--accent)',borderRadius:2}}/> Avg Rent</div><div style={{display:'flex',alignItems:'center',gap:6,fontSize:11,color:'var(--muted)'}}><div style={{width:24,height:2,background:'var(--accent2)',borderRadius:2}}/> Median Rent</div></div>
        </Section>
      )}

      {/* SALE TREND CHART */}
      {((saleFilter==='mf' && saleTrendMF.length > 2) ? saleTrendMF : saleTrend).length > 2 && (
        <Section style={{marginTop:16}}>
          <SectionHeader title="📈 Sale Price Trend (12 months)" subtitle={(saleFilter==='mf' && saleTrendMF.length > 2) ? `ZIP ${zip} · Multi-family only · Rentcast` : `ZIP ${zip} · All property types · Rentcast`}/>
          <ResponsiveContainer width="100%" height={200}><LineChart data={(saleFilter==='mf' && saleTrendMF.length > 2) ? saleTrendMF : saleTrend} margin={{top:4,right:16,left:0,bottom:4}}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/><XAxis dataKey="month" tick={{fontSize:10,fill:'var(--muted)'}} tickFormatter={v=>v.slice(5)}/><YAxis tick={{fontSize:10,fill:'var(--muted)'}} tickFormatter={v=>`$${(v/1000).toFixed(0)}k`} width={52}/><Tooltip content={<ChartTooltip formatter={v=>`$${(v/1000).toFixed(0)}k`}/>}/><Line type="monotone" dataKey="avg" stroke="var(--accent)" strokeWidth={2} dot={false} name="Avg Price"/><Line type="monotone" dataKey="median" stroke="var(--accent2)" strokeWidth={2} dot={false} name="Median Price" strokeDasharray="4 2"/></LineChart></ResponsiveContainer>
          <div style={{display:'flex',gap:16,justifyContent:'center',marginTop:8}}><div style={{display:'flex',alignItems:'center',gap:6,fontSize:11,color:'var(--muted)'}}><div style={{width:24,height:2,background:'var(--accent)',borderRadius:2}}/> Avg Price</div><div style={{display:'flex',alignItems:'center',gap:6,fontSize:11,color:'var(--muted)'}}><div style={{width:24,height:2,background:'var(--accent2)',borderRadius:2}}/> Median Price</div></div>
        </Section>
      )}

      {/* ── RATE ENVIRONMENT (expanded) ─────────────────────────────────── */}
      <Section style={{marginTop:16}}>
        <SectionHeader
          title="📉 Rate Environment"
          subtitle={lastUpdated ? `30-Yr Fixed · 10-Yr Treasury · Fed Rate · FRED · Updated ${lastUpdated}` : 'Federal Reserve Economic Data (FRED)'}
        />
        {fredLoading && <div style={{fontSize:12,color:'var(--muted)',padding:'8px 0'}}>Loading rate data…</div>}
        {!fredLoading && !currentRate && (
          <div style={{fontSize:12,color:'var(--muted)',padding:'8px 0'}}>Rate data temporarily unavailable — retrying next visit.</div>
        )}
        {currentRate && !fredLoading && (
          <>
            {/* Top metric cards */}
            <div style={{display:'flex',gap:12,flexWrap:'wrap',marginBottom:16}}>
              <MetricCard label="30-Yr Fixed Rate"  value={`${currentRate.toFixed(2)}%`}    sub={rateDelta != null ? `${rateDelta > 0 ? '▲' : '▼'} ${Math.abs(rateDelta).toFixed(2)}% vs 1yr ago` : 'Current weekly avg'} highlight/>
              {rateLastYear && <MetricCard label="1 Year Ago" value={`${rateLastYear.toFixed(2)}%`} sub="52 weeks prior"/>}
            </div>

            {/* Deal rate comparison */}
            {dealRate && <RateCompare fredRate={currentRate} dealRate={dealRate}/>}

            {/* 26-week chart */}
            {fredChartData.length > 3 && (
              <div style={{marginTop:16}}>
                <div style={{fontSize:11,fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:10}}>26-Week Rate Trend</div>
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={fredChartData} margin={{top:4,right:16,left:0,bottom:4}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
                    <XAxis dataKey="date" tick={{fontSize:10,fill:'var(--muted)'}} tickFormatter={v=>v.slice(5)}/>
                    <YAxis tick={{fontSize:10,fill:'var(--muted)'}} tickFormatter={v=>`${v.toFixed(1)}%`} width={44} domain={['auto','auto']}/>
                    <Tooltip content={<ChartTooltip formatter={v=>`${v.toFixed(2)}%`}/>}/>
                    {dealRate && <Line type="monotone" dataKey={()=>dealRate} stroke="var(--accent2)" strokeWidth={1.5} dot={false} name="Your Rate" strokeDasharray="5 3"/>}
                    <Line type="monotone" dataKey="rate" stroke="var(--accent)" strokeWidth={2} dot={false} name="30-Yr Avg"/>
                  </LineChart>
                </ResponsiveContainer>
                <div style={{display:'flex',gap:16,justifyContent:'center',marginTop:8}}>
                  <div style={{display:'flex',alignItems:'center',gap:6,fontSize:11,color:'var(--muted)'}}><div style={{width:24,height:2,background:'var(--accent)',borderRadius:2}}/> 30-Yr Avg</div>
                  {dealRate && <div style={{display:'flex',alignItems:'center',gap:6,fontSize:11,color:'var(--muted)'}}><div style={{width:24,height:2,background:'var(--accent2)',borderRadius:2}}/> Your Rate</div>}
                </div>
              </div>
            )}

            {/* Rate context: spread + Fed + Treasury + benchmarks */}
            <RateContextPanel fredAllData={fredAllData}/>

            {/* Assumptions check vs national data */}
            <AssumptionsCheckPanel deal={deal} fredAllData={fredAllData}/>
          </>
        )}
      </Section>

    </div>
  );
}

export default MarketTab;
