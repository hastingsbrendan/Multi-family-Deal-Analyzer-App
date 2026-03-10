import React, { useState } from 'react';
import { iSty } from './ui/InputRow';
import { FMT_USD, FMT_PCT } from '../lib/constants';
import { useIsMobile } from '../lib/hooks';
import CFSectionHeader from './ui/CFSectionHeader';

function CashFlowTab({result,deal}){
  const [showExpDetail,setShowExpDetail]=useState(false);
  const [showTaxDetail,setShowTaxDetail]=useState(false);
  const [showCFDetail,setShowCFDetail]=useState(false);
  const [showCFDetail,setShowCFDetail]=useState(false);
  const EXP_KEYS=[["propertyTax","Property Tax"],["insurance","Property Insurance"],["maintenance","Maintenance"],["capex","CapEx Reserve"],["propertyMgmt","Prop. Mgmt"],["utilities","Utilities"]];
  const tdR=(bold,color)=>({padding:"6px 8px",textAlign:"right",fontSize:11,fontWeight:bold?700:400,whiteSpace:"nowrap",color:color==="accent"?"var(--accent)":color==="red"?"#ef4444":"var(--text)"});
  const tdL=(bold,indent,col)=>({padding:`6px 8px 6px ${indent?20:8}px`,color:col||(bold?"var(--text)":"var(--muted)"),fontWeight:bold?700:400,fontSize:indent?10:11,whiteSpace:"nowrap",position:"sticky",left:0,background:"var(--bg)",zIndex:1});
  const Yr=({children,bold,color})=>result.years.map(y=>(<td key={y.yr} style={tdR(bold,color)}>{children(y)}</td>));
  const R=({label,children,bold,color,indent,labelColor})=>(<tr><td style={tdL(bold,indent,labelColor)}>{label}</td>{children}</tr>);
  const oo=result.ooEnabled;
  const altRent=result.ooAltRentMonthly||0;

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
          <CFSectionHeader label="① Cash Flow"/>

          {/* Gross Rent — all units */}
          <R label="Gross Rent"><Yr>{y=>FMT_USD(y.grossRent)}</Yr></R>

          {/* OO rent deduction — amber sub-row, only when OO enabled */}
          {oo&&(<tr><td style={{...tdL(false,true,"#f59e0b"),userSelect:"none"}}>↳ − Unit {(result.ooUnit||0)+1} Rent (Yr 1–{result.ooYears})</td>{result.years.map(y=>(<td key={y.yr} style={{...tdR(!!y.ooRentDeduction,null),color:y.ooRentDeduction>0?"#f59e0b":"var(--muted)"}}>{y.ooRentDeduction>0?`(${FMT_USD(y.ooRentDeduction)})`:"—"}</td>))}</tr>)}

          {/* Vacancy — applied to tenant-only rent */}
          <R label="Vacancy Loss" color="red"><Yr color="red">{y=>FMT_USD(y.vacancyLoss)}</Yr></R>

          {/* EGI */}
          <R label="EGI" bold><Yr bold>{y=>FMT_USD(y.egi)}</Yr></R>
          {result.vaEnabled&&(<tr><td style={tdL(false,true,"#a78bfa")}>↳ VA Rent Lift (Yr {result.vaCompletionYr}+)</td>{result.years.map(y=>(<td key={y.yr} style={{...tdR(y.vaRentLift>0,null),color:y.vaRentLift>0?"#a78bfa":"var(--muted)"}}>{y.vaRentLift>0?`+${FMT_USD(y.vaRentLift)}`:"—"}</td>))}</tr>)}

          {/* Total Expenses — expandable */}
          <tr style={{cursor:"pointer"}} onClick={()=>setShowExpDetail(v=>!v)}>
            <td style={{...tdL(false,false),userSelect:"none"}}><span style={{color:"var(--accent)",marginRight:4,fontSize:9,display:"inline-block",transform:showExpDetail?"rotate(90deg)":"rotate(0)"}}>&#9658;</span>Total Expenses</td>
            {result.years.map(y=><td key={y.yr} style={tdR(false,"red")}>{FMT_USD(y.expenses)}</td>)}
          </tr>
          {showExpDetail&&EXP_KEYS.map(([k,lbl])=>(<tr key={k} style={{background:"var(--row-sub)"}}><td style={{...tdL(false,true),background:"var(--row-sub)"}}>&#x21b3; {lbl}</td>{result.years.map(y=><td key={y.yr} style={tdR(false,null)}>{FMT_USD(y.expBreakdown[k])}</td>)}</tr>))}

          {/* NOI */}
          <R label="NOI" bold><Yr bold>{y=>FMT_USD(y.noi)}</Yr></R>

          {/* Debt Service */}
          <tr>
            <td style={tdL(false,false)}>Debt Service</td>
            {result.years.map(y=>(<td key={y.yr} style={tdR(false,"red")}>{y.refiEvent&&<div style={{fontSize:8,fontWeight:800,color:"#f59e0b"}}>↻ Refi</div>}{FMT_USD(y.debtService)}</td>))}
          </tr>
          {result.refiYear&&(<tr><td style={{...tdL(false,true),color:"#f59e0b"}}>↳ Cash-Out (Yr {result.refiYear})</td>{result.years.map(y=>(<td key={y.yr} style={{...tdR(!!y.refiEvent,null),color:y.refiEvent?"#f59e0b":"var(--muted)"}}>{y.refiEvent?FMT_USD(y.refiEvent.cashOut):"—"}</td>))}</tr>)}

          {/* Owner Utilities — below debt service, amber, only during OO years */}
          {oo&&(<tr><td style={{...tdL(false,true,"#f59e0b")}}>↳ − Owner Utilities (Yr 1–{result.ooYears})</td>{result.years.map(y=>(<td key={y.yr} style={{...tdR(!!y.ooUtilities,null),color:y.ooUtilities>0?"#f59e0b":"var(--muted)"}}>{y.ooUtilities>0?`(${FMT_USD(y.ooUtilities)})`:"—"}</td>))}</tr>)}

          {/* Remodel outflow — above Cash Flow so it reads as a deduction leading into the total */}
          {result.vaEnabled&&(<tr><td style={{...tdL(false,true),color:"#a78bfa"}}>↳ Remodel Cost (Yr1–2)</td>{result.years.map(y=>(<td key={y.yr} style={{...tdR(y.vaRemodelOutflow>0,null),color:y.vaRemodelOutflow>0?"#a78bfa":"var(--muted)"}}>{y.vaRemodelOutflow>0?`(${FMT_USD(y.vaRemodelOutflow)})`:"—"}</td>))}</tr>)}

          {/* Cash Flow — unified bottom line */}
          <R label="Cash Flow" bold color="accent"><Yr bold color="accent">{y=>FMT_USD(y.cashFlow)}</Yr></R>

          {/* Monthly Net */}
          <tr><td style={{...tdL(false,true),color:"var(--accent2)",fontStyle:"italic"}}>↳ Monthly Net</td>{result.years.map(y=>{const mc=y.monthlyCashFlow;return(<td key={y.yr} style={{...tdR(true,null),color:mc>=0?"var(--accent2)":"#ef4444",fontStyle:"italic"}}>{mc>=0?FMT_USD(mc):`(${FMT_USD(Math.abs(mc))})`}</td>);})}</tr>

          {/* Alt Rent — muted, informational, only during OO years */}
          {oo&&altRent>0&&(<tr><td style={{...tdL(false,false),color:"var(--muted)"}}>Alt. Rent (if renting)</td>{result.years.map(y=>(<td key={y.yr} style={{...tdR(false,null),color:"var(--muted)",fontStyle:"italic"}}>{y.ooRentDeduction>0?`(${FMT_USD(altRent)}/mo)`:"—"}</td>))}</tr>)}

          {/* PAL Carryforward Balance — collapsible, only when advanced tax + carryforward exists */}
          {result.taxAdvEnabled&&result.years.some(y=>y.cumulativeCarryforward>0||y.carryforwardUsedThisYr>0)&&(
            <>
              <tr style={{cursor:"pointer",background:"rgba(245,158,11,0.04)"}} onClick={()=>setShowCFDetail(v=>!v)}>
                <td style={{...tdL(false,false,"#f59e0b"),userSelect:"none",fontWeight:700}}>
                  <span style={{color:"#f59e0b",marginRight:4,fontSize:9,display:"inline-block",transform:showCFDetail?"rotate(90deg)":"rotate(0)"}}>&#9658;</span>
                  PAL Carryforward Balance
                </td>
                {result.years.map(y=>{
                  const delta=y.suspendedLossThisYr-y.carryforwardUsedThisYr;
                  const isAdd=y.suspendedLossThisYr>0&&y.carryforwardUsedThisYr===0;
                  const isDraw=y.carryforwardUsedThisYr>0;
                  const isFlat=delta===0&&y.cumulativeCarryforward===0;
                  return(<td key={y.yr} style={{...tdR(true,null),color:isDraw?"var(--accent)":isAdd?"#f59e0b":"var(--muted)"}}>
                    {isFlat?"—":FMT_USD(y.cumulativeCarryforward)}
                  </td>);
                })}
              </tr>
              {showCFDetail&&result.years.map(y=>{
                const hasAdd=y.suspendedLossThisYr>0;
                const hasDraw=y.carryforwardUsedThisYr>0;
                if(!hasAdd&&!hasDraw) return null;
                return(<React.Fragment key={y.yr}>
                  {/* We render per-year detail as a column would be too wide — show as expandable note */}
                </React.Fragment>);
              })}
              {showCFDetail&&(
                <>
                  {result.years.some(y=>y.suspendedLossThisYr>0)&&(
                    <tr style={{background:"var(--row-sub)"}}><td style={{...tdL(false,true,"#f59e0b"),background:"var(--row-sub)"}}>&#x21b3; + Added (Suspended This Yr)</td>{result.years.map(y=><td key={y.yr} style={{...tdR(false,null),color:y.suspendedLossThisYr>0?"#f59e0b":"var(--muted)"}}>{y.suspendedLossThisYr>0?`+${FMT_USD(y.suspendedLossThisYr)}`:"—"}</td>)}</tr>
                  )}
                  {result.years.some(y=>y.carryforwardUsedThisYr>0)&&(
                    <tr style={{background:"var(--row-sub)"}}><td style={{...tdL(false,true),color:"var(--accent)",background:"var(--row-sub)"}}>&#x21b3; − Applied Against Income</td>{result.years.map(y=><td key={y.yr} style={{...tdR(false,null),color:y.carryforwardUsedThisYr>0?"var(--accent)":"var(--muted)"}}>{y.carryforwardUsedThisYr>0?`(${FMT_USD(y.carryforwardUsedThisYr)})`:"—"}</td>)}</tr>
                  )}
                  <tr><td colSpan={11} style={{padding:"3px 8px 8px 20px",fontSize:9,color:"var(--muted)",fontStyle:"italic",lineHeight:1.5}}>
                    Deferred tax asset — accumulated suspended passive losses (IRC §469). Releases in full on a taxable sale. Not released by a 1031 exchange.
                  </td></tr>
                </>
              )}
            </>
          )}

          {/* ── Tax Implications ── */}
          <CFSectionHeader label="② Tax Implications"/>

          {/* OO pro-rate notice — only during OO years */}
          {oo&&result.years.some(y=>y.ooTaxProrateRatio<1)&&(
            <tr><td colSpan={11} style={{padding:"5px 8px",fontSize:10,color:"#f59e0b",fontStyle:"italic",background:"rgba(245,158,11,0.06)"}}>
              ⚠ During owner-occupancy years only the rental share ({result.years[0]?.ooTaxProrateRatio<1?`${Math.round(result.years[0].ooTaxProrateRatio*100)}%`:"100%"}) of interest &amp; depreciation is deductible. The owner's share of operating expenses is added back to NOI since those costs were not incurred for rental purposes.
            </td></tr>
          )}

          {/* NOI reference row — starting point for tax derivation */}
          <tr><td style={{...tdL(false,false),color:"var(--muted)",fontStyle:"italic"}}>NOI (from above)</td>{result.years.map(y=><td key={y.yr} style={{...tdR(false,null),color:"var(--muted)",fontStyle:"italic"}}>{FMT_USD(y.noi)}</td>)}</tr>

          {/* Owner expense addback — only non-zero during OO years */}
          {oo&&result.years.some(y=>y.ooExpAddBack>0)&&(
            <tr><td style={{...tdL(false,true,"#f59e0b")}}>↳ + Owner Exp. Add-back ({result.years[0]?.ooTaxProrateRatio<1?`${Math.round((1-result.years[0].ooTaxProrateRatio)*100)}%`:""} non-deductible)</td>
              {result.years.map(y=><td key={y.yr} style={{...tdR(false,null),color:y.ooExpAddBack>0?"#f59e0b":"var(--muted)"}}>{y.ooExpAddBack>0?`+${FMT_USD(y.ooExpAddBack)}`:"—"}</td>)}
            </tr>
          )}

          {/* Mortgage Interest — prorated to rental units only during OO years */}
          <tr><td style={tdL(false,false)}>− Mortgage Interest {oo&&result.years[0]?.ooTaxProrateRatio<1?`(${Math.round(result.years[0].ooTaxProrateRatio*100)}% rental share)`:""}</td>{result.years.map(y=><td key={y.yr} style={tdR(false,"red")}>{FMT_USD(y.interest*y.ooTaxProrateRatio)}</td>)}</tr>

          {/* Depreciation — clickable to expand */}
          <tr style={{cursor:"pointer"}} onClick={()=>setShowTaxDetail(v=>!v)}>
            <td style={{...tdL(false,false),userSelect:"none"}}>
              <span style={{color:"var(--accent)",marginRight:4,fontSize:9,display:"inline-block",transform:showTaxDetail?"rotate(90deg)":"rotate(0)"}}>&#9658;</span>
              − {result.taxAdvEnabled?"Total Depreciation":"Depreciation (27.5yr)"}
            </td>
            {result.years.map(y=><td key={y.yr} style={tdR(false,"red")}>{FMT_USD(result.taxAdvEnabled?y.totalDepreciation:y.depreciation)}</td>)}
          </tr>
          {showTaxDetail&&result.taxAdvEnabled&&(<>
            <tr style={{background:"var(--row-sub)"}}><td style={{...tdL(false,true),background:"var(--row-sub)"}}>&#x21b3; SL Dep (27.5yr)</td>{result.years.map(y=><td key={y.yr} style={tdR(false,null)}>{FMT_USD(y.slDepreciation)}</td>)}</tr>
            {result.years.some(y=>y.cs5Depreciation>0)&&(
              <tr style={{background:"var(--row-sub)"}}><td style={{...tdL(false,true,"var(--accent2)"),background:"var(--row-sub)"}}>&#x21b3; Cost Seg 5-yr</td>{result.years.map(y=><td key={y.yr} style={{...tdR(false,null),color:y.cs5Depreciation>0?"var(--accent2)":"var(--muted)"}}>{y.cs5Depreciation>0?FMT_USD(y.cs5Depreciation):"—"}</td>)}</tr>
            )}
            {result.years.some(y=>y.cs15Depreciation>0)&&(
              <tr style={{background:"var(--row-sub)"}}><td style={{...tdL(false,true,"var(--accent2)"),background:"var(--row-sub)"}}>&#x21b3; Cost Seg 15-yr</td>{result.years.map(y=><td key={y.yr} style={{...tdR(false,null),color:y.cs15Depreciation>0?"var(--accent2)":"var(--muted)"}}>{y.cs15Depreciation>0?FMT_USD(y.cs15Depreciation):"—"}</td>)}</tr>
            )}
          </>)}

          {/* Taxable Income line */}
          {result.taxAdvEnabled?(
            <>
              <R label="= Taxable Income (Gross)" bold><Yr bold>{y=>FMT_USD(y.taxableIncomeAdv)}</Yr></R>
              {/* PAL Allowance Used — deductible portion of this year's loss (detail, collapsed) */}
              {showTaxDetail&&result.years.some(y=>y.palAllowedLoss>0)&&(
                <tr style={{background:"var(--row-sub)"}}><td style={{...tdL(false,true,"#f59e0b"),background:"var(--row-sub)"}}>&#x21b3; PAL Allowance Used</td>{result.years.map(y=><td key={y.yr} style={{...tdR(false,null),color:y.palAllowedLoss>0?"#f59e0b":"var(--muted)"}}>{y.palAllowedLoss>0?FMT_USD(y.palAllowedLoss):"—"}</td>)}</tr>
              )}
              {/* Suspended Loss This Year — detail only */}
              {showTaxDetail&&result.years.some(y=>y.suspendedLossThisYr>0)&&(
                <tr style={{background:"var(--row-sub)"}}><td style={{...tdL(false,true,"#f59e0b"),background:"var(--row-sub)"}}>&#x21b3; Suspended This Yr</td>{result.years.map(y=><td key={y.yr} style={{...tdR(false,null),color:y.suspendedLossThisYr>0?"#f59e0b":"var(--muted)"}}>{y.suspendedLossThisYr>0?`(${FMT_USD(y.suspendedLossThisYr)})`:"—"}</td>)}</tr>
              )}
              {/* Carryforward Applied — ALWAYS VISIBLE line item; shows derivation from Taxable Income to Eff. Taxable Income */}
              {result.years.some(y=>y.cumulativeCarryforward>0||y.carryforwardUsedThisYr>0)&&(
                <tr>
                  <td style={{...tdL(false,true),color:"var(--accent)"}}>↳ − Carryforward Applied</td>
                  {result.years.map(y=><td key={y.yr} style={{...tdR(false,null),color:y.carryforwardUsedThisYr>0?"var(--accent)":"var(--muted)"}}>
                    {y.carryforwardUsedThisYr>0?`(${FMT_USD(y.carryforwardUsedThisYr)})`:"—"}
                  </td>)}
                </tr>
              )}
              <R label="= Eff. Taxable Income" bold><Yr bold>{y=>FMT_USD(y.effectiveTaxIncAdv)}</Yr></R>
              <R label="− QBI Deduction (20%)" color="red"><Yr color="red">{y=>y.effectiveTaxIncAdv>0?FMT_USD(y.qbiAdv):"—"}</Yr></R>
            </>
          ):(
            <>
              <R label="= Taxable RE Income" bold><Yr bold>{y=>FMT_USD(y.taxableIncome)}</Yr></R>
              <R label="− QBI Deduction (20%)" color="red"><Yr color="red">{y=>y.taxableIncome>0?FMT_USD(y.qbi):"—"}</Yr></R>
            </>
          )}

          {/* Federal Tax / Benefit */}
          <tr><td style={tdL(true,false)}>Federal Tax / (Benefit)</td>
            {result.years.map(y=>{const te=result.taxAdvEnabled?y.taxEffectAdv:y.taxEffect;return(<td key={y.yr} style={{...tdR(true,null),color:te<0?"#10b981":"#ef4444"}}>{te<0?`(${FMT_USD(Math.abs(te))})`:FMT_USD(te)}</td>);})}
          </tr>
          <R label="After-Tax CF" bold color="accent"><Yr bold color="accent">{y=>FMT_USD(result.taxAdvEnabled?y.afterTaxCFAdv:y.afterTaxCashFlow)}</Yr></R>


          {/* ── PAL Carryforward Balance — collapsible, after After-Tax CF ─────────────
               Running balance of deferred tax asset (suspended losses not yet used).
               Expand to see: additions (suspended this yr) and subtractions (applied this yr).
               This is NOT cash — it reduces future tax bills and releases at taxable sale. */}
          {result.taxAdvEnabled&&result.years.some(y=>y.cumulativeCarryforward>0||y.suspendedLossThisYr>0)&&(
            <>
              {/* Collapsible header — shows running balance each year */}
              <tr style={{cursor:"pointer",background:"rgba(245,158,11,0.04)"}} onClick={()=>setShowCFDetail(v=>!v)}>
                <td style={{...tdL(false,false,"#f59e0b"),userSelect:"none",fontWeight:700}}>
                  <span style={{color:"#f59e0b",marginRight:4,fontSize:9,display:"inline-block",transform:showCFDetail?"rotate(90deg)":"rotate(0)"}}>&#9658;</span>
                  PAL Carryforward Balance
                </td>
                {result.years.map(y=>(
                  <td key={y.yr} style={{...tdR(true,null),color:y.cumulativeCarryforward>0?"#f59e0b":"var(--muted)"}}>
                    {y.cumulativeCarryforward>0?FMT_USD(y.cumulativeCarryforward):"—"}
                  </td>
                ))}
              </tr>

              {/* Expanded: +Suspended this year — loss that couldn't be deducted, adds to balance */}
              {showCFDetail&&result.years.some(y=>y.suspendedLossThisYr>0)&&(
                <tr style={{background:"var(--row-sub)"}}>
                  <td style={{...tdL(false,true,"#f59e0b"),background:"var(--row-sub)"}}>&#x21b3; + Suspended This Yr</td>
                  {result.years.map(y=>(
                    <td key={y.yr} style={{...tdR(false,null),color:y.suspendedLossThisYr>0?"#f59e0b":"var(--muted)"}}>
                      {y.suspendedLossThisYr>0?`+${FMT_USD(y.suspendedLossThisYr)}`:"—"}
                    </td>
                  ))}
                </tr>
              )}

              {/* Expanded: −Applied this year — prior losses drawn down against this year's income */}
              {showCFDetail&&result.years.some(y=>y.carryforwardUsedThisYr>0)&&(
                <tr style={{background:"var(--row-sub)"}}>
                  <td style={{...tdL(false,true),color:"var(--accent)",background:"var(--row-sub)"}}>&#x21b3; − Applied This Yr</td>
                  {result.years.map(y=>(
                    <td key={y.yr} style={{...tdR(false,null),color:y.carryforwardUsedThisYr>0?"var(--accent)":"var(--muted)"}}>
                      {y.carryforwardUsedThisYr>0?`(${FMT_USD(y.carryforwardUsedThisYr)})`:"—"}
                    </td>
                  ))}
                </tr>
              )}

              {/* Framing note */}
              <tr><td colSpan={11} style={{padding:"2px 8px 8px 8px",fontSize:10,color:"var(--muted)",fontStyle:"italic",lineHeight:1.5}}>
                Deferred tax asset — not cash. Reduces future taxable income and releases in full upon taxable sale. Not released by a 1031 exchange.
              </td></tr>
            </>
          )}

          {/* ── Equity Accumulation ── */}
          <CFSectionHeader label="③ Equity Accumulation"/>
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

export default CashFlowTab;
