import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { FMT_USD, FMT_PCT, mapsUrl } from '../lib/constants';
import { resolveExpenses } from '../lib/calc';
import { useIsMobile } from '../lib/hooks';
import InputRow, { iSty, btnSm, srcSty, fmtInputDisplay, parseInputValue, Tip } from './ui/InputRow';
import Section from './ui/Section';
import FmtInt from './ui/FmtInt';
import CollapsibleSection from './ui/CollapsibleSection';
import PropertyLookupPanel from './AssumptionsTab/PropertyLookupPanel';
import { getStateOptions } from '../lib/taxEngine';

function ExpenseInputRow({lbl, modeToggle, isItemPct, rawVal, onChange, mobile, tip}) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState('');
  const displayVal = focused
    ? draft
    : fmtInputDisplay(rawVal);
  const handleFocus = () => { setFocused(true); setDraft(rawVal === 0 ? '' : String(rawVal).replace(/,/g,'')); };
  const handleBlur = () => { setFocused(false); onChange(parseInputValue(draft)); };
  const handleChange = e => setDraft(e.target.value);
  if(mobile){return(
    <div style={{padding:"10px 0",borderBottom:"1px solid var(--border-faint)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
        <label style={{fontSize:"var(--text-sm)",color:"var(--muted)",fontWeight:600,display:"flex",alignItems:"center"}}>{lbl}{tip&&<Tip text={tip}/>}</label>{modeToggle}
      </div>
      <div style={{display:"flex",alignItems:"center",gap:4}}>
        {!isItemPct&&<span style={{fontSize:"var(--text-sm)",color:"var(--muted)"}}>$</span>}
        <input type="text" inputMode="decimal" value={displayVal} onChange={handleChange} onFocus={handleFocus} onBlur={handleBlur} placeholder="0" style={iSty}/>
        <span style={{fontSize:12,color:"var(--muted)",whiteSpace:"nowrap",flexShrink:0,marginLeft:2}}>{isItemPct?"% rent":"/yr"}</span>
      </div>
    </div>
  );}
  return(
    <div style={{display:"grid",gridTemplateColumns:"200px auto 1fr",gap:8,alignItems:"center",padding:"5px 0",borderBottom:"1px solid var(--border-faint)"}}>
      <label style={{fontSize:"var(--text-sm)",color:"var(--muted)",fontWeight:500,display:"flex",alignItems:"center"}}>{lbl}{tip&&<Tip text={tip}/>}</label>
      {modeToggle}
      <div style={{display:"flex",alignItems:"center",gap:4}}>
        {!isItemPct&&<span style={{fontSize:"var(--text-sm)",color:"var(--muted)"}}>$</span>}
        <input type="text" inputMode="decimal" value={displayVal} onChange={handleChange} onFocus={handleFocus} onBlur={handleBlur} placeholder="0" style={iSty}/>
        <span style={{fontSize:"var(--text-sm)",color:"var(--muted)",whiteSpace:"nowrap"}}>{isItemPct?"% of rent":"/yr"}</span>
      </div>
    </div>
  );
}


// ─── ASSUMPTIONS TAB ──────────────────────────────────────────────────────────

function AssumptionsTab({deal,onChange}){
  const a=deal.assumptions;
  const isMobile=useIsMobile();
  // Quick/Advanced split (2026-06 UX audit): brand-new deals (no rents yet) hide
  // the advanced sections behind one expander so the first-run form is ~5 sections
  // instead of 10. Deals with data default to expanded.
  const [showAdvanced,setShowAdvanced]=useState(()=>{
    const n=deal?.assumptions?.numUnits||2;
    return (deal?.assumptions?.units||[]).slice(0,n).some(u=>+(u?.rent||u?.listedRent)>0);
  });
  // Hoisted from the Advanced Tax IIFE — hooks may not live inside the
  // conditionally-rendered advanced block (Rules of Hooks)
  const [taxOpen, setTaxOpen] = useState(false);
  const upd=(path,val)=>{const d=structuredClone(deal);const parts=path.split(".");let obj=d.assumptions;for(let i=0;i<parts.length-1;i++){if(obj[parts[i]]==null||typeof obj[parts[i]]!=="object")obj[parts[i]]={};obj=obj[parts[i]];}obj[parts[parts.length-1]]=val;onChange(d);};
  // Auto-populate state from deal.address whenever address changes and state is not yet set.
  // Matches the 2-letter state code from formatted addresses like "123 Main St, Chicago, IL 60601".
  useEffect(() => {
    if (!a.state && deal.address) {
      const m = deal.address.match(/,\s*([A-Z]{2})(?:\s+\d{5}|,\s*\d{5}|$)/);
      if (m) upd('state', m[1]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deal.address]);

  const grossRentYear0=a.units.slice(0,a.numUnits).reduce((s,u)=>s+(+u.rent||0)*12,0);
  const expFields=[["propertyTax","propertyTaxPct","Property Tax"],["insurance","insurancePct","Property Insurance"],["maintenance","maintenancePct","Maintenance"],["capex","capexPct","CapEx Reserve"],["propertyMgmt","propertyMgmtPct","Property Management"],["utilities","utilitiesPct","Utilities"]];
  const expTips={
    propertyTax:"Annual property tax bill. Check your county assessor's website for the actual amount — it's often lower than the listing estimate.",
    maintenance:"Ongoing repairs like plumbing leaks, appliances, and paint. Rule of thumb: 1% of purchase price per year, split across units.",
    capex:"Capital expenditure reserve — saving now for big-ticket replacements (roof, HVAC, water heater). Typically 1–1.5% of purchase price/yr.",
    propertyMgmt:"Fee paid to a property manager, usually 8–10% of collected rent. Set to $0 if you self-manage.",
    utilities:"Owner-paid utilities like water, trash, or common-area electric. Typically $0 if each unit has separate meters.",
  };
  return(<div style={{padding:"16px 0"}}>
    <PropertyLookupPanel deal={deal} onChange={onChange}/>
    <Section title="Property Details">
      {(()=>{
        // Comma-formatted integer inputs (sqft, lot)

        // Property Tax mode toggle (mirrors Expenses section)
        const ptMode = (a.expenseModes?.propertyTax) || "value";
        const isPtPct = ptMode === "pct";
        const togglePtMode = () => {
          const d = structuredClone(deal);
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
                <button onClick={()=>{if(a.numUnits>2)upd("numUnits",a.numUnits-1);}} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:"var(--r-pill)",width:28,height:28,cursor:"pointer",color:"var(--text)",fontSize:"var(--text-md)",display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
                <span style={{fontWeight:700,fontSize:15,minWidth:20,textAlign:"center"}}>{a.numUnits}</span>
                <button onClick={()=>{if(a.numUnits<4)upd("numUnits",a.numUnits+1);}} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:"var(--r-pill)",width:28,height:28,cursor:"pointer",color:"var(--text)",fontSize:"var(--text-md)",display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
              </div>
            </div>
            {/* Purchase Price */}
            <div style={{marginBottom:10}}>
              <div style={{fontSize:10,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>Purchase Price</div>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{color:"var(--muted)",fontSize:"var(--text-sm)"}}>$</span>
                <FmtInt value={a.purchasePrice||0} onChange={v=>upd("purchasePrice",v)} placeholder="450,000"
                  style={{width:"100%",padding:"7px 10px",borderRadius:7,fontSize:"var(--text-base)",border:"1px solid var(--border)",background:"var(--input-bg)",color:"var(--text)",fontFamily:"inherit",flex:1}}/>
              </div>
            </div>
            {/* Bedrooms */}
            <div style={{marginBottom:10}}>
              <div style={{fontSize:10,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>Bedrooms (total)</div>
              <input type="number" value={a.beds||""} placeholder="e.g. 4"
                onChange={e=>upd("beds",e.target.value)}
                style={{width:"100%",padding:"7px 10px",borderRadius:7,fontSize:"var(--text-base)",border:"1px solid var(--border)",background:"var(--input-bg)",color:"var(--text)",fontFamily:"inherit"}}/>
            </div>
            {/* Bathrooms */}
            <div style={{marginBottom:10}}>
              <div style={{fontSize:10,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>Bathrooms (total)</div>
              <input type="number" value={a.baths||""} placeholder="e.g. 2"
                onChange={e=>upd("baths",e.target.value)}
                style={{width:"100%",padding:"7px 10px",borderRadius:7,fontSize:"var(--text-base)",border:"1px solid var(--border)",background:"var(--input-bg)",color:"var(--text)",fontFamily:"inherit"}}/>
            </div>
            {/* Sq Footage — comma formatted */}
            <div style={{marginBottom:10}}>
              <div style={{fontSize:10,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>Sq. Footage (total)</div>
              <FmtInt value={a.sqftTotal} onChange={v=>upd("sqftTotal",v)} placeholder="e.g. 2,400" style={{width:"100%",padding:"7px 10px",borderRadius:7,fontSize:"var(--text-base)",border:"1px solid var(--border)",background:"var(--input-bg)",color:"var(--text)",fontFamily:"inherit"}}/>
            </div>
            {/* Lot Size — comma formatted */}
            <div style={{marginBottom:10}}>
              <div style={{fontSize:10,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>Lot Size (sq ft)</div>
              <FmtInt value={a.lotSize} onChange={v=>upd("lotSize",v)} placeholder="e.g. 5,200" style={{width:"100%",padding:"7px 10px",borderRadius:7,fontSize:"var(--text-base)",border:"1px solid var(--border)",background:"var(--input-bg)",color:"var(--text)",fontFamily:"inherit"}}/>
            </div>
            {/* Property Tax + Year Built — side by side */}
            <div style={{marginBottom:10}}>
              <div style={{fontSize:10,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>Property Tax ($/yr)</div>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{color:"var(--muted)",fontSize:"var(--text-sm)"}}>$</span>
                <FmtInt
                  value={a.expenses?.propertyTax||0}
                  onChange={v=>{const d=structuredClone(deal);d.assumptions.expenses=d.assumptions.expenses||{};d.assumptions.expenses.propertyTax=v;d.assumptions.expenseModes=d.assumptions.expenseModes||{};d.assumptions.expenseModes.propertyTax="value";onChange(d);}}
                  placeholder="e.g. 23,707"
                  style={{width:"100%",padding:"7px 10px",borderRadius:7,fontSize:"var(--text-base)",border:"1px solid var(--border)",background:"var(--input-bg)",color:"var(--text)",fontFamily:"inherit",flex:1}}/>
              </div>
              {(+a.expenses?.propertyTax||0)>0 && (
                <div style={{fontSize:"var(--text-xs)",color:"var(--muted)",marginTop:3}}>
                  {FMT_USD(+a.expenses.propertyTax)}/yr · {FMT_USD((+a.expenses.propertyTax)/12)}/mo
                </div>
              )}
              {a.rentcastData?.annualTax && !ptAnnual &&
                <div style={{fontSize:"var(--text-xs)",color:"var(--muted)",marginTop:3}}>
                  Rentcast: ${(+a.rentcastData.annualTax).toLocaleString()}/yr
                  <button onClick={()=>{const d=structuredClone(deal);d.assumptions.expenses=d.assumptions.expenses||{};d.assumptions.expenses.propertyTax=Math.round(a.rentcastData.annualTax);d.assumptions.expenseModes=d.assumptions.expenseModes||{};d.assumptions.expenseModes.propertyTax="value";onChange(d);}}
                    style={{marginLeft:6,fontSize:"var(--text-xs)",color:"var(--accent)",background:"none",border:"none",cursor:"pointer",padding:0,fontFamily:"inherit"}}>
                    Use this
                  </button>
                </div>
              }
            </div>
            {/* Year Built — paired with Property Tax */}
            <div style={{marginBottom:10}}>
              <div style={{fontSize:10,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>Year Built</div>
              <input type="number" value={a.yearBuilt||""} placeholder="e.g. 1985"
                onChange={e=>upd("yearBuilt",e.target.value)}
                style={{width:"100%",padding:"7px 10px",borderRadius:7,fontSize:"var(--text-base)",border:"1px solid var(--border)",background:"var(--input-bg)",color:"var(--text)",fontFamily:"inherit"}}/>
            </div>
            {/* Expected Close Date + Showing Date & Time — full width row */}
            <div style={{marginBottom:10,gridColumn:"1 / -1",display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 12px"}}>
              <div>
                <div style={{fontSize:10,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>Expected Close Date</div>
                <input type="date" value={a.expectedCloseDate||""}
                  onChange={e=>upd("expectedCloseDate",e.target.value)}
                  style={{...{width:"100%",padding:"7px 10px",borderRadius:7,fontSize:"var(--text-base)",border:"1px solid var(--border)",background:"var(--input-bg)",color:"var(--text)",fontFamily:"inherit"},colorScheme:"light dark"}}/>
              </div>
              <div>
                <div style={{fontSize:10,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>Showing Date & Time</div>
                <div style={{display:"flex",gap:8}}>
                  <input type="date" value={deal.showingDate||""}
                    onChange={e=>{const d=structuredClone(deal);d.showingDate=e.target.value;onChange(d);}}
                    style={{...{flex:1,padding:"7px 10px",borderRadius:7,fontSize:"var(--text-base)",border:"1px solid var(--border)",background:"var(--input-bg)",color:"var(--text)",fontFamily:"inherit"},colorScheme:"light dark"}}/>
                  <input type="time" value={deal.showingTime||""}
                    onChange={e=>{const d=structuredClone(deal);d.showingTime=e.target.value;onChange(d);}}
                    style={{...{width:100,padding:"7px 10px",borderRadius:7,fontSize:"var(--text-base)",border:"1px solid var(--border)",background:"var(--input-bg)",color:"var(--text)",fontFamily:"inherit"},colorScheme:"light dark"}}/>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
      {a.rentcastData && (
        <div style={{fontSize:"var(--text-xs)",color:"var(--muted)",marginTop:4}}>
          ℹ️ Fields pre-filled from Rentcast data fetched {a.rentcastData.fetchedAt}
        </div>
      )}
    </Section>
    <Section title="Financing">
      {(()=>{
        const pp=+a.purchasePrice||0;
        // Honor a legitimate 0% down (VA) — blank/undefined falls back to 25%
        const dpPct=((a.downPaymentPct==null||a.downPaymentPct==='')?25:(+a.downPaymentPct||0))/100;
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
          {/* Interest Rate + Amortization — side by side */}
          {(()=>{
            const fldSt={width:"100%",padding:"8px 10px",borderRadius:"var(--r-md)",fontSize:"var(--text-base)",border:"1.5px solid var(--border)",background:"var(--input-bg)",color:"var(--text)",fontFamily:"inherit",WebkitAppearance:"none",appearance:"none"};
            const lblSt={fontSize:10,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4,display:"block"};
            return(
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:8}}>
                <div>
                  <label style={lblSt}>Interest Rate</label>
                  <div style={{display:"flex",alignItems:"center",gap:4}}>
                    <input type="text" inputMode="decimal" value={a.interestRate||""} placeholder="0"
                      onChange={e=>{ e.target.value=e.target.value.replace(/[^0-9.]/g,""); }}
                      onBlur={e=>upd("interestRate",e.target.value.replace(/,/g,""))}
                      style={{...fldSt,flex:1}}/>
                    <span style={{fontSize:"var(--text-sm)",color:"var(--muted)",whiteSpace:"nowrap"}}>%</span>
                  </div>
                </div>
                <div>
                  <label style={lblSt}>Amortization</label>
                  <div style={{display:"flex",alignItems:"center",gap:4}}>
                    <input type="text" inputMode="decimal" value={a.amortYears||""} placeholder="0"
                      onChange={e=>{ e.target.value=e.target.value.replace(/[^0-9]/g,""); }}
                      onBlur={e=>upd("amortYears",e.target.value.replace(/,/g,""))}
                      style={{...fldSt,flex:1}}/>
                    <span style={{fontSize:"var(--text-sm)",color:"var(--muted)",whiteSpace:"nowrap"}}>yrs</span>
                  </div>
                </div>
              </div>
            );
          })()}
          {/* Hold Period — configurable exit year (BACK-805) */}
          {(()=>{
            const fldSt={width:"100%",padding:"8px 10px",borderRadius:"var(--r-md)",fontSize:"var(--text-base)",border:"1.5px solid var(--border)",background:"var(--input-bg)",color:"var(--text)",fontFamily:"inherit",WebkitAppearance:"none",appearance:"none"};
            const lblSt={fontSize:10,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4,display:"block"};
            const holdVal = +a.holdPeriod||10;
            // Soft warnings for refi/VA year conflicts
            const refiConflict = a.refi?.enabled && +a.refi?.year >= holdVal;
            const vaConflict   = a.valueAdd?.enabled && +a.valueAdd?.completionYear >= holdVal;
            return(
              <div style={{marginBottom:8}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 2fr",gap:10}}>
                  <div>
                    <label style={lblSt}>Hold Period</label>
                    <div style={{display:"flex",alignItems:"center",gap:4}}>
                      <input type="text" inputMode="numeric" value={holdVal}
                        onBlur={e=>{const v=Math.max(1,Math.min(30,Math.round(+e.target.value.replace(/,/g,"")||10)));upd("holdPeriod",v);}}
                        onChange={e=>upd("holdPeriod",e.target.value.replace(/[^0-9]/g,""))}
                        style={{...fldSt,flex:1}}/>
                      <span style={{fontSize:"var(--text-sm)",color:"var(--muted)",whiteSpace:"nowrap"}}>yrs</span>
                    </div>
                  </div>
                  <div style={{display:"flex",alignItems:"flex-end",paddingBottom:2}}>
                    <span style={{fontSize:"var(--text-xs)",color:"var(--muted)",lineHeight:1.4}}>
                      Exit analysis, IRR, and equity multiple all use this period.
                    </span>
                  </div>
                </div>
                {(refiConflict||vaConflict)&&(
                  <div style={{marginTop:6,padding:"6px 10px",background:"rgba(217,119,6,0.1)",borderRadius:"var(--r-sm)",fontSize:"var(--text-xs)",color:"var(--accent2)",border:"1px solid rgba(217,119,6,0.25)"}}>
                    ⚠️ {refiConflict&&`Refi year (Yr ${a.refi.year}) is ≥ hold period — it will be ignored in calculations.`}{refiConflict&&vaConflict&&" "}
                    {vaConflict&&`Value-add completion year (Yr ${a.valueAdd.completionYear}) is ≥ hold period — it will be clamped to Yr ${holdVal-1}.`}
                  </div>
                )}
              </div>
            );
          })()}
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
            const inputSt = {flex:1,background:"var(--input-bg)",border:"1.5px solid var(--border)",borderRadius:"var(--r-md)",padding:"8px 10px",fontSize:"var(--text-base)",color:"var(--text)",fontFamily:"inherit",minWidth:0};
            const labelSt = {fontSize:10,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4,display:"block"};
            const dividerSt = {borderTop:"1px solid var(--border)",margin:"14px 0 12px"};
            return(
              <div style={{marginBottom:2}}>

                {/* — Loan Limit + Loan Amount — */}
                <div style={dividerSt}/>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  <div>
                    <label style={{...labelSt,display:"flex",alignItems:"center"}}>Loan Limit&nbsp;<span style={{fontWeight:400,textTransform:"none",fontSize:9}}>(optional cap)</span><Tip text="Optional cap on loan size — your county's conforming limit or FHA max. Leave blank for no cap. When the natural loan exceeds it, Loan Amount is capped and the difference is added to your required down payment."/></label>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <span style={{color:"var(--muted)",fontSize:"var(--text-base)",fontWeight:700,flexShrink:0}}>$</span>
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
                      <span style={{color:"var(--muted)",fontSize:"var(--text-base)",fontWeight:700,flexShrink:0}}>$</span>
                      <div style={{...inputSt,
                        background: capActive?"#fef3c7":"var(--input-bg)",
                        border: capActive?"1.5px solid var(--accent2)":"1.5px solid var(--border)",
                        color: capActive?"#92400e":"var(--text)",
                        fontWeight:700,
                        display:"flex", alignItems:"center",
                        userSelect:"none", cursor:"default"}}>
                        {loanAmtVal>0 ? loanAmtVal.toLocaleString() : <span style={{color:"var(--muted)",fontWeight:400}}>—</span>}
                      </div>
                    </div>
                    {capActive&&<div style={{fontSize:10,color:"var(--accent2)",marginTop:3,fontWeight:600}}>⚠ Capped by loan limit</div>}
                  </div>
                </div>

                {/* — Down Payment — */}
                <div style={{fontSize:"var(--text-sm)",fontWeight:700,color:"var(--text)",marginBottom:6}}>Down Payment</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  <div>
                    <label style={labelSt}>Percentage</label>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <input type="number" min="0" max="100" step="0.5"
                        value={dpPct||""}
                        placeholder="25"
                        onChange={e=>{
                          const pct = +e.target.value;
                          const d=structuredClone(deal);
                          d.assumptions.downPaymentPct=pct;
                          if(pp>0) d.assumptions.downPaymentDollar=Math.round(pp*pct/100);
                          onChange(d);
                        }}
                        style={inputSt}/>
                      <span style={{color:"var(--muted)",fontSize:"var(--text-base)",fontWeight:700,flexShrink:0}}>%</span>
                    </div>
                  </div>
                  <div>
                    <label style={labelSt}>Cash Amount</label>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <span style={{color:"var(--muted)",fontSize:"var(--text-base)",fontWeight:700,flexShrink:0}}>$</span>
                      <input type="number" min="0" step="1000"
                        value={dpDollar||""}
                        placeholder={pp>0?Math.round(pp*0.25):""}
                        onChange={e=>{
                          const dollar = +e.target.value;
                          const d=structuredClone(deal);
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
                  <div style={{marginTop:10,padding:"10px 12px",background:"var(--bg2, var(--bg))",borderRadius:"var(--r-md)",border:"1px solid var(--border)"}}>
                    <div style={{display:"flex",gap:16,flexWrap:"wrap",fontSize:"var(--text-xs)",color:"var(--muted)"}}>
                      <span>Loan: <strong style={{color:capActive?"var(--accent2)":"var(--text)"}}>{FMT_USD(loanAmtVal)}</strong></span>
                      <span>LTV: <strong style={{color:"var(--text)"}}>{pp>0?(loanAmtVal/pp*100).toFixed(1):0}%</strong></span>
                      <span>Down: <strong style={{color:"var(--text)"}}>{FMT_USD(dpDollar)}</strong></span>
                      {capActive && <span style={{color:"var(--accent2)",fontWeight:700}}>+{FMT_USD(extraDP)} extra down needed</span>}
                    </div>
                  </div>
                )}

              </div>
            );
          })()}
          <InputRow label="Seller Concessions" value={a.sellerConcessions} onChange={v=>upd("sellerConcessions",v)} prefix="$" tip="Credits the seller pays toward your closing costs. Reduces your cash needed at closing but may affect the purchase price in the contract."/>
          {/* Property Insurance + PMI — side by side */}
          {(()=>{
            const fldSt={width:"100%",padding:"8px 10px",borderRadius:"var(--r-md)",fontSize:"var(--text-base)",border:"1.5px solid var(--border)",background:"var(--input-bg)",color:"var(--text)",fontFamily:"inherit",WebkitAppearance:"none",appearance:"none"};
            const lblSt={fontSize:10,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4,display:"block"};
            return(
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:4}}>
                <div>
                  <label style={lblSt}>Property Insurance ($/yr)</label>
                  <div style={{display:"flex",alignItems:"center",gap:4}}>
                    <span style={{fontSize:"var(--text-sm)",color:"var(--muted)"}}>$</span>
                    <input type="text" inputMode="decimal" value={a.expenses?.insurance||""} placeholder="0"
                      onChange={e=>upd("expenses.insurance",e.target.value.replace(/,/g,""))}
                      style={{...fldSt,flex:1,borderColor:(+a.expenses?.insurance||0)===0?"var(--accent2)":undefined}}/>
                  </div>
                  {(+a.expenses?.insurance||0)===0&&<div style={{fontSize:"var(--text-xs)",color:"var(--accent2)",marginTop:3}}>⚠ Enter annual insurance premium</div>}
                </div>
                <div>
                  <label style={lblSt}>PMI ($/mo)</label>
                  <div style={{display:"flex",alignItems:"center",gap:4}}>
                    <span style={{fontSize:"var(--text-sm)",color:"var(--muted)"}}>$</span>
                    <input type="text" inputMode="decimal" value={a.pmi||""} placeholder="0"
                      onChange={e=>upd("pmi",+e.target.value.replace(/,/g,"")||0)}
                      style={{...fldSt,flex:1}}/>
                  </div>
                </div>
              </div>
            );
          })()}
          {piti>0&&<div style={{marginTop:8,padding:"14px 16px",background:"var(--accent-soft)",border:"1.5px solid var(--accent)",borderRadius:12,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
            <div>
              <div style={{fontSize:10,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:2}}>Est. Monthly PITI Payment</div>
              <div style={{fontFamily:"'Fraunces',serif",fontSize:"var(--text-xl)",fontWeight:900,color:"var(--accent)",letterSpacing:"-0.5px"}}>{FMT_USD(piti)}<span style={{fontSize:"var(--text-sm)",fontWeight:500,color:"var(--muted)",fontFamily:"'DM Sans',sans-serif"}}>/mo</span></div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"4px 16px",fontSize:"var(--text-xs)",color:"var(--muted)"}}>
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
          {/* Listed Rent + Adjusted Rent — side by side */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:4}}>
            <div>
              <label style={{fontSize:"var(--text-xs)",color:"var(--muted)",fontWeight:600,display:"block",marginBottom:3}}>Listed Rent</label>
              <div style={{display:"flex",gap:4,alignItems:"center"}}>
                <span style={{color:"var(--muted)",fontSize:"var(--text-sm)"}}>$</span>
                <input type="text" inputMode="numeric"
                  value={(+u.listedRent||0) ? (+u.listedRent).toLocaleString() : ""}
                  placeholder="0"
                  onFocus={e=>{const v=+u.listedRent||0;e.target.value=v?String(v):"";}}
                  onBlur={e=>{const v=+e.target.value.replace(/,/g,"")||0;e.target.value=v?v.toLocaleString():"";}}
                  onChange={e=>{const d=structuredClone(deal);d.assumptions.units[i]={...d.assumptions.units[i],listedRent:+e.target.value.replace(/,/g,"")};onChange(d);}}
                  style={{...iSty,flex:1}}/>
                <span style={{fontSize:"var(--text-xs)",color:"var(--muted)"}}>/mo</span>
              </div>
            </div>
            <div>
              <label style={{fontSize:"var(--text-xs)",color:"var(--text)",fontWeight:700,display:"block",marginBottom:3}}>Adjusted Rent <span style={{fontSize:10,color:"var(--muted)",fontWeight:400}}>(model)</span></label>
              <div style={{display:"flex",gap:4,alignItems:"center"}}>
                <span style={{color:"var(--muted)",fontSize:"var(--text-sm)"}}>$</span>
                <input type="text" inputMode="numeric"
                  value={(+u.rent||0) ? (+u.rent).toLocaleString() : ""}
                  placeholder={effRent ? (+effRent).toLocaleString() : "0"}
                  onFocus={e=>{const v=+u.rent||0;e.target.value=v?String(v):"";}}
                  onBlur={e=>{const v=+e.target.value.replace(/,/g,"")||0;e.target.value=v?v.toLocaleString():"";}}
                  onChange={e=>{const d=structuredClone(deal);d.assumptions.units[i]={...d.assumptions.units[i],rent:+e.target.value.replace(/,/g,"")};onChange(d);}}
                  style={{...iSty,flex:1,borderColor:"var(--accent)"}}/>
                <span style={{fontSize:"var(--text-xs)",color:"var(--muted)"}}>/mo</span>
              </div>
            </div>
          </div>
          {/* Rentcast Est — only if populated */}
          {u.rentcastRent>0&&(<div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
            <label style={{fontSize:"var(--text-xs)",color:"var(--rentcast-indigo)",fontWeight:600}}>Rentcast Est.</label>
            <span style={{fontSize:"var(--text-sm)",fontWeight:700,color:"var(--rentcast-indigo)"}}>{FMT_USD(u.rentcastRent)}/mo</span>
            {u.rentcastRentRange&&<span style={{fontSize:"var(--text-xs)",color:"var(--muted)"}}>({u.rentcastRentRange})</span>}
          </div>)}
          <div style={{fontSize:"var(--text-xs)",color:"var(--muted)",marginTop:4}}>
            {u.rent>0?"Using Adjusted Rent":u.listedRent>0?"No Adjusted Rent set — using Listed Rent":"No rent set"}
          </div>
        </div>);
      })}
      <div style={{fontSize:"var(--text-sm)",color:"var(--accent)",fontWeight:700,padding:"6px 0"}}>Blended Monthly Avg: {FMT_USD(a.units.slice(0,a.numUnits).reduce((s,u)=>s+(+(u.rent||u.listedRent)||0),0)/a.numUnits)} / unit</div>
      <InputRow label="Vacancy Rate" value={a.vacancyRate} onChange={v=>upd("vacancyRate",v)} suffix="%" tip="The % of the year each unit sits empty between tenants. 5% is roughly 18 days/yr — a common starting point for stable markets."/>
    </Section>
    <Section title="Expenses" action={<label style={{fontSize:12,color:"var(--muted)",display:"flex",gap:6,alignItems:"center",cursor:"pointer"}}><input type="checkbox" checked={a.selfManage} onChange={e=>upd("selfManage",e.target.checked)}/> Self-manage</label>}>
      <div style={{fontSize:"var(--text-xs)",color:"var(--muted)",marginBottom:8,lineHeight:1.5}}>
        💡 Each expense can be entered as a fixed <strong style={{color:"var(--text)"}}>$ per year</strong> or as a <strong style={{color:"var(--text)"}}>% of gross rent</strong> — use the <strong style={{color:"var(--accent)"}}>$ / %</strong> toggle beside each field.
      </div>
      {expFields.map(([vk,pk,lbl])=>{
        // Property Tax is edited in Property Details — show read-only here
        if(vk==="propertyTax"){
          const ptVal = +a.expenses?.propertyTax||0;
          const roLabel = {fontSize:12,fontWeight:600,color:"var(--muted)"};
          const roVal = {fontSize:"var(--text-sm)",fontWeight:700,color:"var(--text)"};
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
        // Property Insurance is edited in Financing — show read-only here
        if(vk==="insurance"){
          const insVal = +a.expenses?.insurance||0;
          const roLabel2 = {fontSize:12,fontWeight:600,color:"var(--muted)"};
          const roVal2 = {fontSize:"var(--text-sm)",fontWeight:700,color:"var(--text)"};
          if(isMobile){return(
            <div key={vk} style={{padding:"10px 0",borderBottom:"1px solid var(--border-faint)"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={roLabel2}>Property Insurance <span style={{fontSize:10,fontWeight:400,fontStyle:"italic"}}>(set in Financing)</span></span>
                <span style={roVal2}>{insVal>0?FMT_USD(insVal)+"/yr":"—"}</span>
              </div>
            </div>
          );}
          return(
            <div key={vk} style={{display:"flex",alignItems:"center",padding:"9px 0",borderBottom:"1px solid var(--border-faint)"}}>
              <span style={{...roLabel2,flex:"0 0 160px"}}>Property Insurance <span style={{fontSize:10,fontWeight:400,fontStyle:"italic"}}>(set in Financing)</span></span>
              <span style={{...roVal2,marginLeft:"auto"}}>{insVal>0?FMT_USD(insVal)+"/yr":"—"}</span>
            </div>
          );
        }
        const modes=a.expenseModes||{}, isItemPct=modes[vk]==="pct";
        const toggleMode=()=>{const d=structuredClone(deal);if(!d.assumptions.expenseModes)d.assumptions.expenseModes={};d.assumptions.expenseModes[vk]=isItemPct?"value":"pct";onChange(d);};
        const modeToggle=(<div style={{display:"flex",background:"var(--input-bg)",borderRadius:4,border:"1px solid var(--border)",overflow:"hidden",flexShrink:0}}>{[["value","$"],["pct","%"]].map(([k,l2])=>(<button key={k} onClick={toggleMode} style={{padding:"3px 9px",fontSize:12,fontWeight:700,border:"none",cursor:"pointer",background:(modes[vk]||"value")===k?"var(--accent)":"transparent",color:(modes[vk]||"value")===k?"#fff":"var(--muted)"}}>{l2}</button>))}</div>);
        const expKey=isItemPct?pk:vk;
        const expRawVal=isItemPct?a.expenses[pk]:a.expenses[vk];
        if(isMobile){
          return(<ExpenseInputRow key={vk} lbl={lbl} tip={expTips[vk]} modeToggle={modeToggle} isItemPct={isItemPct} rawVal={expRawVal} onChange={v=>upd(`expenses.${expKey}`,v)} mobile/>);
        }
        return(<ExpenseInputRow key={vk} lbl={lbl} tip={expTips[vk]} modeToggle={modeToggle} isItemPct={isItemPct} rawVal={expRawVal} onChange={v=>upd(`expenses.${expKey}`,v)}/>);
      })}
      {/* HOA — always a fixed annual dollar amount; auto-populated from Rentcast when available */}
      <InputRow
        label="HOA / Condo Fee"
        value={a.expenses?.hoa||0}
        onChange={v=>upd("expenses.hoa",v)}
        prefix="$"
        suffix="/yr"
        tooltip="Annual HOA or condo association fee. Auto-populated from Rentcast when available. Enter 0 if none."
      />
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
      const ccDpPct = ((a.downPaymentPct==null||a.downPaymentPct==='')?25:(+a.downPaymentPct||0))/100;
      const ccDp = ccPP>0 ? ccPP*ccDpPct : (+a.downPaymentDollar||0);
      const totalDueAtClosing = ccTotal + ccDp;
      const roSt = {
        flex:1, background:"var(--bg)", border:"1.5px solid var(--border)",
        borderRadius:"var(--r-md)", padding:"8px 12px", fontSize:"var(--text-base)", fontWeight:700,
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
              Closing Costs <span style={{fontWeight:400,color:"var(--muted)",fontSize:"var(--text-xs)",textTransform:"none",letterSpacing:0}}>({FMT_USD(ccTotal)} total · {FMT_USD(totalDueAtClosing)} due at closing)</span>
            </div>
            <div style={{fontSize:"var(--text-base)",color:"var(--muted)",transform:ccOpen?"rotate(180deg)":"none",transition:"transform 0.2s"}}>▾</div>
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
                <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:"var(--text-sm)",color:"var(--text)",fontWeight:500}}>
                  <input type="checkbox" checked={!!a.insuranceUpfront}
                    onChange={e=>upd("insuranceUpfront", e.target.checked)}
                    style={{width:15,height:15,accentColor:"var(--accent)",cursor:"pointer"}}/>
                  1 Year of Insurance Upfront
                </label>
                <span style={{fontSize:"var(--text-sm)",fontWeight:700,color:a.insuranceUpfront?"var(--accent)":"var(--muted)"}}>
                  {a.insuranceUpfront ? FMT_USD(insUpfrontAmt) : "—"}
                </span>
              </div>
              {a.insuranceUpfront && insUpfrontAmt===0 && (
                <div style={{fontSize:"var(--text-xs)",color:"var(--accent2)",marginBottom:8,paddingLeft:2}}>
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
                    color:"var(--accent)",fontFamily:"'Fraunces',serif",fontSize:"var(--text-md)",letterSpacing:"-0.3px"}}>
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
                    <div style={{fontSize:"var(--text-xs)",color:"var(--muted)"}}>Closing Costs + Down Payment</div>
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
    {/* ── Advanced settings expander (2026-06 UX audit) ── */}
    <button onClick={()=>setShowAdvanced(v=>!v)}
      style={{display:"flex",alignItems:"center",gap:8,width:"100%",background:"var(--card)",border:"1px solid var(--border)",borderRadius:"var(--r-md)",padding:"12px 14px",cursor:"pointer",fontFamily:"inherit",marginBottom:12,textAlign:"left"}}>
      <span style={{fontSize:13,fontWeight:800,color:"var(--accent)"}}>{showAdvanced?"▲ Hide advanced settings":"▼ Show advanced settings"}</span>
      <span style={{fontSize:11,color:"var(--muted)"}}>owner occupancy · growth &amp; exit · tax profile · refinance · value-add</span>
    </button>
    {!showAdvanced&&(
      <div style={{fontSize:"var(--text-xs)",color:"var(--muted)",padding:"0 2px 12px",lineHeight:1.6}}>
        Currently using: {a.ownerOccupied?`owner-occupied (Unit ${(+a.ownerUnit||0)+1}, ${a.ownerOccupancyYears||2} yrs)`:"investment property (no owner unit)"} · {a.rentGrowth||0}% rent growth · {a.appreciationRate||0}% appreciation · {a.taxBracket||0}% tax bracket{a.state?` · ${a.state} state tax`:""} · {(a.sellingCostPct??6)}% selling costs at exit
      </div>
    )}
    {showAdvanced&&(<>
    <Section title="Owner Occupancy" action={<label style={{fontSize:12,color:"var(--muted)",display:"flex",gap:8,alignItems:"center",cursor:"pointer"}}><input type="checkbox" checked={!!a.ownerOccupied} onChange={e=>upd("ownerOccupied",e.target.checked)}/> Enable</label>}>
      {a.ownerOccupied ? (<>
        <div style={{display:isMobile?"block":"grid",gridTemplateColumns:"200px 1fr 1fr",gap:8,alignItems:"center",padding:"5px 0",borderBottom:"1px solid var(--border-faint)"}}>
          <label style={{fontSize:"var(--text-sm)",color:"var(--muted)",fontWeight:500,display:"block",marginBottom:isMobile?4:0}}>Your Unit</label>
          <select value={a.ownerUnit||0} onChange={e=>upd("ownerUnit",+e.target.value)} style={{...iSty,gridColumn:"span 2"}}>
            {Array.from({length:a.numUnits}).map((_,i)=><option key={i} value={i}>Unit {i+1}{a.units[i]?.rent>0?` — ${FMT_USD(+a.units[i].rent)}/mo`:""}</option>)}
          </select>
        </div>
        <InputRow label="Occupancy Duration" value={a.ownerOccupancyYears||2} onChange={v=>upd("ownerOccupancyYears",v)} suffix="yrs"/>
        {/* Alternative Rent + Owner Use Utilities — side by side */}
        {(()=>{
          const fldSt={width:"100%",padding:"8px 10px",borderRadius:"var(--r-md)",fontSize:"var(--text-base)",border:"1.5px solid var(--border)",background:"var(--input-bg)",color:"var(--text)",fontFamily:"inherit",WebkitAppearance:"none",appearance:"none"};
          const lblSt={fontSize:10,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4,display:"block"};
          return(
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,padding:"6px 0",borderBottom:"1px solid var(--border-faint)"}}>
              <div>
                <label style={{...lblSt,display:"flex",alignItems:"center"}}>Alternative Rent<Tip text="What you'd pay to rent a comparable place if you didn't buy. Used to calculate your true cost of owning vs. renting — the Incremental Cash Flow metric."/></label>
                <div style={{display:"flex",alignItems:"center",gap:4}}>
                  <span style={{fontSize:"var(--text-sm)",color:"var(--muted)"}}>$</span>
                  <input type="text" inputMode="decimal" value={a.alternativeRent||""} placeholder="0"
                    onChange={e=>upd("alternativeRent",e.target.value.replace(/,/g,""))}
                    style={{...fldSt,flex:1}}/>
                  <span style={{fontSize:12,color:"var(--muted)",whiteSpace:"nowrap"}}>/mo</span>
                </div>
              </div>
              <div>
                <label style={{...lblSt,display:"flex",alignItems:"center"}}>Owner Use Utilities<Tip text="Utilities you pay for your own unit (e.g. heat, water). Treated as a cost of occupancy rather than an investment expense."/></label>
                <div style={{display:"flex",alignItems:"center",gap:4}}>
                  <span style={{fontSize:"var(--text-sm)",color:"var(--muted)"}}>$</span>
                  <input type="text" inputMode="decimal" value={a.ownerUseUtilities||""} placeholder="0"
                    onChange={e=>upd("ownerUseUtilities",e.target.value.replace(/,/g,""))}
                    style={{...fldSt,flex:1}}/>
                  <span style={{fontSize:12,color:"var(--muted)",whiteSpace:"nowrap"}}>/yr</span>
                </div>
              </div>
            </div>
          );
        })()}
        <div style={{fontSize:12,color:"var(--muted)",padding:"6px 0",borderTop:"1px solid var(--border-faint)",marginTop:4}}>
          Rent foregone Yr 1–{a.ownerOccupancyYears||2}: <strong style={{color:"var(--refi-amber)"}}>{FMT_USD((+a.units[Math.min(+a.ownerUnit||0,a.numUnits-1)]?.rent||0)*12)}/yr</strong> · Unit {(+a.ownerUnit||0)+1} rented at market rate from Year {(+a.ownerOccupancyYears||2)+1}
        </div>
      </>) : <div style={{fontSize:"var(--text-sm)",color:"var(--muted)",padding:"8px 0"}}>Enable to model living in one unit and not collecting rent during your occupancy period.</div>}
    </Section>
    <Section title="Growth & Exit">
      {(()=>{
        const fldSt={width:"100%",padding:"8px 10px",borderRadius:"var(--r-md)",fontSize:"var(--text-base)",border:"1.5px solid var(--border)",background:"var(--input-bg)",color:"var(--text)",fontFamily:"inherit",WebkitAppearance:"none",appearance:"none"};
        const lblSt={fontSize:10,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4,display:"block"};
        const Col = ({label,value,path,suffix,tip}) => (
          <div>
            <label style={{...lblSt,display:"flex",alignItems:"center"}}>{label}{tip&&<Tip text={tip}/>}</label>
            <div style={{display:"flex",alignItems:"center",gap:4}}>
              <input type="text" inputMode="decimal" value={value||""} placeholder="0"
                onChange={e=>upd(path,e.target.value.replace(/,/g,""))}
                style={{...fldSt,flex:1}}/>
              <span style={{fontSize:12,color:"var(--muted)",whiteSpace:"nowrap"}}>{suffix}</span>
            </div>
          </div>
        );
        return(<>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,paddingBottom:8,borderBottom:"1px solid var(--border-faint)",marginBottom:4}}>
            <Col label="Rent Growth" value={a.rentGrowth} path="rentGrowth" suffix="%/yr" tip="Annual % increase in rents over the 10-year hold. Historical multifamily rent growth averages ~3–4%/yr in most US markets."/>
            <Col label="Expense Growth" value={a.expenseGrowth} path="expenseGrowth" suffix="%/yr" tip="Annual % increase in operating expenses (taxes, insurance, maintenance). Typically tracks inflation — 2–3%/yr is realistic."/>
            <Col label="Appreciation" value={a.appreciationRate} path="appreciationRate" suffix="%/yr" tip="Annual % increase in the property's value. Used to project your equity at sale. Conservative assumption: 3–4%/yr; be careful not to over-assume."/>
          </div>
          <InputRow label="Federal Tax Bracket" value={a.taxBracket} onChange={v=>upd("taxBracket",v)} suffix="%" tip="Your marginal federal income tax rate. Used to estimate the tax benefit of mortgage interest and depreciation deductions."/>
          <InputRow label="Selling Costs" value={a.sellingCostPct??6} onChange={v=>upd("sellingCostPct",v)} suffix="% of sale" tip="Agent commissions plus seller-paid closing costs when you eventually sell — typically 6–8% of the sale price. Deducted from exit proceeds and from the taxable gain."/>
        </>);
      })()}
    </Section>
    <Section title="Tax Profile">
      {(()=>{
        const fldSt={width:"100%",padding:"8px 10px",borderRadius:"var(--r-md)",fontSize:"var(--text-base)",border:"1.5px solid var(--border)",background:"var(--input-bg)",color:"var(--text)",fontFamily:"inherit",WebkitAppearance:"none",appearance:"none"};
        const lblSt={fontSize:10,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4,display:"block"};
        const stateOptions = getStateOptions();
        const localTaxStates = {
          MD: { label:'MD county tax', hint:'Maryland requires a county income tax (typically 2.25%–3.2%). Default 3.0% is common.' },
          NY: { label:'NYC/Yonkers local', hint:'NYC residents owe an additional ~3.88% local income tax on top of NY state.' },
          OH: { label:'OH municipal tax', hint:'Most Ohio cities levy a municipal income tax (0.5%–3%). Columbus & Cleveland are ~2.5%.' },
          PA: { label:'PA local EIT', hint:'Philadelphia and many PA municipalities levy an Earned Income Tax (Philly: 3.75%).' },
          IN: { label:'IN county tax', hint:'Indiana counties levy a local income tax (0.5%–3.38% depending on county).' },
        };
        const showLocalField = !!(a.state && localTaxStates[a.state]);
        const localHint = localTaxStates[a.state];
        return(
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {/* State + Filing Status row */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div>
                <label style={lblSt}>State</label>
                <select
                  value={a.state||''}
                  onChange={e=>upd('state', e.target.value)}
                  style={fldSt}
                >
                  <option value="">— No state tax —</option>
                  {stateOptions.map(s=>(
                    <option key={s.code} value={s.code}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={lblSt}>Filing Status</label>
                <div style={{display:"flex",gap:0,height:38}}>
                  {[['single','Single'],['married','Married']].map(([val,lbl])=>(
                    <button
                      key={val}
                      onClick={()=>upd('filingStatus', val)}
                      style={{
                        flex:1,fontSize:"var(--text-sm)",fontWeight:600,cursor:"pointer",
                        background: (a.filingStatus||'single')===val ? "var(--accent)" : "var(--input-bg)",
                        color:      (a.filingStatus||'single')===val ? "#fff"         : "var(--muted)",
                        border:"1.5px solid var(--border)",
                        borderRadius: val==='single' ? "10px 0 0 10px" : "0 10px 10px 0",
                        borderRight:  val==='single' ? "none" : "1.5px solid var(--border)",
                        transition:"background 0.15s,color 0.15s",
                      }}
                    >{lbl}</button>
                  ))}
                </div>
              </div>
            </div>

            {/* Local tax rate — only shown for states with meaningful local taxes */}
            {showLocalField && (
              <div>
                <label style={lblSt}>{localHint.label} <span style={{fontWeight:400,textTransform:"none",letterSpacing:0}}>(%)</span></label>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <input
                    type="number"
                    step="0.1"
                    value={a.localTaxRate > 0 ? (a.localTaxRate * 100).toFixed(2).replace(/\.?0+$/,'') : ''}
                    placeholder={a.state==='MD' ? '3.0' : '0'}
                    onBlur={e => {
                      const v = parseFloat(e.target.value);
                      upd('localTaxRate', isNaN(v) ? 0 : v / 100);
                    }}
                    onChange={e => {
                      // Live update on change for responsiveness
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v)) upd('localTaxRate', v / 100);
                    }}
                    style={{...fldSt, flex:1}}
                  />
                  <span style={{fontSize:12,color:"var(--muted)",whiteSpace:"nowrap"}}>% / yr</span>
                </div>
                <div style={{fontSize:"var(--text-xs)",color:"var(--muted)",marginTop:4,lineHeight:1.4}}>{localHint.hint}</div>
              </div>
            )}

            {/* State selected — show summary line */}
            {a.state ? (
              <div style={{fontSize:12,color:"var(--muted)",padding:"5px 0",borderTop:"1px solid var(--border-faint)"}}>
                State tax will be calculated using the stacking method on top of your MAGI.
                {!a.tax?.agi && <span style={{color:"var(--accent2)",fontWeight:600}}> Set your MAGI in the Advanced Tax section for accurate results.</span>}
              </div>
            ) : (
              <div style={{fontSize:12,color:"var(--muted)",padding:"5px 0"}}>
                Select your state to include state income tax in the after-tax cash flow analysis.
              </div>
            )}
          </div>
        );
      })()}
    </Section>
    <CollapsibleSection title="Refinance Scenario" defaultOpen={!!a.refi?.enabled} badge={a.refi?.enabled ? 'Enabled' : undefined}>
      <Section title="Refinance Scenario" action={<label style={{fontSize:12,color:"var(--muted)",display:"flex",gap:8,alignItems:"center",cursor:"pointer"}}><input type="checkbox" checked={a.refi.enabled} onChange={e=>upd("refi.enabled",e.target.checked)}/> Enable</label>}>
        {a.refi.enabled?<><InputRow label="Refi Year" value={a.refi.year} onChange={v=>upd("refi.year",v)}/><InputRow label="New Rate" value={a.refi.newRate} onChange={v=>upd("refi.newRate",v)} suffix="%"/><InputRow label="New LTV" value={a.refi.newLTV} onChange={v=>upd("refi.newLTV",v)} suffix="%"/></>:<div style={{fontSize:"var(--text-sm)",color:"var(--muted)",padding:"8px 0"}}>Enable to model a cash-out refinance during the hold period.</div>}
      </Section>
    </CollapsibleSection>
    <CollapsibleSection title="Value Add" defaultOpen={!!a.valueAdd?.enabled} badge={a.valueAdd?.enabled ? 'Enabled' : undefined}>
    <Section title="Value Add" action={<label style={{fontSize:12,color:"var(--muted)",display:"flex",gap:8,alignItems:"center",cursor:"pointer"}}><input type="checkbox" checked={!!(a.valueAdd?.enabled)} onChange={e=>upd("valueAdd.enabled",e.target.checked)}/> Enable</label>}>
      {a.valueAdd?.enabled?<>{(()=>{
        const fldSt={width:"100%",padding:"8px 10px",borderRadius:"var(--r-md)",fontSize:"var(--text-base)",border:"1.5px solid var(--border)",background:"var(--input-bg)",color:"var(--text)",fontFamily:"inherit",WebkitAppearance:"none",appearance:"none"};
        const lblSt={fontSize:10,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4,display:"block"};
        return(<>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,paddingBottom:8,borderBottom:"1px solid var(--border-faint)",marginBottom:4}}>
            <div>
              <label style={lblSt}>Total Remodel Cost</label>
              <div style={{display:"flex",alignItems:"center",gap:4}}>
                <span style={{fontSize:"var(--text-sm)",color:"var(--muted)"}}>$</span>
                <input type="text" inputMode="decimal" value={a.valueAdd.reModelCost||""} placeholder="0"
                  onChange={e=>upd("valueAdd.reModelCost",e.target.value.replace(/,/g,""))}
                  style={{...fldSt,flex:1}}/>
              </div>
            </div>
            <div>
              <label style={lblSt}>Rent Bump / Unit / Mo</label>
              <div style={{display:"flex",alignItems:"center",gap:4}}>
                <span style={{fontSize:"var(--text-sm)",color:"var(--muted)"}}>$</span>
                <input type="text" inputMode="decimal" value={a.valueAdd.rentBumpPerUnit||""} placeholder="0"
                  onChange={e=>upd("valueAdd.rentBumpPerUnit",e.target.value.replace(/,/g,""))}
                  style={{...fldSt,flex:1}}/>
              </div>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,paddingBottom:6}}>
            <div>
              <label style={lblSt}>Units Renovated</label>
              <div style={{display:"flex",alignItems:"center",gap:4}}>
                <input type="text" inputMode="decimal" value={a.valueAdd.unitsRenovated||""} placeholder="0"
                  onChange={e=>upd("valueAdd.unitsRenovated",Math.min(+e.target.value.replace(/,/g,""),a.numUnits))}
                  style={{...fldSt,flex:1}}/>
                <span style={{fontSize:12,color:"var(--muted)",whiteSpace:"nowrap"}}>of {a.numUnits}</span>
              </div>
            </div>
            <div>
              <label style={lblSt}>Completion Year</label>
              <div style={{display:"flex",alignItems:"center",gap:4}}>
                <input type="text" inputMode="decimal" value={a.valueAdd.completionYear||""} placeholder="1"
                  onChange={e=>upd("valueAdd.completionYear",e.target.value.replace(/,/g,""))}
                  style={{...fldSt,flex:1}}/>
                <span style={{fontSize:12,color:"var(--muted)",whiteSpace:"nowrap"}}>yr</span>
              </div>
            </div>
          </div>
          <div style={{fontSize:12,color:"var(--muted)",padding:"4px 0",borderTop:"1px solid var(--border-faint)",marginTop:4}}>Annual rent lift: <strong style={{color:"var(--text)"}}>{FMT_USD((+a.valueAdd.rentBumpPerUnit||0)*Math.min(+a.valueAdd.unitsRenovated||0,a.numUnits)*12)}</strong> · Value implied via NOI/cap rate from Year {a.valueAdd.completionYear}</div>
        </>);
      })()}</>:<div style={{fontSize:"var(--text-sm)",color:"var(--muted)",padding:"8px 0"}}>Enable to model remodeling costs and post-renovation rent uplift.</div>}
    </Section>
    </CollapsibleSection>
    {(()=>{
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
              <span style={{fontWeight:400,color:"var(--muted)",fontSize:"var(--text-xs)",textTransform:"none",letterSpacing:0,marginLeft:6}}>({summaryText})</span>
            </div>
            <div style={{fontSize:"var(--text-base)",color:"var(--muted)",transform:taxOpen?"rotate(180deg)":"none",transition:"transform 0.2s"}}>▾</div>
          </div>
          {taxOpen && (
            <div>
              {/* Enable toggle */}
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderBottom:"1px solid var(--border-faint)"}}>
                <div>
                  <div style={{fontSize:"var(--text-sm)",fontWeight:700,color:"var(--text)"}}>Enable Advanced Tax Modeling</div>
                  <div style={{fontSize:"var(--text-xs)",color:"var(--muted)",marginTop:2}}>Cost segregation, bonus depreciation, Section 179, and passive activity loss rules.</div>
                </div>
                <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",flexShrink:0,marginLeft:12}}>
                  <input type="checkbox" checked={taxEnabled} onChange={e=>upd("tax.enabled",e.target.checked)} style={{width:16,height:16,accentColor:"var(--accent)",cursor:"pointer"}}/>
                  <span style={{fontSize:"var(--text-sm)",fontWeight:700,color:taxEnabled?"var(--accent)":"var(--muted)"}}>{taxEnabled?"On":"Off"}</span>
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
                  <label style={{fontSize:"var(--text-sm)",color:"var(--muted)",fontWeight:500,display:"block",marginBottom:isMobile?4:0}}>Passive Activity Status</label>
                  <select value={tax.paStatus||'active_participant'} onChange={e=>upd("tax.paStatus",e.target.value)} style={{...iSty}}>
                    <option value="active_participant">Active Participant ($25k allowance)</option>
                    <option value="re_professional">RE Professional (unlimited deduction)</option>
                    <option value="passive">Passive Investor (no benefit)</option>
                  </select>
                </div>
                {(tax.paStatus||'active_participant')==='active_participant' && (
                  <div style={{fontSize:"var(--text-xs)",color:"var(--muted)",padding:"3px 0 8px",lineHeight:1.5}}>
                    $25k allowance phases out $1 for every $2 of AGI over $100k (fully phased at $150k AGI). Suspended losses carry forward to future years (not modeled).
                  </div>
                )}
                {tax.paStatus==='re_professional' && (
                  <div style={{fontSize:"var(--text-xs)",color:"var(--accent)",padding:"3px 0 8px"}}>
                    ✓ RE Professional: all rental losses deductible against ordinary income with no cap.
                  </div>
                )}
                {tax.paStatus==='passive' && (
                  <div style={{fontSize:"var(--text-xs)",color:"var(--accent2)",padding:"3px 0 8px"}}>
                    ⚠ Passive: losses only offset passive income. Model assumes no other passive income; all excess losses carry forward.
                  </div>
                )}
                {/* Cost Segregation */}
                <div style={{marginTop:12,paddingTop:12,borderTop:"1px solid var(--border-faint)"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
                    <div>
                      <div style={{fontSize:"var(--text-sm)",fontWeight:700,color:"var(--text)"}}>Cost Segregation Study</div>
                      <div style={{fontSize:"var(--text-xs)",color:"var(--muted)"}}>Reclassify components to 5-yr and 15-yr schedules, then apply bonus depreciation.</div>
                    </div>
                    <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",flexShrink:0,marginLeft:12}}>
                      <input type="checkbox" checked={csEnabled} onChange={e=>upd("tax.costSegEnabled",e.target.checked)} style={{width:15,height:15,accentColor:"var(--accent)",cursor:"pointer"}}/>
                      <span style={{fontSize:"var(--text-sm)",fontWeight:700,color:csEnabled?"var(--accent)":"var(--muted)"}}>{csEnabled?"On":"Off"}</span>
                    </label>
                  </div>
                  {!csEnabled && (
                    <div style={{fontSize:"var(--text-xs)",color:"var(--muted)",padding:"4px 0 4px"}}>Enable to front-load depreciation via cost segregation + bonus dep (100% under OBBBA).</div>
                  )}
                  {csEnabled && (<>
                    {/* Cost Seg Study Fee — one-time Year 1 operating expense */}
                    <InputRow
                      label="Study Fee (Yr 1)"
                      value={tax.costSegFee||0}
                      onChange={v=>upd("tax.costSegFee",v)}
                      prefix="$"
                    />
                    <div style={{fontSize:"var(--text-xs)",color:"var(--muted)",padding:"2px 0 6px"}}>
                      One-time cost of the study. Flows into Year 1 operating expenses.
                    </div>
                    <InputRow label="5-yr Components" value={tax.costSeg5YrPct||15} onChange={v=>upd("tax.costSeg5YrPct",v)} suffix="% of building"/>
                    <InputRow label="15-yr Components" value={tax.costSeg15YrPct||10} onChange={v=>upd("tax.costSeg15YrPct",v)} suffix="% of building"/>
                    {/* Component breakdown display */}
                    {pp2>0 && (
                      <div style={{background:"var(--accent-soft)",border:"1px solid var(--border-faint)",borderRadius:8,padding:"8px 12px",marginTop:6,marginBottom:4}}>
                        <div style={{fontSize:10,fontWeight:800,color:"var(--accent)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Component Breakdown</div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"3px 16px",fontSize:"var(--text-xs)"}}>
                          <span style={{color:"var(--muted)"}}>Land (excluded)</span><span style={{fontWeight:700,color:"var(--text)"}}>{FMT_USD(landAmt)}</span>
                          <span style={{color:"var(--muted)"}}>27.5-yr Structure</span><span style={{fontWeight:700,color:"var(--text)"}}>{FMT_USD(structAmt)}</span>
                          <span style={{color:"var(--muted)"}}>5-yr Personal Prop.</span><span style={{fontWeight:700,color:"var(--accent2)"}}>{FMT_USD(cs5Amt)}</span>
                          <span style={{color:"var(--muted)"}}>15-yr Land Improve.</span><span style={{fontWeight:700,color:"var(--accent2)"}}>{FMT_USD(cs15Amt)}</span>
                        </div>
                      </div>
                    )}
                    {/* Bonus Dep */}
                    <InputRow label="Bonus Dep. %" value={tax.bonusDepPct||100} onChange={v=>upd("tax.bonusDepPct",v)} suffix="% (Yr 1)"/>
                    <div style={{fontSize:"var(--text-xs)",color:"var(--muted)",padding:"2px 0 6px"}}>
                      Permanently 100% under OBBBA (signed July 4, 2025) for property placed in service after Jan. 19, 2025. Applies to 5-yr and 15-yr components only.
                    </div>
                    {/* Section 179 */}
                    <InputRow label="Section 179 (Yr 1)" value={tax.sec179Amount||0} onChange={v=>upd("tax.sec179Amount",v)} prefix="$"/>
                    <div style={{fontSize:"var(--text-xs)",color:"var(--muted)",padding:"2px 0 4px"}}>
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
    </>)}
    </div>
  </div>);
}

// ─── CASH FLOW TAB ────────────────────────────────────────────────────────────

export { ExpenseInputRow };
export default AssumptionsTab;
