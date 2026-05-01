export const CENSUS_VARS = 'B19013_001E,B25003_001E,B25003_002E,B25003_003E,B25002_001E,B25002_003E,B01002_001E,B01003_001E,B25064_001E,B25070_001E,B25070_007E,B25070_008E,B25070_009E,B25070_010E,B25070_011E,B25077_001E,B25035_001E,B25024_001E,B25024_002E,B25024_003E,B25024_004E,B25024_005E,B25024_006E,B25024_007E,B25024_008E,B25024_009E,B23025_002E,B23025_005E,B17001_001E,B17001_002E,B15003_001E,B15003_022E,B15003_023E,B15003_024E,B15003_025E';
export const FRED_BATCH = 'MORTGAGE30US,DGS10,DFEDTARU,CUUR0000SEHA,CSUSHPINSA,UNRATE';
export const SPREAD_HIST_AVG = 1.7;

export const QCEW_SUPERSECTORS = [
  { code: '10', label: 'Natural Resources & Mining' },
  { code: '20', label: 'Construction' },
  { code: '30', label: 'Manufacturing' },
  { code: '40', label: 'Trade, Transport & Utilities' },
  { code: '50', label: 'Information' },
  { code: '55', label: 'Financial Activities' },
  { code: '60', label: 'Professional & Business Services' },
  { code: '65', label: 'Education & Health Services' },
  { code: '70', label: 'Leisure & Hospitality' },
  { code: '80', label: 'Other Services' },
  { code: '90', label: 'Government' },
];

export function buildLausSeriesId(stateFips, countyFips3) {
  return `LAUCA${stateFips}${countyFips3}0000000000003`;
}

export function parseBlsObs(seriesData) {
  if (!seriesData?.data) return [];
  return seriesData.data
    .filter(d => d.value !== '-')
    .map(d => ({ date: `${d.year}-${d.period.replace('M','')}`, value: +d.value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function buildQcewSeriesId(stateFips, countyFips3, supersectorCode) {
  return `ENU${stateFips}${countyFips3}10${supersectorCode}`;
}

export function buildTotalQcewSeriesId(stateFips, countyFips3) {
  return `ENU${stateFips}${countyFips3}10`;
}

export function floodZoneInfo(zone){
  if(!zone)return null;
  const z=zone.toUpperCase();
  if(z==='X'||z==='X500')return{risk:'low',label:`Zone ${zone}`,color:'var(--green)',bg:'rgba(16,185,129,0.08)',desc:'Minimal flood risk — outside 500-year floodplain'};
  if(z.startsWith('V'))return{risk:'critical',label:`Zone ${zone}`,color:'var(--red)',bg:'rgba(239,68,68,0.08)',desc:'Coastal high-risk — mandatory flood insurance likely required'};
  if(z.startsWith('A'))return{risk:'high',label:`Zone ${zone}`,color:'var(--refi-amber)',bg:'rgba(245,158,11,0.08)',desc:'High-risk flood zone — flood insurance typically required by lenders'};
  if(z==='D')return{risk:'unknown',label:`Zone ${zone}`,color:'var(--rentcast-indigo)',bg:'rgba(99,102,241,0.08)',desc:'Undetermined flood risk — possible but not assessed by FEMA'};
  return{risk:'moderate',label:`Zone ${zone}`,color:'var(--refi-amber)',bg:'rgba(245,158,11,0.08)',desc:'Moderate-to-low flood risk'};
}

export function parseFredObs(obs=[]) {
  return obs
    .filter(o => o.value !== '.' && +o.value > 0)
    .map(o => ({ date: o.date, value: +o.value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function latest(obs) { return obs.length ? obs[obs.length - 1] : null; }

export function yoyPct(obs, periodsBack = 12) {
  if (obs.length < 2) return null;
  const now = obs[obs.length - 1].value;
  const then = obs[Math.max(0, obs.length - periodsBack - 1)].value;
  return then > 0 ? +((now / then - 1) * 100).toFixed(2) : null;
}

export function deltaWeekly(obs, weeksBack = 52) {
  if (obs.length < 2) return null;
  const now = obs[obs.length - 1].value;
  const then = obs[Math.max(0, obs.length - weeksBack - 1)].value;
  return +((now - then).toFixed(2));
}

export function extractZip(address){if(!address)return null;const m=address.match(/\b(\d{5})\b/);return m?m[1]:null;}

export function parseCensusObj(raw) {
  if (!raw || raw.length < 2) return null;
  const h = raw[0], v = raw[1], obj = {};
  h.forEach((k, i) => { obj[k] = v[i]; });
  return obj;
}

export function deriveCensusMetrics(cd) {
  if (!cd) return null;
  const totalOcc   = +cd['B25003_001E'];
  const renterOcc  = +cd['B25003_003E'];
  const totalUnits = +cd['B25002_001E'];
  const vacantUnits= +cd['B25002_003E'];
  const laborForce = +cd['B23025_002E'];
  const unemployed = +cd['B23025_005E'];
  const povertyTot = +cd['B17001_001E'];
  const belowPov   = +cd['B17001_002E'];
  const eduTotal   = +cd['B15003_001E'];
  const eduCollege = +cd['B15003_022E'] + +cd['B15003_023E'] + +cd['B15003_024E'] + +cd['B15003_025E'];
  return {
    income:       +cd['B19013_001E'] || null,
    medianAge:    +cd['B01002_001E'] || null,
    renterPct:    totalOcc > 0 ? (renterOcc / totalOcc) * 100 : null,
    vacancyPct:   totalUnits > 0 ? (vacantUnits / totalUnits) * 100 : null,
    unempRate:    laborForce > 0 ? (unemployed / laborForce) * 100 : null,
    povertyRate:  povertyTot > 0 ? (belowPov / povertyTot) * 100 : null,
    medianGrossRent:  +cd['B25064_001E'] || null,
    medianHomeValue:  +cd['B25077_001E'] || null,
    collegePlusPct: eduTotal > 0 ? (eduCollege / eduTotal) * 100 : null,
  };
}
