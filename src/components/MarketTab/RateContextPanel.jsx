import React from 'react';
import { latest, yoyPct, SPREAD_HIST_AVG } from './marketHelpers';

export default function RateContextPanel({ fredAllData }) {
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
