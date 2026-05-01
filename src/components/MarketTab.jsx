import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as Sentry from '@sentry/react';
import { FMT_USD, sbClient } from '../lib/constants';
import { getCountyAndMsaForAddress } from '../lib/floodZone';
import { useIsMobile } from '../lib/hooks';
import MetricCard from './ui/MetricCard';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import {
  CENSUS_VARS, FRED_BATCH, SPREAD_HIST_AVG,
  QCEW_SUPERSECTORS, buildLausSeriesId, parseBlsObs,
  buildQcewSeriesId, buildTotalQcewSeriesId,
  floodZoneInfo, parseFredObs, latest, yoyPct, deltaWeekly,
  extractZip, parseCensusObj, deriveCensusMetrics,
} from './MarketTab/marketHelpers';
import { SectionHeader, StatRow, BenchmarkRow, MktSection as Section, MktEmptyState as EmptyState, ChartTooltip, RateCompare } from './MarketTab/MarketUIHelpers';
import RateContextPanel from './MarketTab/RateContextPanel';
import AssumptionsCheckPanel from './MarketTab/AssumptionsCheckPanel';
import Button from './ui/Button';

function MarketTab({deal, onChange}) {
  const isMobile = useIsMobile();
  // Initialise from deal cache so the tab doesn't re-fetch on every visit
  const _initZip = extractZip(deal?.address);
  const _cached  = deal?.assumptions?.marketData;
  const _hit     = _cached?.zipCode === _initZip && !!_cached?.data;
  const [marketData, setMarketData]   = useState(_hit ? _cached.data  : null);
  const [censusData, setCensusData]   = useState(null);
  const [nationalCensusData, setNationalCensusData] = useState(null);
  const [stateCensusData, setStateCensusData]       = useState(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState(null);
  const [lastZip, setLastZip]         = useState(_hit ? _initZip : null);
  const [marketFetchedAt, setMarketFetchedAt] = useState(_hit ? (_cached.fetchedAt || null) : null);
  const [apiPaused, setApiPaused]     = useState(false);
  const [saleFilter, setSaleFilter]   = useState('mf');
  const [fredAllData, setFredAllData] = useState(null); // { mortgage, treasury10, fedTarget, rentCPI, hpi, unrate }
  const [fredLoading, setFredLoading] = useState(false);
  const [fredError, setFredError] = useState(null);
  const [blsData, setBlsData]     = useState(null);
  const [blsLoading, setBlsLoading] = useState(false);
  const [blsError, setBlsError]   = useState(null);
  const [qcewData, setQcewData]   = useState(null);
  const [qcewLoading, setQcewLoading] = useState(false);
  // Ref so fetchAll can write back to deal without a stale closure
  const dealRef = useRef(deal);
  useEffect(() => { dealRef.current = deal; }, [deal]);

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
        unrate:    parseFredObs(r['UNRATE']        || []),
      });
    } catch (e) {
      setFredError('Unable to load market rate data.');
      Sentry.captureException(e, { tags: { origin: 'MarketTab.fetchFred' } });
    }
    finally { setFredLoading(false); }
  }, []);

  const fetchBls = useCallback(async (stateFips, countyFips) => {
    if (!stateFips || !countyFips) return;
    const countyFips3 = countyFips.slice(-3); // last 3 digits
    const seriesId = buildLausSeriesId(stateFips, countyFips3);
    setBlsLoading(true);
    setBlsError(null);
    try {
      const currentYear = new Date().getFullYear();
      const url = `/api/bls?series_id=${seriesId}&startyear=${currentYear - 2}&endyear=${currentYear}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`BLS proxy ${res.status}`);
      const json = await res.json();
      if (json.status === 'REQUEST_FAILED') throw new Error('BLS series not found');
      const series = json.Results?.series?.[0];
      if (series) {
        setBlsData({ seriesId, obs: parseBlsObs(series) });
      }

      // Also fetch QCEW industry mix — best-effort, non-blocking
      const qcewSeriesIds = QCEW_SUPERSECTORS.map(s => buildQcewSeriesId(stateFips, countyFips3, s.code));
      const totalSeriesId = buildTotalQcewSeriesId(stateFips, countyFips3);
      const allQcewIds = [totalSeriesId, ...qcewSeriesIds].join(',');
      setQcewLoading(true);
      fetch(`/api/bls?series_id=${allQcewIds}&startyear=${currentYear - 1}&endyear=${currentYear}`)
        .then(r => r.json())
        .then(qjson => {
          if (qjson.status === 'REQUEST_FAILED') return;
          const seriesMap = {};
          (qjson.Results?.series || []).forEach(s => {
            // Get most recent annual value
            const annual = s.data?.find(d => d.period === 'A01');
            if (annual && annual.value !== '-') {
              seriesMap[s.seriesID] = +annual.value;
            }
          });
          const totalEmp = seriesMap[totalSeriesId] || 0;
          if (totalEmp > 0) {
            const sectors = QCEW_SUPERSECTORS.map(s => {
              const sid = buildQcewSeriesId(stateFips, countyFips3, s.code);
              const emp = seriesMap[sid] || 0;
              return { ...s, emp, pct: totalEmp > 0 ? (emp / totalEmp) * 100 : 0 };
            }).filter(s => s.emp > 0).sort((a, b) => b.emp - a.emp);
            setQcewData({ totalEmp, sectors });
          }
        })
        .catch(() => {}) // QCEW is best-effort
        .finally(() => setQcewLoading(false));
    } catch (e) {
      setBlsError('Local unemployment data unavailable.');
      Sentry.captureException(e, { tags: { origin: 'MarketTab.fetchBls' } });
    } finally {
      setBlsLoading(false);
    }
  }, []);

  const fetchAll = useCallback(async (zipCode) => {
    setLoading(true); setError(null); setApiPaused(false);
    try {
      const { data: { session } } = await sbClient.auth.getSession();
      const token = session?.access_token;
      const authHeaders = token ? { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } : { 'Accept': 'application/json' };
      const mktRes = await fetch(`/api/rentcast?path=/v1/markets&zipCode=${zipCode}&dataType=All&historyMonths=12`, { headers: authHeaders });
      // Handle paused state — show cached data instead of an error
      if (mktRes.status === 503) {
        let body = {}; try { body = await mktRes.json(); } catch {}
        if (body.paused) { setApiPaused(true); setLoading(false); return; }
      }
      if (!mktRes.ok) throw new Error(`Rentcast ${mktRes.status}: ${await mktRes.text()}`);
      const data = await mktRes.json();
      const fetchedAt = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      setMarketData(data);
      setMarketFetchedAt(fetchedAt);
      setLastZip(zipCode);
      // Persist to deal so data survives tab switches without re-fetching
      if (onChange) {
        const d = structuredClone(dealRef.current);
        d.assumptions = d.assumptions || {};
        d.assumptions.marketData = { zipCode, fetchedAt, data };
        onChange(d);
      }
      // Census ACS — fetch ZIP + national + state (if stateFips known) in parallel
      const sf = dealRef.current?.assumptions?.stateFips;
      const censusBase = `https://api.census.gov/data/2023/acs/acs5?get=${CENSUS_VARS}`;
      const [censusRes, nationalRes, stateRes] = await Promise.all([
        fetch(`${censusBase}&for=zip%20code%20tabulation%20area:${zipCode}`),
        fetch(`${censusBase}&for=us:1`),
        sf ? fetch(`${censusBase}&for=state:${sf}`) : Promise.resolve(null),
      ]);
      if (censusRes.ok) {
        const raw = await censusRes.json();
        setCensusData(parseCensusObj(raw));
      }
      if (nationalRes?.ok) {
        const raw = await nationalRes.json();
        setNationalCensusData(parseCensusObj(raw));
      }
      if (stateRes?.ok) {
        const raw = await stateRes.json();
        setStateCensusData(parseCensusObj(raw));
      }
    } catch (e) {
      setError(e.message);
      Sentry.captureException(e, { tags: { origin: 'MarketTab.fetchAll' } });
    }
    finally { setLoading(false); }
  }, [onChange]);

  const countyFips = deal?.assumptions?.countyFips;
  const stateFips  = deal?.assumptions?.stateFips;
  const countyName = deal?.assumptions?.countyName;
  const msaName    = deal?.assumptions?.msaName;

  useEffect(() => { if (zip && zip !== lastZip && !loading) fetchAll(zip); }, [zip, lastZip, loading, fetchAll]);
  useEffect(() => { fetchFred(); }, [fetchFred]);
  useEffect(() => {
    if (stateFips && countyFips) fetchBls(stateFips, countyFips);
  }, [stateFips, countyFips, fetchBls]);

  // Self-healing: if deal has an address but no countyFips (pre-dates BLS feature),
  // run the county lookup now and cache the result so BLS sections populate
  const dealAddress = deal?.address;
  useEffect(() => {
    if (!dealAddress || countyFips) return; // already resolved or no address
    sbClient.auth.getSession().then(({ data: { session } }) => {
      const token = session?.access_token;
      getCountyAndMsaForAddress(dealAddress, token)
        .then(result => {
          if (!result || !onChange) return;
          const d = structuredClone(dealRef.current);
          d.assumptions = d.assumptions || {};
          d.assumptions.countyFips = result.countyFips;
          d.assumptions.countyName = result.countyName;
          d.assumptions.stateFips  = result.stateFips;
          d.assumptions.msaCode    = result.msaCode;
          d.assumptions.msaName    = result.msaName;
          onChange(d);
        })
        .catch(e => Sentry.captureException(e, { tags: { origin: 'MarketTab.selfHealCounty' } }));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealAddress]); // only re-run if address changes — countyFips intentionally omitted

  // If stateFips wasn't available during fetchAll (first load), fetch state census when it arrives
  const stateFipsForEffect = deal?.assumptions?.stateFips;
  useEffect(() => {
    if (!stateFipsForEffect || !censusData || stateCensusData) return; // already have it or nothing to do
    const censusBase = `https://api.census.gov/data/2023/acs/acs5?get=${CENSUS_VARS}`;
    fetch(`${censusBase}&for=state:${stateFipsForEffect}`)
      .then(r => r.ok ? r.json() : null)
      .then(raw => { if (raw) setStateCensusData(parseCensusObj(raw)); })
      .catch(() => {});
  }, [stateFipsForEffect, censusData, stateCensusData]);

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

  // New ACS derived values
  const medianGrossRent  = censusData ? +censusData['B25064_001E'] : null;
  const medianHomeValue  = censusData ? +censusData['B25077_001E'] : null;
  const medianYearBuilt  = censusData ? +censusData['B25035_001E'] : null;

  // Rent burden
  const rentBurdenTotal  = censusData ? +censusData['B25070_001E'] : null;
  const rentBurdened     = censusData ? (
    +censusData['B25070_007E'] + +censusData['B25070_008E'] +
    +censusData['B25070_009E'] + +censusData['B25070_010E'] + +censusData['B25070_011E']
  ) : null;
  const rentSeverelyBurdened = censusData ? +censusData['B25070_011E'] : null;
  const rentBurdenedPct  = rentBurdenTotal > 0 ? (rentBurdened / rentBurdenTotal) * 100 : null;
  const severelyBurdenedPct = rentBurdenTotal > 0 ? (rentSeverelyBurdened / rentBurdenTotal) * 100 : null;

  // Unemployment
  const laborForce       = censusData ? +censusData['B23025_002E'] : null;
  const unemployed       = censusData ? +censusData['B23025_005E'] : null;
  const unemploymentRate = laborForce > 0 ? (unemployed / laborForce) * 100 : null;

  // Poverty
  const povertyTotal     = censusData ? +censusData['B17001_001E'] : null;
  const belowPoverty     = censusData ? +censusData['B17001_002E'] : null;
  const povertyRate      = povertyTotal > 0 ? (belowPoverty / povertyTotal) * 100 : null;

  // Education (% with bachelor's or higher, age 25+)
  const eduTotal         = censusData ? +censusData['B15003_001E'] : null;
  const eduCollegePlus   = censusData ? (
    +censusData['B15003_022E'] + +censusData['B15003_023E'] +
    +censusData['B15003_024E'] + +censusData['B15003_025E']
  ) : null;
  const collegePlusPct   = eduTotal > 0 ? (eduCollegePlus / eduTotal) * 100 : null;

  // Housing stock composition
  const structTotal      = censusData ? +censusData['B25024_001E'] : null;
  const struct1detached  = censusData ? +censusData['B25024_002E'] : null;
  const struct1attached  = censusData ? +censusData['B25024_003E'] : null;
  const struct2          = censusData ? +censusData['B25024_004E'] : null;
  const struct34         = censusData ? +censusData['B25024_005E'] : null;
  const struct59         = censusData ? +censusData['B25024_006E'] : null;
  const struct1019       = censusData ? +censusData['B25024_007E'] : null;
  const struct2049       = censusData ? +censusData['B25024_008E'] : null;
  const struct50plus     = censusData ? +censusData['B25024_009E'] : null;

  // Group into investor-relevant categories
  const pctSFR   = structTotal > 0 ? ((struct1detached + struct1attached) / structTotal) * 100 : null;
  const pctSmMF  = structTotal > 0 ? ((struct2 + struct34) / structTotal) * 100 : null;           // 2–4 unit (RentHack's target)
  const pctMedMF = structTotal > 0 ? ((struct59 + struct1019) / structTotal) * 100 : null;         // 5–19 unit
  const pctLgMF  = structTotal > 0 ? ((struct2049 + struct50plus) / structTotal) * 100 : null;     // 20+ unit

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

  // BLS LAUS derived
  const localUnempObs    = blsData?.obs || [];
  const localUnempLatest = localUnempObs.length ? localUnempObs[localUnempObs.length - 1] : null;
  const localUnempRate   = localUnempLatest?.value ?? null;
  const localUnempMonth  = localUnempLatest?.date  ?? null;
  const nationalUnempObs = fredAllData?.unrate || [];
  const nationalUnempRate = nationalUnempObs.length ? nationalUnempObs[nationalUnempObs.length - 1]?.value : null;
  const unempDelta        = localUnempRate != null && nationalUnempRate != null
    ? +(localUnempRate - nationalUnempRate).toFixed(1) : null;
  const unempChartData   = localUnempObs.slice(-24).map(d => ({
    date: d.date,
    local: d.value,
    national: (() => {
      // Match national obs by date prefix (yyyy-mm)
      const match = nationalUnempObs.find(n => n.date.startsWith(d.date.slice(0,7)));
      return match ? match.value : null;
    })(),
  }));

  const floodZone = deal?.assumptions?.floodZone;
  const fzInfo    = floodZoneInfo(floodZone);
  const fmtK = v => v >= 1000000 ? `$${(v/1000000).toFixed(2)}M` : v >= 1000 ? `$${(v/1000).toFixed(0)}K` : FMT_USD(v);
  const natMetrics   = deriveCensusMetrics(nationalCensusData);
  const stateMetrics = deriveCensusMetrics(stateCensusData);

  if (!zip) return (
    <div style={{padding:'40px 20px',textAlign:'center',color:'var(--muted)'}}>
      <div style={{fontSize:32,marginBottom:12}}>📍</div>
      <div style={{fontSize:15,fontWeight:700,color:'var(--text)',marginBottom:6}}>No address entered</div>
      <div style={{fontSize:13}}>Enter a property address on the <strong style={{color:'var(--accent)'}}>Assumptions tab</strong> to see local market data including census demographics, unemployment rates, and mortgage rate trends.</div>
    </div>
  );
  if (loading) return (<div style={{padding:'16px 0'}}><div style={{textAlign:'center',padding:48,color:'var(--muted)'}}><div style={{fontSize:28,marginBottom:12}}>⏳</div><div style={{fontSize:13,fontWeight:700,color:'var(--text)'}}>Loading market data…</div><div style={{fontSize:12,marginTop:4}}>Fetching Rentcast + Census data for ZIP {zip}</div></div></div>);
  if (error) return (<div style={{padding:'16px 0'}}><EmptyState icon="⚠️" title="Could not load market data" sub={error}/><div style={{textAlign:'center',marginTop:12}}><Button variant="primary" onClick={()=>fetchAll(zip)}>Retry</Button></div></div>);
  if (!marketData && !censusData) {
    if (apiPaused) return (<div style={{padding:'16px 0'}}><EmptyState icon="⏸️" title="Market data temporarily unavailable" sub="Rentcast API is paused. No cached data available for this ZIP yet — check back soon."/></div>);
    return (<div style={{padding:'16px 0'}}><EmptyState icon="📊" title="Market data not loaded" sub={`ZIP ${zip} detected. Click below to fetch market data.`}/><div style={{textAlign:'center',marginTop:12}}><Button variant="primary" onClick={()=>fetchAll(zip)}>Load Market Data</Button></div></div>);
  }

  const gridStyle = isMobile ? {display:'flex',flexDirection:'column',gap:14} : {display:'grid',gridTemplateColumns:'1fr 1fr',gap:16};

  return (
    <div style={{padding:'16px 0'}}>

      {/* HEADER */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:apiPaused ? 8 : 20}}>
        <div>
          <div style={{fontFamily:"'Fraunces',serif",fontSize:18,fontWeight:900,color:'var(--text)',letterSpacing:'-0.5px'}}>Market Overview · ZIP {zip}</div>
          <div style={{fontSize:11,color:'var(--muted)',marginTop:2}}>
            {marketFetchedAt ? `Rentcast data cached ${marketFetchedAt} · Census ACS 2023 · FRED` : 'Rentcast · US Census ACS 2023 · Federal Reserve (FRED)'}
          </div>
        </div>
        {!apiPaused && <button onClick={()=>{fetchAll(zip);fetchFred();}} style={{background:'none',border:'1px solid var(--border)',borderRadius:100,padding:'6px 14px',fontSize:11,fontWeight:700,color:'var(--muted)',cursor:'pointer',fontFamily:'inherit'}}>↻ Refresh</button>}
      </div>

      {/* PAUSED BANNER */}
      {apiPaused && (
        <div style={{marginBottom:16,padding:'10px 14px',borderRadius:10,background:'#fffbeb',border:'1px solid rgba(217,119,6,0.3)',fontSize:12,color:'var(--accent2)',fontWeight:600}}>
          ⏸ Rentcast API is temporarily paused — showing cached data from {marketFetchedAt || 'a previous session'}.
        </div>
      )}

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
            {medianAge   > 0   && <BenchmarkRow label="Median Age"         value={`${medianAge} yrs`}
                                   natVal={natMetrics?.medianAge}   stateVal={stateMetrics?.medianAge}
                                   format={v=>`${v.toFixed(0)} yrs`}/>}
            {income      > 0   && <BenchmarkRow label="Median Household Income" value={FMT_USD(income)} accent
                                   natVal={natMetrics?.income}      stateVal={stateMetrics?.income}
                                   format={v=>FMT_USD(Math.round(v))}/>}
            {renterPct !== null && <BenchmarkRow label="Renter Occupied"   value={`${renterPct.toFixed(1)}%`}
                                   natVal={natMetrics?.renterPct}   stateVal={stateMetrics?.renterPct}
                                   format={v=>`${v.toFixed(1)}%`}/>}
            {vacancyPct !== null&& <BenchmarkRow label="Vacancy Rate"      value={`${vacancyPct.toFixed(1)}%`}
                                   natVal={natMetrics?.vacancyPct}  stateVal={stateMetrics?.vacancyPct}
                                   format={v=>`${v.toFixed(1)}%`}/>}
            {totalUnits  > 0   && <StatRow label="Total Housing Units"     value={totalUnits.toLocaleString()}/>}
            {unemploymentRate !== null && unemploymentRate >= 0 &&
                                   <BenchmarkRow label="Unemployment Rate" value={`${unemploymentRate.toFixed(1)}%`}
                                   natVal={natMetrics?.unempRate}   stateVal={stateMetrics?.unempRate}
                                   format={v=>`${v.toFixed(1)}%`}/>}
            {povertyRate !== null && povertyRate >= 0 &&
                                   <BenchmarkRow label="Poverty Rate"      value={`${povertyRate.toFixed(1)}%`}
                                   natVal={natMetrics?.povertyRate} stateVal={stateMetrics?.povertyRate}
                                   format={v=>`${v.toFixed(1)}%`}/>}
            {medianGrossRent > 0 && <BenchmarkRow label="Median Gross Rent" value={FMT_USD(medianGrossRent)} accent
                                   natVal={natMetrics?.medianGrossRent}   stateVal={stateMetrics?.medianGrossRent}
                                   format={v=>FMT_USD(Math.round(v))}/>}
            {medianHomeValue > 0 && <BenchmarkRow label="Median Home Value" value={fmtK(medianHomeValue)}
                                   natVal={natMetrics?.medianHomeValue}   stateVal={stateMetrics?.medianHomeValue}
                                   format={v=>fmtK(v)}/>}
            {collegePlusPct !== null && <BenchmarkRow label="College-Educated" value={`${collegePlusPct.toFixed(0)}%`}
                                   natVal={natMetrics?.collegePlusPct}    stateVal={stateMetrics?.collegePlusPct}
                                   format={v=>`${v.toFixed(0)}%`}/>}
          </Section>
        )}

        {/* HOUSING STOCK */}
        {censusData && structTotal > 0 && (
          <Section>
            <SectionHeader title="🏗️ Housing Stock" subtitle="US Census ACS 5-Year 2023"/>

            {/* Year built + capex risk */}
            {medianYearBuilt > 0 && (() => {
              const age = new Date().getFullYear() - medianYearBuilt;
              const riskColor = age > 60 ? 'var(--red)' : age > 40 ? 'var(--accent2)' : 'var(--green)';
              const riskLabel = age > 60 ? 'High capex risk' : age > 40 ? 'Moderate capex risk' : 'Lower capex risk';
              return (
                <div style={{marginBottom:16,padding:'12px 14px',borderRadius:10,background:'var(--bg2)',border:'1px solid var(--border)'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <div>
                      <div style={{fontSize:11,fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.06em'}}>Median Year Built</div>
                      <div style={{fontSize:22,fontWeight:900,fontFamily:"'Fraunces',serif",color:'var(--text)',letterSpacing:'-0.5px',marginTop:4}}>{medianYearBuilt}</div>
                      <div style={{fontSize:11,color:'var(--muted)',marginTop:2}}>~{age} years old on average</div>
                    </div>
                    <div style={{textAlign:'right'}}>
                      <div style={{fontSize:12,fontWeight:700,color:riskColor}}>{riskLabel}</div>
                      <div style={{fontSize:10,color:'var(--muted)',marginTop:2}}>Older stock = higher capex & maintenance</div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Rent burden */}
            {rentBurdenedPct !== null && (
              <div style={{marginBottom:16}}>
                <div style={{fontSize:11,fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}}>Rent Burden</div>
                <div style={{fontSize:11,color:'var(--muted)',marginBottom:8,lineHeight:1.5}}>
                  <strong style={{color: rentBurdenedPct > 50 ? 'var(--red)' : rentBurdenedPct > 35 ? 'var(--accent2)' : 'var(--text)'}}>{rentBurdenedPct.toFixed(0)}%</strong> of renters spend &gt;30% of income on rent
                  {severelyBurdenedPct !== null && <> · <strong style={{color: severelyBurdenedPct > 25 ? 'var(--red)' : 'var(--text)'}}>{severelyBurdenedPct.toFixed(0)}%</strong> spend &gt;50% (severely burdened)</>}
                </div>
                {/* Simple visual bar */}
                <div style={{height:8,borderRadius:4,background:'var(--border)',overflow:'hidden',display:'flex'}}>
                  <div style={{width:`${Math.min(rentBurdenedPct,100)}%`,background: rentBurdenedPct > 50 ? 'var(--red)' : rentBurdenedPct > 35 ? 'var(--accent2)' : 'var(--green)',borderRadius:4,transition:'width 0.4s ease'}}/>
                </div>
                <div style={{fontSize:10,color:'var(--muted)',marginTop:4}}>High burden (&gt;50%) signals strong rental demand but affordability stress</div>
              </div>
            )}

            {/* Structure type breakdown */}
            {pctSFR !== null && (
              <div>
                <div style={{fontSize:11,fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}}>Units by Structure Type</div>
                {[
                  { label:'Single-Family', pct: pctSFR, color:'var(--accent)' },
                  { label:'2–4 Unit (Small MF)', pct: pctSmMF, color:'var(--refi-amber)' },
                  { label:'5–19 Unit (Mid MF)', pct: pctMedMF, color:'var(--rentcast-indigo)' },
                  { label:'20+ Unit (Large MF)', pct: pctLgMF, color:'var(--muted)' },
                ].map(({label, pct, color}) => pct > 0 ? (
                  <div key={label} style={{marginBottom:8}}>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                      <span style={{fontSize:11,color:'var(--muted)',fontWeight:600}}>{label}</span>
                      <span style={{fontSize:11,fontWeight:800,color:'var(--text)'}}>{pct.toFixed(1)}%</span>
                    </div>
                    <div style={{height:6,borderRadius:3,background:'var(--border)',overflow:'hidden'}}>
                      <div style={{width:`${Math.min(pct,100)}%`,height:'100%',background:color,borderRadius:3,transition:'width 0.4s ease'}}/>
                    </div>
                  </div>
                ) : null)}
                <div style={{fontSize:10,color:'var(--muted)',marginTop:6}}>
                  {pctSmMF !== null && pctSmMF > 0 && <>2–4 unit properties make up <strong>{pctSmMF.toFixed(1)}%</strong> of housing stock · {pctSmMF < 10 ? 'Low MF concentration' : pctSmMF < 25 ? 'Moderate MF market' : 'Strong MF market'}</>}
                </div>
              </div>
            )}
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

      {/* ── LOCAL LABOR MARKET ──────────────────────────────────────────────────────── */}
      {(blsLoading || blsData || blsError) && (
        <Section style={{marginTop:16}}>
          <SectionHeader
            title="👷 Local Labor Market"
            subtitle={
              msaName ? `${msaName} · BLS LAUS` :
              countyName ? `${countyName} · BLS LAUS` :
              'Bureau of Labor Statistics — Local Area Unemployment Statistics'
            }
          />

          {blsLoading && <div style={{fontSize:12,color:'var(--muted)',padding:'8px 0'}}>Loading labor market data…</div>}
          {blsError && !blsData && <div style={{fontSize:12,color:'var(--red)',padding:'8px 0'}}>⚠ {blsError}</div>}

          {!blsLoading && localUnempRate != null && (() => {
            const unempColor = localUnempRate <= 4 ? 'var(--green)' : localUnempRate <= 6 ? 'var(--accent2)' : 'var(--red)';
            const unempLabel = localUnempRate <= 4 ? 'Healthy labor market' : localUnempRate <= 6 ? 'Moderate unemployment' : 'Elevated unemployment';
            return (
              <>
                {/* KPI row */}
                <div style={{display:'flex',gap:12,flexWrap:'wrap',marginBottom:16}}>
                  <MetricCard
                    label="Local Unemployment"
                    value={`${localUnempRate.toFixed(1)}%`}
                    sub={localUnempMonth ? `As of ${localUnempMonth}` : 'Latest available'}
                    highlight
                  />
                  {nationalUnempRate != null && (
                    <MetricCard
                      label="National Rate"
                      value={`${nationalUnempRate.toFixed(1)}%`}
                      sub="US average · FRED"
                    />
                  )}
                  {unempDelta != null && (
                    <MetricCard
                      label="vs. National"
                      value={`${unempDelta > 0 ? '+' : ''}${unempDelta}%`}
                      sub={unempDelta > 0.5 ? 'Above national avg' : unempDelta < -0.5 ? 'Below national avg' : 'Near national avg'}
                    />
                  )}
                </div>

                {/* Risk signal */}
                <div style={{padding:'10px 14px',borderRadius:10,background:'var(--bg2)',border:`1px solid var(--border)`,marginBottom: unempChartData.length > 3 ? 16 : 0}}>
                  <div style={{fontSize:12,fontWeight:700,color:unempColor,marginBottom:3}}>{unempLabel}</div>
                  <div style={{fontSize:11,color:'var(--muted)',lineHeight:1.55}}>
                    {localUnempRate <= 4
                      ? 'Low unemployment signals strong rental demand — workers can afford rent and tenant turnover risk is lower.'
                      : localUnempRate <= 6
                      ? 'Moderate unemployment — monitor local economic conditions. Factor conservative vacancy assumptions.'
                      : 'Elevated unemployment increases vacancy risk and tenant default risk. Stress-test cash flow at higher vacancy rates.'}
                    {unempDelta != null && unempDelta > 1
                      ? ` Local rate is ${unempDelta}% above the national average — above-trend risk.`
                      : unempDelta != null && unempDelta < -1
                      ? ` Local rate is ${Math.abs(unempDelta)}% below the national average — favorable indicator.`
                      : ''}
                  </div>
                </div>

                {/* 24-month trend chart */}
                {unempChartData.length > 3 && (
                  <div style={{marginTop:4}}>
                    <div style={{fontSize:11,fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:10}}>24-Month Trend</div>
                    <ResponsiveContainer width="100%" height={160}>
                      <LineChart data={unempChartData} margin={{top:4,right:16,left:0,bottom:4}}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
                        <XAxis dataKey="date" tick={{fontSize:10,fill:'var(--muted)'}} tickFormatter={v=>v.slice(0,7)}/>
                        <YAxis tick={{fontSize:10,fill:'var(--muted)'}} tickFormatter={v=>`${v}%`} width={36} domain={['auto','auto']}/>
                        <Tooltip content={<ChartTooltip formatter={v=>`${v?.toFixed(1)}%`}/>}/>
                        <Line type="monotone" dataKey="local" stroke="var(--accent)" strokeWidth={2} dot={false} name="Local"/>
                        {unempChartData.some(d=>d.national!=null) && <Line type="monotone" dataKey="national" stroke="var(--muted)" strokeWidth={1.5} dot={false} name="National" strokeDasharray="4 2"/>}
                      </LineChart>
                    </ResponsiveContainer>
                    <div style={{display:'flex',gap:16,justifyContent:'center',marginTop:8}}>
                      <div style={{display:'flex',alignItems:'center',gap:6,fontSize:11,color:'var(--muted)'}}><div style={{width:24,height:2,background:'var(--accent)',borderRadius:2}}/> Local</div>
                      <div style={{display:'flex',alignItems:'center',gap:6,fontSize:11,color:'var(--muted)'}}><div style={{width:24,height:2,background:'var(--muted)',borderRadius:2}}/> National</div>
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </Section>
      )}

      {/* ── INDUSTRY EMPLOYMENT MIX ─────────────────────────────────────── */}
      {(qcewLoading || qcewData) && (
        <Section style={{marginTop:16}}>
          <SectionHeader
            title="🏭 Industry Employment Mix"
            subtitle={`${countyName || 'County'} · QCEW · Bureau of Labor Statistics`}
          />
          {qcewLoading && !qcewData && <div style={{fontSize:12,color:'var(--muted)',padding:'8px 0'}}>Loading employment data…</div>}
          {qcewData && (() => {
            const top = qcewData.sectors.slice(0, 6);
            const topPct = top.reduce((sum, s) => sum + s.pct, 0);
            // Diversification: Herfindahl-like — lower = more diversified
            const hhi = qcewData.sectors.reduce((sum, s) => sum + (s.pct / 100) ** 2, 0);
            const diversified = hhi < 0.15;
            const concentrated = hhi > 0.25;
            const divColor = diversified ? 'var(--green)' : concentrated ? 'var(--red)' : 'var(--accent2)';
            const divLabel = diversified ? 'Diversified economy' : concentrated ? 'Concentrated economy' : 'Moderately diversified';
            // Color palette for sectors (cycle through)
            const sectorColors = ['var(--accent)', 'var(--refi-amber)', 'var(--rentcast-indigo)', 'var(--va-purple)', 'var(--green)', 'var(--muted)'];
            return (
              <>
                <div style={{padding:'10px 14px',borderRadius:10,background:'var(--bg2)',border:'1px solid var(--border)',marginBottom:16}}>
                  <div style={{fontSize:12,fontWeight:700,color:divColor,marginBottom:3}}>{divLabel}</div>
                  <div style={{fontSize:11,color:'var(--muted)',lineHeight:1.55}}>
                    {diversified
                      ? 'Well-diversified economic base reduces vacancy risk — job losses in one sector are offset by others.'
                      : concentrated
                      ? 'Economy is concentrated in few sectors — monitor those industries closely as they drive local rental demand.'
                      : 'Moderate diversification. Review the dominant sectors below for cyclical risk exposure.'}
                  </div>
                </div>

                <div style={{fontSize:11,fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:10}}>
                  Top Sectors · {qcewData.totalEmp.toLocaleString()} total jobs
                </div>
                {top.map((s, i) => (
                  <div key={s.code} style={{marginBottom:10}}>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                      <span style={{fontSize:12,color:'var(--text)',fontWeight:600}}>{s.label}</span>
                      <span style={{fontSize:12,fontWeight:800,color:'var(--text)'}}>{s.pct.toFixed(1)}% <span style={{fontSize:10,color:'var(--muted)',fontWeight:400}}>({s.emp.toLocaleString()} jobs)</span></span>
                    </div>
                    <div style={{height:6,borderRadius:3,background:'var(--border)',overflow:'hidden'}}>
                      <div style={{width:`${Math.min(s.pct,100)}%`,height:'100%',background:sectorColors[i % sectorColors.length],borderRadius:3,transition:'width 0.4s ease'}}/>
                    </div>
                  </div>
                ))}
                {qcewData.sectors.length > 6 && (
                  <div style={{fontSize:10,color:'var(--muted)',marginTop:6}}>+{qcewData.sectors.length - 6} more sectors · top 6 shown · {topPct.toFixed(0)}% of total employment</div>
                )}
              </>
            );
          })()}
        </Section>
      )}

      {/* ── RATE ENVIRONMENT (expanded) ─────────────────────────────────── */}
      <Section style={{marginTop:16}}>
        <SectionHeader
          title="📉 Rate Environment"
          subtitle={lastUpdated ? `30-Yr Fixed · 10-Yr Treasury · Fed Rate · FRED · Updated ${lastUpdated}` : 'Federal Reserve Economic Data (FRED)'}
        />
        {fredLoading && <div style={{fontSize:12,color:'var(--muted)',padding:'8px 0'}}>Loading rate data…</div>}
        {!fredLoading && fredError && (
          <div style={{fontSize:12,color:'var(--red)',padding:'8px 0'}}>⚠ {fredError}</div>
        )}
        {!fredLoading && !fredError && !currentRate && (
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
