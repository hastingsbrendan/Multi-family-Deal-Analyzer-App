import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { iSty } from './ui/InputRow';
import { FMT_USD } from '../lib/constants';;
import { useIsMobile } from '../lib/hooks';
import PhotoGallery from './PhotoGallery';

function calcRehabTotal(showing,numUnits,phase){let t=0;for(let i=0;i<numUnits;i++){const u=(showing.units||[])[i]||{};if(u.rehabMode==="items")t+=(u.lineItems||[]).filter(li=>li.phase===phase).reduce((s,li)=>s+(+li.cost||0),0);else if((u.rehabPhase||"1")===phase)t+=+u.rehabLump||0;}const ext=showing.exterior||{};if(ext.rehabMode==="items")t+=(ext.lineItems||[]).filter(li=>li.phase===phase).reduce((s,li)=>s+(+li.cost||0),0);else if((ext.rehabPhase||"1")===phase)t+=+ext.rehabLump||0;return t;}
function ShowingTab({deal,onChange}){
  const numUnits=deal.assumptions.numUnits;
  const showing=deal.showing||{};
  const IMPR=[{val:"",label:"— Select —",color:"var(--muted)"},{val:"strong_pass",label:"Strong Pass",color:"var(--red)"},{val:"pass",label:"Pass",color:"#f97316"},{val:"neutral",label:"Neutral",color:"#8b949e"},{val:"like",label:"Like",color:"#3b82f6"},{val:"strong_like",label:"Strong Like",color:"var(--green)"}];
  const COND_OPTS=["","Turnkey","Minor Updates","Moderate Rehab","Full Gut"];
  const COND_CLR={Turnkey:"#10b981","Minor Updates":"#3b82f6","Moderate Rehab":"#f59e0b","Full Gut":"#ef4444"};
  const PH=["1","2","3"];
  const PH_LABEL={"1":"Repairs at Closing","2":"Repair w/in 2 Yrs","3":"Defer"};
  const DEF_UNIT=[{cat:"Flooring",cost:0,phase:"1"},{cat:"Kitchen",cost:0,phase:"1"},{cat:"Bathrooms",cost:0,phase:"1"},{cat:"Paint",cost:0,phase:"1"},{cat:"Appliances",cost:0,phase:"1"},{cat:"Electrical",cost:0,phase:"1"},{cat:"Plumbing",cost:0,phase:"1"},{cat:"HVAC",cost:0,phase:"1"},{cat:"Roof",cost:0,phase:"1"},{cat:"Windows",cost:0,phase:"1"},{cat:"Other",cost:0,phase:"1",customLabel:""}];
  const REHAB_HINTS={Flooring:'2K–8K typical',Kitchen:'5K–25K typical',Bathrooms:'3K–12K typical',Paint:'1K–4K typical',Appliances:'1K–5K typical',Electrical:'1K–8K typical',Plumbing:'1K–6K typical',HVAC:'3K–12K typical',Roof:'5K–20K typical',Windows:'3K–15K typical',Other:'custom amount',Siding:'3K–15K typical',Foundation:'2K–20K typical',Landscaping:'1K–5K typical','Driveway/Parking':'2K–8K typical','Windows/Doors':'3K–12K typical'};
  const DEF_EXT=[{cat:"Roof",cost:0,phase:"1"},{cat:"Siding",cost:0,phase:"1"},{cat:"Foundation",cost:0,phase:"1"},{cat:"Landscaping",cost:0,phase:"1"},{cat:"Driveway/Parking",cost:0,phase:"1"},{cat:"Windows/Doors",cost:0,phase:"1"},{cat:"Other",cost:0,phase:"1",customLabel:""}];
  const upd=(fn)=>{
    const d=JSON.parse(JSON.stringify(deal));
    if(!d.showing)d.showing={};
    if(!d.showing.units||!Array.isArray(d.showing.units))d.showing.units=Array(4).fill(null).map(()=>({condition:"",notes:"",rehabMode:"lump",rehabLump:0,rehabPhase:"1",lineItems:[]}));
    if(!d.showing.exterior)d.showing.exterior={condition:"",notes:"",rehabMode:"lump",rehabLump:0,rehabPhase:"1",lineItems:[]};
    fn(d);
    const p1=calcRehabTotal(d.showing,d.assumptions.numUnits,"1");
    if(!d.assumptions.valueAdd)d.assumptions.valueAdd={};
    d.assumptions.valueAdd.reModelCost=p1;
    onChange(d);
  };
  const imp=(deal.showing||{}).impression||"";
  const impObj=IMPR.find(o=>o.val===imp)||IMPR[0];
  const pt=PH.reduce((a,p)=>{a[p]=calcRehabTotal(deal.showing||{},numUnits,p);return a;},{});
  const gt=PH.reduce((s,p)=>s+(pt[p]||0),0);
  const iSty={background:"var(--input-bg)",border:"1px solid var(--border)",borderRadius:100,padding:"7px 10px",fontSize:13,color:"var(--text)",width:"100%",fontFamily:"inherit"};
  const cSty={background:"var(--card)",borderRadius:10,border:"1px solid var(--border)",padding:16,marginBottom:16};
  const lSty={fontSize:12,color:"var(--muted)",fontWeight:600,marginBottom:6,display:"block"};

  const renderRehab=(isUnit,idx)=>{
    const sh=deal.showing||{};
    const units=Array.isArray(sh.units)?sh.units:[];
    const s=isUnit?(units[idx]||{}):(sh.exterior||{});
    const isIt=s.rehabMode==="items";
    const items=s.lineItems||[];
    const setMode=(v)=>upd(d=>{
      const sec=isUnit?d.showing.units[idx]:d.showing.exterior;
      if(!sec)return;
      sec.rehabMode=v;
      if(v==="items"&&(!sec.lineItems||sec.lineItems.length===0))
        sec.lineItems=isUnit?DEF_UNIT.map(x=>({...x})):DEF_EXT.map(x=>({...x}));
    });
    const setField=(f,v)=>upd(d=>{const sec=isUnit?d.showing.units[idx]:d.showing.exterior;if(sec)sec[f]=v;});
    const setLI=(lIdx,f,v)=>upd(d=>{const it=isUnit?d.showing.units[idx].lineItems:d.showing.exterior.lineItems;if(it&&it[lIdx])it[lIdx][f]=v;});
    const setAll=(p)=>upd(d=>{const it=isUnit?d.showing.units[idx].lineItems:d.showing.exterior.lineItems;(it||[]).forEach(li=>li.phase=p);});
    return(<div style={{borderTop:"1px solid var(--border)",paddingTop:12,marginTop:4}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
        <span style={{fontSize:12,fontWeight:700,color:"var(--muted)"}}>Rehab Estimate</span>
        <label style={{fontSize:11,color:"var(--muted)",display:"flex",alignItems:"center",gap:6,cursor:"pointer"}}>
          <input type="checkbox" checked={isIt} onChange={e=>setMode(e.target.checked?"items":"lump")}/> Line items
        </label>
      </div>
      {!isIt?(<div style={{display:"grid",gridTemplateColumns:"1fr 100px",gap:8}}>
        <input type="number" value={s.rehabLump||""} onChange={e=>setField("rehabLump",+e.target.value)} placeholder="0" style={iSty}/>
        <select value={s.rehabPhase||"1"} onChange={e=>setField("rehabPhase",e.target.value)} style={{...iSty,width:"auto"}}>{PH.map(p=><option key={p} value={p}>{PH_LABEL[p]}</option>)}</select>
      </div>):(<div>
        <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:8}}>
          <span style={{fontSize:11,color:"var(--muted)"}}>Set all:</span>
          {PH.map(p=><button key={p} onClick={()=>setAll(p)} style={{fontSize:10,padding:"2px 8px",borderRadius:4,border:"1px solid var(--border)",background:"var(--card)",color:"var(--muted)",cursor:"pointer"}}>{PH_LABEL[p]}</button>)}
        </div>
        {items.map((li,lIdx)=>(
          <div key={lIdx} style={{display:"grid",gridTemplateColumns:li.cat==="Other"?"1fr 80px 70px":"auto 80px 70px",gap:5,marginBottom:5,alignItems:"center"}}>
            {li.cat==="Other"?<input value={li.customLabel||""} onChange={e=>setLI(lIdx,"customLabel",e.target.value)} placeholder="Custom category…" style={{...iSty,fontSize:11}}/>:<span style={{fontSize:12,color:"var(--text)"}}>{li.cat}</span>}
            <input type="number" value={li.cost||""} onChange={e=>setLI(lIdx,"cost",+e.target.value)} placeholder={REHAB_HINTS[li.cat]||'0'} style={{...iSty,fontSize:11}}/>
            <select value={li.phase||"1"} onChange={e=>setLI(lIdx,"phase",e.target.value)} style={{...iSty,fontSize:11,padding:"7px 3px"}}>{PH.map(p=><option key={p} value={p}>{PH_LABEL[p]}</option>)}</select>
          </div>
        ))}
      </div>)}
    </div>);
  };

  return(<div style={{padding:"16px 0"}}>
    <div style={cSty}>
      <label style={lSty}>Overall Impression</label>
      <select value={imp} onChange={e=>upd(d=>{d.showing.impression=e.target.value;})} style={{...iSty,color:impObj.color,fontWeight:700,fontSize:14}}>
        {IMPR.map(o=><option key={o.val} value={o.val}>{o.label}</option>)}
      </select>
    </div>
    {Array.from({length:numUnits}).map((_,i)=>{
      const _units=Array.isArray((deal.showing||{}).units)?(deal.showing.units):[];
      const u=_units[i]||{};const cond=u.condition||"";
      return(<div key={i} style={cSty}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
          <span style={{fontWeight:800,fontSize:14,color:"var(--text)"}}>Unit {i+1}</span>
          {cond&&<span style={{fontSize:11,fontWeight:700,padding:"2px 10px",borderRadius:12,background:(COND_CLR[cond]||"#8b949e")+"22",color:COND_CLR[cond]||"#8b949e"}}>{cond}</span>}
        </div>
        <label style={lSty}>Condition</label>
        <select value={cond} onChange={e=>upd(d=>{if(!d.showing.units[i])d.showing.units[i]={};d.showing.units[i].condition=e.target.value;})} style={{...iSty,color:COND_CLR[cond]||"var(--text)",fontWeight:cond?700:400,marginBottom:10}}>
          {COND_OPTS.map(o=><option key={o} value={o}>{o||"— Select —"}</option>)}
        </select>
        <label style={lSty}>Notes</label>
        <textarea value={u.notes||""} onChange={e=>upd(d=>{if(!d.showing.units[i])d.showing.units[i]={};d.showing.units[i].notes=e.target.value;})} rows={3} placeholder="Unit condition, features, tenant situation…" style={{...iSty,resize:"vertical",marginBottom:12}}/>
        {renderRehab(true,i)}
        <PhotoGallery deal={deal} onUpdate={onChange} context={`unit_${i}`} contextLabel={`Unit ${i+1}`}/>
      </div>);
    })}
    {(()=>{const ext=((deal.showing||{}).exterior)||{};const cond=ext.condition||"";return(<div style={cSty}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
        <span style={{fontWeight:800,fontSize:14,color:"var(--text)"}}>Exterior</span>
        {cond&&<span style={{fontSize:11,fontWeight:700,padding:"2px 10px",borderRadius:12,background:(COND_CLR[cond]||"#8b949e")+"22",color:COND_CLR[cond]||"#8b949e"}}>{cond}</span>}
      </div>
      <label style={lSty}>Condition</label>
      <select value={cond} onChange={e=>upd(d=>{if(!d.showing.exterior)d.showing.exterior={};d.showing.exterior.condition=e.target.value;})} style={{...iSty,color:COND_CLR[cond]||"var(--text)",fontWeight:cond?700:400,marginBottom:10}}>
        {COND_OPTS.map(o=><option key={o} value={o}>{o||"— Select —"}</option>)}
      </select>
      <label style={lSty}>Notes</label>
      <textarea value={ext.notes||""} onChange={e=>upd(d=>{if(!d.showing.exterior)d.showing.exterior={};d.showing.exterior.notes=e.target.value;})} rows={3} placeholder="Roof, foundation, siding, landscaping, parking…" style={{...iSty,resize:"vertical",marginBottom:12}}/>
      {renderRehab(false,-1)}
      <PhotoGallery deal={deal} onUpdate={onChange} context="exterior" contextLabel="Exterior"/>
    </div>);})()}
    <div style={{...cSty,background:"var(--accent-soft)",border:"1px solid var(--accent)44"}}>
      <span style={{fontWeight:800,fontSize:13,color:"var(--text)",display:"block",marginBottom:12}}>Rehab Rollup</span>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:12}}>
        {PH.map(p=>(<div key={p} style={{textAlign:"center",background:"var(--card)",borderRadius:8,padding:"10px 6px",border:"1px solid var(--border)"}}>
          <div style={{fontSize:10,color:"var(--muted)",fontWeight:700,marginBottom:4,letterSpacing:"0.04em"}}>{PH_LABEL[p]}{p==="1"?" · VA Remodel":""}</div>
          <div style={{fontSize:16,fontWeight:800,color:p==="1"?"var(--accent)":"var(--text)"}}>{"$"+Math.round(pt[p]||0).toLocaleString()}</div>
        </div>))}
      </div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",borderTop:"1px solid var(--border)",paddingTop:10}}>
        <span style={{fontSize:13,fontWeight:700,color:"var(--muted)"}}>Total All Phases</span>
        <span style={{fontSize:18,fontWeight:800,color:"var(--text)"}}>{"$"+Math.round(gt).toLocaleString()}</span>
      </div>
      <div style={{fontSize:11,color:"var(--muted)",marginTop:8}}>⚡ "Repairs at Closing" auto-syncs → Value-Add Remodel Cost in Assumptions</div>
    </div>
  </div>);
}

export { calcRehabTotal };
export default ShowingTab;
