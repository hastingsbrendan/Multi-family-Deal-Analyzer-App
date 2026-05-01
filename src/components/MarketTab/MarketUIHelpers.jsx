import React from 'react';

export function SectionHeader({title,subtitle}){return(<div style={{marginBottom:16}}><div style={{fontSize:13,fontWeight:800,color:'var(--text)',letterSpacing:'-0.2px',fontFamily:"'Fraunces',serif"}}>{title}</div>{subtitle&&<div style={{fontSize:11,color:'var(--muted)',marginTop:2}}>{subtitle}</div>}</div>);}

export function StatRow({label,value,sub,accent}){return(<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid var(--border)'}}><div style={{fontSize:12,color:'var(--muted)',fontWeight:600}}>{label}</div><div style={{textAlign:'right'}}><div style={{fontSize:13,fontWeight:800,color:accent?'var(--accent)':'var(--text)'}}>{value}</div>{sub&&<div style={{fontSize:10,color:'var(--muted)',marginTop:1}}>{sub}</div>}</div></div>);}

export function BenchmarkRow({ label, value, accent, natVal, stateVal, format }) {
  const fmt = format || (v => v);
  const hasBench = natVal != null || stateVal != null;
  const sub = hasBench
    ? [stateVal != null ? `State: ${fmt(stateVal)}` : null, natVal != null ? `US: ${fmt(natVal)}` : null]
        .filter(Boolean).join(' · ')
    : null;
  return (
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
      <div style={{fontSize:12,color:'var(--muted)',fontWeight:600}}>{label}</div>
      <div style={{textAlign:'right'}}>
        <div style={{fontSize:13,fontWeight:800,color:accent?'var(--accent)':'var(--text)'}}>{value}</div>
        {sub && <div style={{fontSize:10,color:'var(--muted)',marginTop:1}}>{sub}</div>}
      </div>
    </div>
  );
}

export function MktSection({children,style}){return(<div style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:14,padding:'18px 20px',...style}}>{children}</div>);}

export function MktEmptyState({icon,title,sub}){return(<div style={{textAlign:'center',padding:'32px 16px',color:'var(--muted)'}}><div style={{fontSize:32,marginBottom:8}}>{icon}</div><div style={{fontSize:13,fontWeight:700,color:'var(--text)',marginBottom:4}}>{title}</div><div style={{fontSize:12}}>{sub}</div></div>);}

export function ChartTooltip({active,payload,label,formatter}){if(!active||!payload?.length)return null;return(<div style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px',fontSize:12}}><div style={{color:'var(--muted)',marginBottom:4}}>{label}</div>{payload.map((p,i)=>(<div key={i} style={{color:p.color,fontWeight:700}}>{p.name}: {formatter?formatter(p.value):p.value}</div>))}</div>);}

export function RateCompare({fredRate, dealRate}) {
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
