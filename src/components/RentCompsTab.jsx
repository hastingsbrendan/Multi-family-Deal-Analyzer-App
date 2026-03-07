import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { iSty, srcSty } from './ui/InputRow';
import MetricCard from './ui/MetricCard';
import AddressAutocomplete from './AddressAutocomplete';
import { FMT_USD, RENTCAST_KEY, GMAPS_KEY } from '../lib/constants';;
import { useIsMobile } from '../lib/hooks';

function RentCompsTab({deal,onChange}){
  const isMobile=useIsMobile();
  const numUnits=deal.assumptions.numUnits;
  const inPlaceRents=deal.assumptions.units.slice(0,numUnits).map(u=>+u.rent||0);
  const inPlaceAvg=inPlaceRents.reduce((s,v)=>s+v,0)/numUnits;
  const compAvgs=deal.comps.map(c=>{const rents=Array.from({length:numUnits},(_,i)=>+(c.units[i]?.rent)||0).filter(r=>r>0);return rents.length?rents.reduce((s,v)=>s+v,0)/rents.length:0;});
  const overallAvg=compAvgs.filter(v=>v>0).length?compAvgs.filter(v=>v>0).reduce((s,v)=>s+v,0)/compAvgs.filter(v=>v>0).length:0;
  const updComp=(ci,field,val)=>{const d=JSON.parse(JSON.stringify(deal));d.comps[ci][field]=val;onChange(d);};
  const updUnit=(ci,ui,field,val)=>{const d=JSON.parse(JSON.stringify(deal));if(!d.comps[ci].units[ui])d.comps[ci].units[ui]={rent:0};d.comps[ci].units[ui][field]=val;onChange(d);};
  if(isMobile){return(<div style={{padding:"16px 0"}}>
    <div style={{display:"flex",gap:10,marginBottom:20,flexWrap:"wrap"}}>
      <MetricCard label="In-Place Avg/Unit" value={FMT_USD(inPlaceAvg)} sub="per month"/>
      <MetricCard label="Comp Avg/Unit" value={overallAvg?FMT_USD(overallAvg):"—"} sub={compAvgs.filter(v=>v>0).length+" comps"} highlight={overallAvg>0}/>
      {overallAvg>0&&<MetricCard label="Spread vs Market" value={FMT_USD(overallAvg-inPlaceAvg)} sub={overallAvg>inPlaceAvg?"↑ upside":"✓ at market"}/>}
    </div>
    {deal.comps.map((c,ci)=>(<div key={ci} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:14,marginBottom:12}}>
      <div style={{fontSize:11,fontWeight:800,color:"var(--muted)",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:10}}>Comp {ci+1}</div>
      <div style={{marginBottom:8}}><div style={{fontSize:11,color:"var(--muted)",marginBottom:3}}>Address</div><AddressAutocomplete value={c.address||""} onChange={v=>updComp(ci,"address",v)} placeholder="123 Main St" inputStyle={iSty}/></div>
      <div style={{marginBottom:8}}><div style={{fontSize:11,color:"var(--muted)",marginBottom:3}}>Source</div><input value={c.source||""} onChange={e=>updComp(ci,"source",e.target.value)} placeholder="Zillow, MLS, broker" style={{...iSty,fontSize:12}}/></div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:8}}>{Array.from({length:numUnits}).map((_,ui)=>(<div key={ui} style={{flex:"1 1 100px"}}><div style={{fontSize:11,color:"var(--muted)",marginBottom:3}}>Unit {ui+1} Rent</div><div style={{display:"flex",alignItems:"center",gap:3}}><span style={{fontSize:12,color:"var(--muted)"}}>$</span><input type="number" value={c.units[ui]?.rent||0} onChange={e=>updUnit(ci,ui,"rent",e.target.value)} style={iSty}/></div></div>))}</div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:12}}><div><span style={{color:"var(--muted)"}}>Avg: </span><strong style={{color:"var(--accent)"}}>{compAvgs[ci]>0?FMT_USD(compAvgs[ci]):"—"}</strong></div><input value={c.distance||""} onChange={e=>updComp(ci,"distance",e.target.value)} placeholder="0.5 mi" style={{...iSty,width:120,fontSize:12}}/></div>
    </div>))}
  </div>);}
  const TH={padding:"8px 10px",fontWeight:700,fontSize:11,letterSpacing:"0.06em",color:"var(--muted)",textTransform:"uppercase",borderBottom:"1px solid var(--border)",background:"var(--table-head)",whiteSpace:"nowrap"};
  const LC={padding:"8px 10px",fontSize:12,color:"var(--muted)",fontWeight:600,background:"var(--table-head)",borderRight:"1px solid var(--border)",whiteSpace:"nowrap"};
  return(<div style={{padding:"16px 0"}}>
    <div style={{display:"flex",gap:12,marginBottom:20,flexWrap:"wrap"}}>
      <MetricCard label="In-Place Avg Rent/Unit" value={FMT_USD(inPlaceAvg)} sub="per month"/>
      <MetricCard label="Comp Avg Rent/Unit" value={overallAvg?FMT_USD(overallAvg):"—"} sub={compAvgs.filter(v=>v>0).length+" active comps"} highlight={overallAvg>0}/>
      {overallAvg>0&&<MetricCard label="Spread vs. Market" value={FMT_USD(overallAvg-inPlaceAvg)} sub={overallAvg>inPlaceAvg?"↑ rent upside":"✓ at/above market"}/>}
    </div>
    <div style={{overflowX:"auto"}}><table style={{borderCollapse:"collapse",fontSize:12,minWidth:900}}>
      <thead><tr><th style={{...TH,textAlign:"left",minWidth:150}}>Field</th><th style={{...TH,textAlign:"left",minWidth:160}}>Subject Property</th>{deal.comps.map((_,i)=><th key={i} style={{...TH,textAlign:"left",minWidth:190}}>Comp {i+1}</th>)}</tr></thead>
      <tbody>
        <tr><td style={LC}>Address</td><td style={{padding:"6px 10px",fontSize:12,color:"var(--text)",fontWeight:600}}>{deal.address||<em style={{color:"var(--muted)"}}>Subject property</em>}</td>{deal.comps.map((c,ci)=><td key={ci} style={{padding:"4px 6px"}}><AddressAutocomplete value={c.address||""} onChange={v=>updComp(ci,"address",v)} placeholder="123 Main St" inputStyle={{...iSty,fontSize:12}}/></td>)}</tr>
        <tr style={{background:"var(--row-sub)"}}><td style={{...LC,fontSize:11,fontStyle:"italic"}}>↳ Source</td><td style={{padding:"3px 6px"}}/>{deal.comps.map((c,ci)=>(<td key={ci} style={{padding:"3px 6px"}}><input value={c.source||""} onChange={e=>updComp(ci,"source",e.target.value)} placeholder="Zillow, MLS, broker" style={{...srcSty,fontSize:11}}/></td>))}</tr>
        {Array.from({length:numUnits}).map((_,ui)=>(<tr key={"u"+ui}><td style={LC}>Unit {ui+1} Rent/mo</td><td style={{padding:"6px 10px",color:"var(--accent)",fontWeight:800}}>{FMT_USD(inPlaceRents[ui])}</td>{deal.comps.map((c,ci)=>(<td key={ci} style={{padding:"4px 6px"}}><div style={{display:"flex",alignItems:"center",gap:3}}><span style={{color:"var(--muted)",fontSize:12}}>$</span><input type="number" value={c.units[ui]?.rent||0} onChange={e=>updUnit(ci,ui,"rent",e.target.value)} style={{...iSty,fontSize:12}}/></div></td>))}</tr>))}
        <tr style={{background:"var(--accent-soft)",borderTop:"2px solid var(--accent)"}}><td style={{...LC,color:"var(--accent)"}}>Avg Rent / Unit</td><td style={{padding:"7px 10px",color:"var(--accent)",fontWeight:800,fontSize:13}}>{FMT_USD(inPlaceAvg)}</td>{deal.comps.map((_,ci)=><td key={ci} style={{padding:"7px 10px",color:"var(--accent)",fontWeight:800,fontSize:13}}>{compAvgs[ci]>0?FMT_USD(compAvgs[ci]):"—"}</td>)}</tr>
        <tr><td style={LC}>Distance from Subject</td><td style={{padding:"6px 10px",color:"var(--muted)",fontSize:12}}>—</td>{deal.comps.map((c,ci)=><td key={ci} style={{padding:"4px 6px"}}><input value={c.distance||""} onChange={e=>updComp(ci,"distance",e.target.value)} placeholder="0.5 mi" style={{...iSty,fontSize:12}}/></td>)}</tr>
      </tbody>
    </table></div>
  </div>);
}

// ─── SHOWING TAB ──────────────────────────────────────────────────────────────

export default RentCompsTab;
