import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { iSty } from './ui/InputRow';
import { FMT_USD, FMT_PCT } from '../lib/constants';;
import { useIsMobile } from '../lib/hooks';
import CFSectionHeader from './ui/CFSectionHeader';

function CashFlowTab({result,deal}){
  const [showExpDetail,setShowExpDetail]=useState(false);
  const [showTaxDetail,setShowTaxDetail]=useState(false);
  const EXP_KEYS=[["propertyTax","Property Tax"],["insurance","Property Insurance"],["maintenance","Maintenance"],["capex","CapEx Reserve"],["propertyMgmt","Prop. Mgmt"],["utilities","Utilities"]];
  const tdR=(bold,color)=>({padding:"6px 8px",textAlign:"right",fontSize:11,fontWeight:bold?700:400,whiteSpace:"nowrap",color:color==="accent"?"var(--accent)":color==="red"?"#ef4444":"var(--text)"});
  const tdL=(bold,indent,col)=>({padding:`6px 8px 6px ${indent?20:8}px`,color:col||(bold?"var(--text)":"var(--muted)"),fontWeight:bold?700:400,fontSize:indent?10:11,whiteSpace:"nowrap",position:"sticky",left:0,background:"var(--bg)",zIndex:1});
  const Yr=({children,bold,color})=>result.years.map(y=>(<td key={y.yr} style={tdR(bold,color)}>{children(y)}</td>));
  const R=({label,children,bold,color,indent,labelColor})=>(<tr><td style={tdL(bold,indent,labelColor)}>{label}</td>{children}</tr>);
  return(<div style={{padding:"16px 0"}}>
    <div style={{fontSize:11,color:"var(--muted)",marginBottom:8}}>← Swipe to see all years</div>
    <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
      <table style={{borderCollapse:"collapse",fontSize:11}}>
        <thead>
          <tr style={{background:"var(--table-head)"}}>
            {["","Yr1","Yr2","Yr3","Yr4","Yr5","Yr6","Yr7","Yr8","Yr9","Yr10"].map(h=>(<th key={h} style={{padding:"6px 8px",textAlign:h===""?"left":"right",color:"var(--muted)",fontWeight:700,fontSize:10,letterSpacing:"0.05em",borderBottom:"1px solid var(--border)",whiteSpace:"nowrap",position:h===""?"sticky":"static",left:0,background:"var(--table-head)",zIndex:h===""?2:0,minWidth:h===""?100:62}}>{h}</th>))}
          </tr>
        </thead>
        <tbody>
          <CFSectionHeader label="① Investment Cash Flow"/>
          <R label="Gross Rent"><Yr>{y=>FMT_USD(y.grossRent)}</Yr></R>
          <R label="Vacancy Loss" color="red"><Yr color="red">{y=>FMT_USD(y.vacancyLoss)}</Yr></R>
          <R label="EGI" bold><Yr bold>{y=>FMT_USD(y.egi)}</Yr></R>
          {result.vaEnabled&&(<tr><td style={tdL(false,true,"#a78bfa")}>↳ VA Rent Lift (Yr {result.vaCompletionYr}+)</td>{result.years.map(y=>(<td key={y.yr} style={{...tdR(y.vaRentLift>0,null),color:y.vaRentLift>0?"#a78bfa":"var(--muted)"}}>{y.vaRentLift>0?`+${FMT_USD(y.vaRentLift)}`:"—"}</td>))}</tr>)}
          <tr style={{cursor:"pointer"}} onClick={()=>setShowExpDetail(v=>!v)}>
            <td style={{...tdL(false,false),userSelect:"none"}}><span style={{color:"var(--accent)",marginRight:4,fontSize:9,display:"inline-block",transform:showExpDetail?"rotate(90deg)":"rotate(0)"}}>&#9658;</span>Total Expenses</td>
            {result.years.map(y=><td key={y.yr} style={tdR(false,"red")}>{FMT_USD(y.expenses)}</td>)}
          </tr>
          {showExpDetail&&EXP_KEYS.map(([k,lbl])=>(<tr key={k} style={{background:"var(--row-sub)"}}><td style={{...tdL(false,true),background:"var(--row-sub)"}}>&#x21b3; {lbl}</td>{result.years.map(y=><td key={y.yr} style={tdR(false,null)}>{FMT_USD(y.expBreakdown[k])}</td>)}</tr>))}
          <R label="NOI" bold><Yr bold>{y=>FMT_USD(y.noi)}</Yr></R>
          <tr>
            <td style={tdL(false,false)}>Debt Service</td>
            {result.years.map(y=>(<td key={y.yr} style={tdR(false,"red")}>{y.refiEvent&&<div style={{fontSize:8,fontWeight:800,color:"#f59e0b"}}>↻ Refi</div>}{FMT_USD(y.debtService)}</td>))}
          </tr>
          {result.refiYear&&(<tr><td style={{...tdL(false,true),color:"#f59e0b"}}>↳ Cash-Out (Yr {result.refiYear})</td>{result.years.map(y=>(<td key={y.yr} style={{...tdR(!!y.refiEvent,null),color:y.refiEvent?"#f59e0b":"var(--muted)"}}>{y.refiEvent?FMT_USD(y.refiEvent.cashOut):"—"}</td>))}</tr>)}
          <R label="Cash Flow" bold color="accent"><Yr bold color="accent">{y=>FMT_USD(y.cashFlow)}</Yr></R>
          {result.vaEnabled&&(<tr><td style={{...tdL(false,true),color:"#a78bfa"}}>↳ Remodel (Yr1–2)</td>{result.years.map(y=>(<td key={y.yr} style={{...tdR(y.vaRemodelOutflow>0,null),color:y.vaRemodelOutflow>0?"#a78bfa":"var(--muted)"}}>{y.vaRemodelOutflow>0?`(${FMT_USD(y.vaRemodelOutflow)})`:"—"}</td>))}</tr>)}
          <R label="CoC Return" color="accent"><Yr color="accent">{y=>FMT_PCT(y.cocReturn)}</Yr></R>
          {result.ooEnabled&&(<>
            <CFSectionHeader label="② Owner Occupied Cash Flow"/>
            <R label="Cash Flow (Invest.)" bold color="accent"><Yr bold color="accent">{y=>FMT_USD(y.cashFlow)}</Yr></R>
            <tr><td style={{...tdL(false,true),color:"#f59e0b"}}>↳ − Unit {(result.ooUnit||0)+1} Rent (Yr 1–{result.ooYears})</td>{result.years.map(y=>(<td key={y.yr} style={{...tdR(y.ooRentLost>0,null),color:y.ooRentLost>0?"#f59e0b":"var(--muted)"}}>{y.ooRentLost>0?`(${FMT_USD(y.ooRentLost)})`:"—"}</td>))}</tr>
            <tr><td style={{...tdL(false,true),color:"#f59e0b"}}>↳ − Owner Utilities (Yr 1–{result.ooYears})</td>{result.years.map(y=>(<td key={y.yr} style={{...tdR(y.ooUtilities>0,null),color:y.ooUtilities>0?"#f59e0b":"var(--muted)"}}>{y.ooUtilities>0?`(${FMT_USD(y.ooUtilities)})`:"—"}</td>))}</tr>
            <R label="Owner Occ. Cash Flow" bold color="accent"><Yr bold color="accent">{y=>y.ooCashFlow!==null?FMT_USD(y.ooCashFlow):FMT_USD(y.cashFlow)}</Yr></R>
            <tr><td style={{...tdL(false,true),color:"var(--accent2)",fontStyle:"italic"}}>↳ Monthly Net</td>{result.years.map(y=>{const mc=y.ooCashFlow!==null?y.ooMonthlyCashFlow:y.monthlyCashFlow;return(<td key={y.yr} style={{...tdR(true,null),color:mc>=0?"var(--accent2)":"#ef4444",fontStyle:"italic"}}>{mc>=0?FMT_USD(mc):`(${FMT_USD(Math.abs(mc))})`}</td>);})}</tr>
            <tr><td style={{...tdL(false,false),color:"var(--muted)"}}>Alt. Rent (if renting)</td>{result.years.map(y=>(<td key={y.yr} style={{...tdR(false,null),color:"var(--muted)",fontStyle:"italic"}}>{y.ooRentLost>0?`(${FMT_USD(result.ooAltRentMonthly)}/mo)`:"—"}</td>))}</tr>
          </>)}
          <CFSectionHeader label={result.ooEnabled?"③ Tax Implications":"② Tax Implications"}/>
          {/* Depreciation row — clickable toggle for detail */}
          <tr style={{cursor:"pointer"}} onClick={()=>setShowTaxDetail(v=>!v)}>
            <td style={{...tdL(false,false),userSelect:"none"}}>
              <span style={{color:"var(--accent)",marginRight:4,fontSize:9,display:"inline-block",transform:showTaxDetail?"rotate(90deg)":"rotate(0)"}}>&#9658;</span>
              {result.taxAdvEnabled?"Total Depreciation":"Depreciation (27.5yr)"}
            </td>
            {result.years.map(y=><td key={y.yr} style={tdR(false,"red")}>{FMT_USD(result.taxAdvEnabled?y.totalDepreciation:y.depreciation)}</td>)}
          </tr>
          {/* Detail rows — expanded */}
          {showTaxDetail&&(<>
            {result.taxAdvEnabled&&(<>
              <tr style={{background:"var(--row-sub)"}}><td style={{...tdL(false,true),background:"var(--row-sub)"}}>&#x21b3; SL Dep (27.5yr)</td>{result.years.map(y=><td key={y.yr} style={tdR(false,null)}>{FMT_USD(y.slDepreciation)}</td>)}</tr>
              {result.years.some(y=>y.cs5Depreciation>0)&&(
                <tr style={{background:"var(--row-sub)"}}><td style={{...tdL(false,true),background:"var(--row-sub)",color:"var(--accent2)"}}>&#x21b3; Cost Seg 5-yr</td>{result.years.map(y=><td key={y.yr} style={{...tdR(false,null),color:y.cs5Depreciation>0?"var(--accent2)":"var(--muted)"}}>{y.cs5Depreciation>0?FMT_USD(y.cs5Depreciation):"—"}</td>)}</tr>
              )}
              {result.years.some(y=>y.cs15Depreciation>0)&&(
                <tr style={{background:"var(--row-sub)"}}><td style={{...tdL(false,true),background:"var(--row-sub)",color:"var(--accent2)"}}>&#x21b3; Cost Seg 15-yr</td>{result.years.map(y=><td key={y.yr} style={{...tdR(false,null),color:y.cs15Depreciation>0?"var(--accent2)":"var(--muted)"}}>{y.cs15Depreciation>0?FMT_USD(y.cs15Depreciation):"—"}</td>)}</tr>
              )}
            </>)}
            <R label="Mortgage Interest" color="red"><Yr color="red">{y=>FMT_USD(y.interest)}</Yr></R>
            {result.taxAdvEnabled?(<>
              <R label="Taxable Income (Gross)" bold><Yr bold>{y=>FMT_USD(y.taxableIncomeAdv)}</Yr></R>
              {result.years.some(y=>y.palAllowedLoss>0)&&(
                <tr style={{background:"var(--row-sub)"}}><td style={{...tdL(false,true,"#f59e0b"),background:"var(--row-sub)"}}>&#x21b3; PAL Allowance Used</td>{result.years.map(y=><td key={y.yr} style={{...tdR(false,null),color:y.palAllowedLoss>0?"#f59e0b":"var(--muted)"}}>{y.palAllowedLoss>0?FMT_USD(y.palAllowedLoss):"—"}</td>)}</tr>
              )}
              <R label="Eff. Taxable Income" bold><Yr bold>{y=>FMT_USD(y.effectiveTaxIncAdv)}</Yr></R>
              <R label="QBI Deduction (20%)" color="red"><Yr color="red">{y=>y.effectiveTaxIncAdv>0?FMT_USD(y.qbiAdv):"—"}</Yr></R>
            </>):(<>
              <R label="Taxable RE Income" bold><Yr bold>{y=>FMT_USD(y.taxableIncome)}</Yr></R>
              <R label="QBI Deduction (20%)" color="red"><Yr color="red">{y=>y.taxableIncome>0?FMT_USD(y.qbi):"—"}</Yr></R>
            </>)}
          </>)}
          {/* Federal Tax / Benefit — always visible */}
          <tr><td style={tdL(true,false)}>Federal Tax / (Benefit)</td>
            {result.years.map(y=>{const te=result.taxAdvEnabled?y.taxEffectAdv:y.taxEffect;return(<td key={y.yr} style={{...tdR(true,null),color:te<0?"#10b981":"#ef4444"}}>{te<0?`(${FMT_USD(Math.abs(te))})`:FMT_USD(te)}</td>);})}
          </tr>
          <R label="After-Tax CF" bold color="accent"><Yr bold color="accent">{y=>FMT_USD(result.taxAdvEnabled?y.afterTaxCFAdv:y.afterTaxCashFlow)}</Yr></R>
          <CFSectionHeader label={result.ooEnabled?"④ Equity Accumulation":"③ Equity Accumulation"}/>
          <R label="Property Value"><Yr>{y=>FMT_USD(y.propertyValue)}</Yr></R>
          <R label="Loan Balance" color="red"><Yr color="red">{y=>FMT_USD(y.balance)}</Yr></R>
          <R label="Principal Paydown"><Yr>{y=>FMT_USD(y.principalPaydown)}</Yr></R>
          <R label="Appreciation Gain"><Yr>{y=>FMT_USD(y.appreciationGain)}</Yr></R>
          <R label="Total Equity" bold color="accent"><Yr bold color="accent">{y=>FMT_USD(y.equity)}</Yr></R>
        </tbody>
      </table>
    </div>
  </div>);
}

// ─── RENT COMPS TAB ──────────────────────────────────────────────────────────

export default CashFlowTab;
