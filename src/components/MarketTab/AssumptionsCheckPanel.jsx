import React from 'react';
import { yoyPct } from './marketHelpers';

export default function AssumptionsCheckPanel({ deal, fredAllData }) {
  if (!deal || !fredAllData) return null;
  const { rentCPI, hpi } = fredAllData;
  const a = deal.assumptions;

  const rentYoY = rentCPI ? yoyPct(rentCPI, 12) : null;
  const hpiYoY  = hpi     ? yoyPct(hpi, 12)     : null;

  const dealRentGrowth = +a.rentGrowth || 0;
  const dealAppreciation = +a.appreciationRate || 0;

  if (rentYoY === null && hpiYoY === null) return null;

  const Check = ({ label, dealVal, marketVal, unit, higherIsOptimistic = true, note }) => {
    if (marketVal === null) return null;
    const diff = dealVal - marketVal;
    const isOptimistic   = higherIsOptimistic ? diff >  0.5 : diff < -0.5;
    const isConservative = higherIsOptimistic ? diff < -0.5 : diff >  0.5;
    const color = isOptimistic ? 'var(--accent2)' : isConservative ? 'var(--green)' : 'var(--accent)';
    const icon  = isOptimistic ? '⚠️' : isConservative ? '✅' : '✓';
    const verdict = isOptimistic
      ? `Your assumption (${dealVal}${unit}) is above the current national rate (${marketVal}${unit}) — may be optimistic`
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
        higherIsOptimistic={true}
        note="CPI Rent is a national trailing average — local markets may differ"
      />
      <Check
        label="Appreciation assumption"
        dealVal={dealAppreciation}
        marketVal={hpiYoY}
        unit="%/yr"
        higherIsOptimistic={true}
        note="Case-Shiller measures past appreciation — not a forward forecast"
      />
      <div style={{fontSize:10,color:'var(--muted)',marginTop:10,lineHeight:1.5}}>
        National benchmarks sourced from FRED (Bureau of Labor Statistics + S&P CoreLogic). Local market conditions may differ significantly.
      </div>
    </div>
  );
}
