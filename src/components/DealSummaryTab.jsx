import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from 'recharts';
import { iSty } from './ui/InputRow';
import { FMT_USD, FMT_PCT, mapsUrl } from '../lib/constants';;
import PhotoGallery from './PhotoGallery';
import DSCRBadge from './ui/DSCRBadge';

function DealSummaryTab({deal, result, onUpdate}) {
  const a = deal.assumptions;
  const addr = deal.address;
  const maps = mapsUrl(addr);

  // PITI components
  const pAndI = result.monthlyPayment||0;
  const taxMo = (result.baseExpBreakdown?.propertyTax||0)/12;
  const insMo = (result.baseExpBreakdown?.insurance||0)/12;
  const piti = pAndI + taxMo + insMo;

  // EGI excluding owner unit (for Effective Mortgage display — matches new calc engine)
  const ooUnit = result.ooEnabled ? result.ooUnit : -1;
  const egiExOO = (() => {
    const vac = (+a.vacancyRate||0)/100;
    const units = a.units.slice(0, a.numUnits);
    return units.reduce((s, u, i) => {
      if (i === ooUnit && result.ooEnabled) return s;
      return s + (+(u.rent||u.listedRent)||0) * 12 * (1-vac) / 12;
    }, 0);
  })();

  const effectiveMortgage = piti - egiExOO;
  const emPos = effectiveMortgage >= 0; // positive = still owe money after rents

  // Unified monthly cash flow (Year 1) — OO adjustments are now baked into cashFlow
  const regularCF = result.years[0]?.monthlyCashFlow||0;
  const ooCF = result.ooEnabled ? regularCF : null; // same value, kept for alt-rent comparison logic

  // Alt rent comparison
  const altRent = result.ooAltRentMonthly||0;
  // vsRent: altRent (what you'd pay to rent, positive) + monthly CF (signed net of owning)
  const vsRent = result.ooEnabled ? altRent + regularCF : 0;

  // Property detail fields
  const beds = a.beds||"—", baths = a.baths||"—";
  const yearBuilt = a.yearBuilt||"—", sqft = a.sqftTotal||"—", lotSize = a.lotSize||"—";
  const expectedClose = a.expectedCloseDate ? new Date(a.expectedCloseDate+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}) : "—";
  const numUnits = a.numUnits||0;

  // Expense breakdown for display
  const expBrk = result.baseExpBreakdown||{};
  const expRows = [
    ["Property Tax", expBrk.propertyTax],
    ["Insurance", expBrk.insurance],
    ["Maintenance", expBrk.maintenance],
    ["CapEx", expBrk.capex],
    ["Prop. Mgmt", expBrk.propertyMgmt],
    ["Utilities", expBrk.utilities],
  ].filter(([,v])=>v>0);

  const SubHdr = ({children}) => (
    <div style={{fontSize:11,fontWeight:800,letterSpacing:"0.12em",textTransform:"uppercase",color:"var(--accent)",marginBottom:8,marginTop:4,borderLeft:"3px solid var(--accent)",paddingLeft:8,fontFamily:"system-ui"}}>
      {children}
    </div>
  );

  const SLbl = ({children}) => (
    <div style={{fontSize:10,fontWeight:800,letterSpacing:"0.12em",textTransform:"uppercase",color:"var(--muted)",marginBottom:10,fontFamily:"system-ui"}}>{children}</div>
  );

  const KV = ({label,value,color,bold,last}) => (
    <div style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:last?"none":"1px solid var(--border)",fontFamily:"system-ui"}}>
      <span style={{fontSize:11,color:"var(--muted)"}}>{label}</span>
      <span style={{fontSize:12,fontWeight:bold?800:700,color:color||"var(--text)"}}>{value}</span>
    </div>
  );

  const Panel = ({children,accent,style}) => (
    <div style={{background:"var(--card)",border:"1px solid "+(accent?"rgba(13,148,136,0.25)":"var(--border)"),borderRadius:12,padding:"14px 14px",borderTop:accent?"2px solid var(--accent)":undefined,...style}}>
      {children}
    </div>
  );

  return(<div style={{padding:"16px 0"}}>

    {/* ── HEADER INFO BAR ── */}
    <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,padding:"10px 14px",marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
        <span style={{fontSize:11,fontWeight:700,background:"rgba(13,148,136,0.1)",color:"var(--accent)",borderRadius:6,padding:"3px 9px",fontFamily:"system-ui"}}>{numUnits} units</span>
        {sqft!=="—"&&<span style={{fontSize:11,fontWeight:700,background:"rgba(13,148,136,0.1)",color:"var(--accent)",borderRadius:6,padding:"3px 9px",fontFamily:"system-ui"}}>{typeof sqft==="number"?sqft.toLocaleString():sqft} sqft</span>}
        {result.ooEnabled&&<span style={{fontSize:11,fontWeight:700,background:"rgba(124,58,237,0.1)",color:"#7c3aed",borderRadius:6,padding:"3px 9px",fontFamily:"system-ui"}}>Owner-Occupied Yr 1–{result.ooYears}</span>}
      </div>
      <div style={{display:"flex",gap:14,alignItems:"center",flexWrap:"wrap"}}>
        {deal.showingDate&&<span style={{fontSize:11,color:"var(--muted)",fontFamily:"system-ui"}}>📅 Showing: <strong style={{color:"var(--text)"}}>{new Date(deal.showingDate+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}{deal.showingTime?" @ "+deal.showingTime:""}</strong></span>}
      </div>
    </div>

    {/* ══ SUBHEADER 1: Profitability (moved above cash flow) ══ */}
    <SubHdr>Profitability</SubHdr>

    {/* Profitability row: equity hero (left, 2-wide) + 2x2 returns grid (right) */}
    {(()=>{
      const yr10 = result.years[9]||{};
      const avgMonthlyAppreciation = (yr10.appreciationGain||0)/10/12;
      const avgMonthlyPrincipal = (yr10.principalPaydown||0)/10/12;
      // Avg monthly cash flow across all 10 years
      const avgMonthlyCashFlow = result.years.length
        ? result.years.reduce((s,y)=>s+(y.monthlyCashFlow||0),0)/result.years.length
        : 0;
      // Avg monthly tax benefit: negate annual tax effect so a tax saving is positive.
      // Uses advanced tax if enabled, basic otherwise. A net tax cost shows as negative.
      const avgMonthlyTaxBenefit = result.years.length
        ? result.years.reduce((s,y)=>{
            const te = result.taxAdvEnabled ? (y.taxEffectAdv||0) : (y.taxEffect||0);
            return s + (-te);
          }, 0) / result.years.length / 12
        : 0;
      const avgMonthlyEquity = avgMonthlyAppreciation + avgMonthlyPrincipal + avgMonthlyCashFlow + avgMonthlyTaxBenefit;
      // Build cumulative chart data: each year stacks the four contributors
      const chartData = result.years.map(y => {
        const taxBen = result.taxAdvEnabled ? -(y.taxEffectAdv||0) : -(y.taxEffect||0);
        return {
          yr: `Yr ${y.yr}`,
          appreciation: Math.round(y.appreciationGain||0),
          principal:    Math.round(y.principalPaydown||0),
          cashFlow:     Math.round((y.cashFlow||0) * y.yr), // cumulative
          taxBenefit:   Math.round(taxBen * y.yr),          // cumulative
        };
      });
      // Actually use truly cumulative sums for CF and tax
      let cumCF = 0, cumTax = 0;
      const chartDataCumulative = result.years.map(y => {
        cumCF  += (y.cashFlow||0);
        const taxBen = result.taxAdvEnabled ? -(y.taxEffectAdv||0) : -(y.taxEffect||0);
        cumTax += taxBen;
        return {
          yr: `Yr ${y.yr}`,
          Appreciation:       Math.round(y.appreciationGain||0),
          'Principal Paydown':Math.round(y.principalPaydown||0),
          'Cash Flow':        Math.round(cumCF),
          'Tax Benefit':      Math.round(cumTax),
        };
      });
      const fmtChartY = v => v>=1000000?`$${(v/1000000).toFixed(1)}M`:v>=1000?`$${(v/1000).toFixed(0)}K`:FMT_USD(v);
      const ChartTooltipContent = ({active,payload,label}) => {
        if(!active||!payload?.length) return null;
        const total = payload.reduce((s,p)=>s+(p.value||0),0);
        return(
          <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:"10px 14px",fontSize:12,minWidth:170,boxShadow:"0 4px 16px rgba(0,0,0,0.12)"}}>
            <div style={{fontWeight:800,color:"var(--text)",marginBottom:6,fontFamily:"system-ui"}}>{label}</div>
            {[...payload].reverse().map(p=>(
              <div key={p.name} style={{display:"flex",justifyContent:"space-between",gap:16,color:p.color,marginBottom:2}}>
                <span style={{color:"var(--muted)",fontWeight:500}}>{p.name}</span>
                <span style={{fontWeight:700}}>{fmtChartY(p.value)}</span>
              </div>
            ))}
            <div style={{borderTop:"1px solid var(--border)",marginTop:6,paddingTop:6,display:"flex",justifyContent:"space-between"}}>
              <span style={{color:"var(--muted)",fontWeight:600}}>Total Equity</span>
              <span style={{fontWeight:800,color:"var(--accent)"}}>{fmtChartY(total)}</span>
            </div>
          </div>
        );
      };
      const returnItems = [
        {label:"IRR (10-Year)",val:FMT_PCT(result.irr),good:result.irr>0.12,note:"Target: >12%"},
        {label:"Cap Rate Yr 1",val:FMT_PCT(result.capRate),good:result.capRate>0.05,note:"Target: >5%"},
        {label:"CoC Return",val:FMT_PCT(result.cocReturn),good:result.cocReturn>0.07,note:"Target: >7%"},
        {label:"Equity Multiple",val:FMT_X(result.equityMultiple),good:result.equityMultiple>2,note:"Target: >2x"},
      ];
      return(
        <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 2fr",gap:10,marginBottom:10,alignItems:"stretch"}}>
          {/* Col 1: Hero card */}
          <Panel accent style={{minHeight:280}}>
            <SLbl>Avg. Monthly Equity Growth · 10-Year Hold</SLbl>
            <div style={{fontSize:36,fontWeight:900,letterSpacing:"-2px",color:"var(--accent)",lineHeight:1,marginBottom:6}}>
              {avgMonthlyEquity>=0?"+":""}{FMT_USD(avgMonthlyEquity)}<span style={{fontSize:13,color:"var(--muted)",fontWeight:400,letterSpacing:0}}>/mo</span>
            </div>
            <div style={{borderTop:"1px solid var(--border)",paddingTop:8,display:"flex",flexDirection:"column",gap:4}}>
              {[
                ["Avg. Monthly Appreciation",     avgMonthlyAppreciation, "var(--accent)"],
                ["Avg. Monthly Principal Paydown", avgMonthlyPrincipal,    "var(--accent2)"],
                ["Avg. Monthly Cash Flow",         avgMonthlyCashFlow,     avgMonthlyCashFlow>=0?"var(--green)":"var(--red)"],
                ["Avg. Monthly Tax Benefit",       avgMonthlyTaxBenefit,   avgMonthlyTaxBenefit>=0?"var(--green)":"var(--red)"],
              ].map(([l,v,col])=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",fontFamily:"system-ui",fontSize:11.5}}>
                  <span style={{color:"var(--muted)"}}>{l}</span>
                  <span style={{fontWeight:700,color:col}}>{v>=0?"+":""}{FMT_USD(v)}/mo</span>
                </div>
              ))}
            </div>
          </Panel>
          {/* Col 2: 4 metric cards stacked */}
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {returnItems.map(({label,val,good,note})=>(
              <Panel key={label} style={{flex:1}}>
                <div style={{fontSize:10,color:"var(--muted)",fontFamily:"system-ui",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:4}}>{label}</div>
                <div style={{fontSize:20,fontWeight:900,color:good?"var(--accent)":"var(--accent2)",lineHeight:1}}>{val}</div>
                <div style={{fontSize:10,color:"var(--muted)",fontFamily:"system-ui",marginTop:4}}>{note}</div>
              </Panel>
            ))}
          </div>
          {/* Col 3: Stacked bar chart — Cumulative Equity Build-Up */}
          <Panel style={{padding:"14px 16px 10px",display:"flex",flexDirection:"column"}}>
            <div style={{marginBottom:8}}>
              <div style={{fontSize:11,fontWeight:800,color:"var(--text)",letterSpacing:"-0.1px",fontFamily:"'Fraunces',serif"}}>Cumulative Equity Build-Up</div>
              <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:4}}>
                {[
                  ["Appreciation","var(--accent)"],
                  ["Principal","var(--accent2)"],
                  ["Cash Flow","var(--green)"],
                  ["Tax","#a78bfa"],
                ].map(([label,color])=>(
                  <div key={label} style={{display:"flex",alignItems:"center",gap:4,fontSize:10,color:"var(--muted)"}}>
                    <div style={{width:8,height:8,borderRadius:2,background:color,flexShrink:0}}/>
                    {label}
                  </div>
                ))}
              </div>
            </div>
            <div style={{flex:1,minHeight:220}}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartDataCumulative} margin={{top:4,right:4,left:0,bottom:0}} barCategoryGap="25%">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
                  <XAxis dataKey="yr" tick={{fontSize:9,fill:"var(--muted)"}} axisLine={false} tickLine={false}/>
                  <YAxis tick={{fontSize:9,fill:"var(--muted)"}} tickFormatter={fmtChartY} width={46} axisLine={false} tickLine={false}/>
                  <Tooltip content={<ChartTooltipContent/>}/>
                  <Bar dataKey="Appreciation"      stackId="eq" fill="var(--accent)"  radius={[0,0,0,0]}/>
                  <Bar dataKey="Principal Paydown" stackId="eq" fill="#D97706"        radius={[0,0,0,0]}/>
                  <Bar dataKey="Cash Flow"         stackId="eq" fill="#10B981"        radius={[0,0,0,0]}/>
                  <Bar dataKey="Tax Benefit"       stackId="eq" fill="#a78bfa"        radius={[2,2,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </div>
      );
    })()}

    {/* Value Add band — only when VA enabled */}
    {result.vaEnabled&&(<div style={{background:"rgba(167,139,250,0.08)",border:"1px solid rgba(167,139,250,0.35)",borderRadius:12,padding:14,marginBottom:10}}>
      <div style={{fontSize:10,fontWeight:800,letterSpacing:"0.1em",color:"#a78bfa",marginBottom:10,textTransform:"uppercase",fontFamily:"system-ui"}}>🔨 Value Add Impact</div>
      <div style={{display:"flex",gap:16,flexWrap:"wrap",fontSize:13}}>
        <div><div style={{color:"var(--muted)",fontSize:11,marginBottom:2}}>TOTAL REMODEL COST</div><div style={{fontWeight:800,color:"var(--text)",fontSize:15}}>{FMT_USD(result.vaReModelCost)}</div><div style={{fontSize:11,color:"var(--muted)"}}>50/50 over Yr 1–2</div></div>
        <div><div style={{color:"var(--muted)",fontSize:11,marginBottom:2}}>ANNUAL RENT LIFT</div><div style={{fontWeight:800,color:"#a78bfa",fontSize:15}}>{FMT_USD(result.vaRentBump)}/yr</div><div style={{fontSize:11,color:"var(--muted)"}}>From Year {result.vaCompletionYr}</div></div>
        <div><div style={{color:"var(--muted)",fontSize:11,marginBottom:6}}>IRR COMPARISON</div><div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}><div style={{textAlign:"center"}}><div style={{fontSize:10,color:"var(--muted)",marginBottom:1}}>Without VA</div><div style={{fontSize:16,fontWeight:800,color:"var(--text)"}}>{FMT_PCT(result.irrWithoutVA)}</div></div><div style={{fontSize:18,color:"#a78bfa",fontWeight:800}}>→</div><div style={{textAlign:"center"}}><div style={{fontSize:10,color:"var(--muted)",marginBottom:1}}>With VA</div><div style={{fontSize:16,fontWeight:800,color:"#a78bfa"}}>{FMT_PCT(result.irrWithVA)}</div></div><div style={{background:result.irrWithVA>result.irrWithoutVA?"rgba(167,139,250,0.15)":"rgba(239,68,68,0.1)",borderRadius:6,padding:"3px 8px",fontSize:12,fontWeight:800,color:result.irrWithVA>result.irrWithoutVA?"#a78bfa":"#ef4444"}}>{result.irrWithVA>result.irrWithoutVA?"+":""}{FMT_PCT(result.irrWithVA-result.irrWithoutVA)}</div></div></div>
      </div>
    </div>)}

    {/* ══ SUBHEADER 2: Monthly Cash Flow ══ */}
    <SubHdr>Understanding Your Monthly Cash Flow</SubHdr>

    {(()=>{
      // ── derived monthly values ──
      const grossRentMo   = result.grossRentYear0/12;
      const vacancyMo     = grossRentMo*(+a.vacancyRate||0)/100;
      const egiAllMo      = (result.years[0]?.egi||0)/12;
      const pitiMo        = piti;
      const opexMo        = result.baseExpenses/12;
      const cfMo          = regularCF;

      // PITI slices
      const pitiSlices = [
        {name:"P&I",        value:pAndI,  color:"#0D9488"},
        {name:"Prop. Tax",  value:taxMo,  color:"#0891B2"},
        {name:"Insurance",  value:insMo,  color:"#7C3AED"},
      ].filter(s=>s.value>0);

      // OpEx slices — operating only (prop tax + insurance already shown in PITI)
      const opexSlices = [
        {name:"Maintenance", value:(expBrk.maintenance||0)/12,  color:"#D97706"},
        {name:"CapEx",       value:(expBrk.capex||0)/12,        color:"#EA580C"},
        {name:"Prop. Mgmt",  value:(expBrk.propertyMgmt||0)/12, color:"#DC2626"},
        {name:"Utilities",   value:(expBrk.utilities||0)/12,    color:"#9333EA"},
      ].filter(s=>s.value>0);

      // Custom donut label renderer — just show pct inside
      const DonutChart = ({slices, centerLabel, centerSub}) => {
        const [hovered, setHovered] = React.useState(null);
        const total = slices.reduce((s,x)=>s+x.value,0);
        if(!total) return <div style={{fontSize:11,color:"var(--muted)",textAlign:"center",padding:16}}>No data</div>;
        return(
          <div style={{position:"relative",width:"100%"}}>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie
                  data={slices} cx="50%" cy="50%"
                  innerRadius="52%" outerRadius="78%"
                  paddingAngle={2} dataKey="value"
                  onMouseEnter={(_,i)=>setHovered(i)}
                  onMouseLeave={()=>setHovered(null)}
                  strokeWidth={0}
                >
                  {slices.map((s,i)=>(
                    <Cell key={s.name} fill={s.color}
                      opacity={hovered===null||hovered===i?1:0.35}
                      style={{cursor:"default",outline:"none"}}
                    />
                  ))}
                </Pie>
                <Tooltip
                  content={({active,payload})=>{
                    if(!active||!payload?.length) return null;
                    const p=payload[0].payload;
                    return(
                      <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:8,padding:"7px 11px",fontSize:11,boxShadow:"0 4px 12px rgba(0,0,0,0.1)"}}>
                        <div style={{fontWeight:800,color:p.color,marginBottom:2}}>{p.name}</div>
                        <div style={{color:"var(--text)",fontWeight:700}}>{FMT_USD(p.value)}<span style={{color:"var(--muted)",fontWeight:400}}>/mo</span></div>
                        <div style={{color:"var(--muted)",fontSize:10}}>{Math.round(p.value/total*100)}% of total</div>
                      </div>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            {/* Center label */}
            <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",textAlign:"center",pointerEvents:"none"}}>
              <div style={{fontSize:14,fontWeight:900,color:"var(--text)",lineHeight:1,fontFamily:"system-ui"}}>{FMT_USD(total)}</div>
              <div style={{fontSize:9,color:"var(--muted)",marginTop:1}}>{centerSub}</div>
            </div>
          </div>
        );
      };

      // Waterfall step bar — rent → expenses → CF
      const wfTotal = grossRentMo;
      const WFBar = ({label, value, color, pct, isResult}) => (
        <div style={{marginBottom:6}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:3,fontFamily:"system-ui",fontSize:11}}>
            <span style={{color:isResult?"var(--text)":"var(--muted)",fontWeight:isResult?700:500}}>{label}</span>
            <span style={{fontWeight:700,color:isResult?(value>=0?"var(--green)":"var(--red)"):color}}>
              {isResult?(value>=0?"+":"")+FMT_USD(value)+"/mo" : FMT_USD(Math.abs(value))+"/mo"}
            </span>
          </div>
          <div style={{height:isResult?8:5,background:"var(--bg2)",borderRadius:99,overflow:"hidden",border:"1px solid var(--border)"}}>
            <div style={{height:"100%",width:Math.max(0,Math.min(100,pct))+"%",background:color,borderRadius:99,transition:"width 0.3s"}}/>
          </div>
        </div>
      );
      const egiPct   = wfTotal>0?Math.min(100,egiAllMo/wfTotal*100):0;
      const pitiPct  = wfTotal>0?Math.min(100,pitiMo/wfTotal*100):0;
      const opexPct  = wfTotal>0?Math.min(100,opexMo/wfTotal*100):0;
      const cfPct    = wfTotal>0?Math.min(100,Math.abs(cfMo)/wfTotal*100):0;

      return(
        <div style={{marginBottom:10}}>

          {/* ── Row A: CF hero + Effective Mortgage + PITI coverage ── */}
          <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:10,marginBottom:10}}>

            {/* Cash Flow hero */}
            <Panel accent>
              <SLbl>{result.ooEnabled?"Monthly Cash Flow · You in Unit "+(( result.ooUnit||0)+1)+", Yr 1":"Non-Occ. Cash Flow · Year 1"}</SLbl>
              <div style={{fontSize:44,fontWeight:900,letterSpacing:"-2px",color:regularCF>=0?"#16a34a":"var(--accent2)",lineHeight:1,marginBottom:10}}>
                {regularCF>=0?"+":"-"}{FMT_USD(Math.abs(regularCF))}<span style={{fontSize:14,color:"var(--muted)",fontWeight:400,letterSpacing:0}}>/mo</span>
              </div>
              {/* Alt rent comparison — OO only */}
              {result.ooEnabled&&altRent>0&&(
                <div style={{background:vsRent>=0?"rgba(13,148,136,0.08)":"rgba(217,119,6,0.08)",border:"1px solid "+(vsRent>=0?"rgba(13,148,136,0.25)":"rgba(217,119,6,0.3)"),borderRadius:8,padding:"9px 12px"}}>
                  <div style={{fontSize:10,fontFamily:"system-ui",fontWeight:800,letterSpacing:"0.1em",textTransform:"uppercase",color:"var(--muted)",marginBottom:6}}>vs. Alternative Rent</div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
                    <div style={{fontFamily:"system-ui",fontSize:12}}>
                      <div style={{color:"var(--muted)",marginBottom:2}}>If you rented instead</div>
                      <div style={{fontWeight:800,fontSize:15,color:"#dc2626"}}>−{FMT_USD(altRent)}<span style={{fontSize:11,fontWeight:400,color:"var(--muted)"}}>/mo</span></div>
                    </div>
                    <div style={{background:vsRent>=0?"var(--accent)":"var(--accent2)",color:"#fff",borderRadius:8,padding:"5px 10px",fontFamily:"system-ui",fontSize:12,fontWeight:800,textAlign:"center",whiteSpace:"nowrap"}}>
                      {vsRent>=0?"▼ ":"▲ "}{FMT_USD(Math.abs(vsRent))}/mo<br/>
                      <span style={{fontSize:10,fontWeight:600,opacity:0.85}}>{vsRent>=0?"cheaper to buy":"pricier than renting"}</span>
                    </div>
                  </div>
                </div>
              )}
            </Panel>

            {/* Effective Mortgage */}
            <Panel style={{borderTop:"2px solid var(--accent)"}}>
              <SLbl>Effective Mortgage</SLbl>
              <div style={{fontSize:11,color:"var(--muted)",fontFamily:"system-ui",marginBottom:8}}>PITI − Tenant rents</div>
              <div style={{fontSize:28,fontWeight:900,letterSpacing:"-1px",color:emPos?"#dc2626":"#16a34a",lineHeight:1,marginBottom:10}}>
                {emPos?"+":"-"}{FMT_USD(Math.abs(effectiveMortgage))}<span style={{fontSize:13,color:"var(--muted)",fontWeight:400,letterSpacing:0}}>/mo</span>
              </div>
              <div style={{fontSize:10,fontWeight:700,fontFamily:"system-ui",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>Rent covers PITI</div>
              <div style={{height:5,background:"var(--bg2)",borderRadius:99,border:"1px solid var(--border)",overflow:"hidden",marginBottom:4}}>
                <div style={{height:"100%",width:Math.min(100,Math.round((egiExOO/Math.max(piti,1))*100))+"%",background:"linear-gradient(90deg,var(--accent),#34d399)",borderRadius:99}}/>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",fontFamily:"system-ui",fontSize:10,color:"var(--muted)"}}>
                <span>PITI <strong style={{color:"var(--text)"}}>{FMT_USD(piti)}</strong></span>
                <span style={{fontWeight:800,color:"var(--accent)"}}>{Math.round(Math.min(100,(egiExOO/Math.max(piti,1))*100))}%</span>
                <span>EGI <strong style={{color:"var(--accent)"}}>{FMT_USD(egiExOO)}</strong></span>
              </div>
            </Panel>

            {/* Income → Cash Flow waterfall bar */}
            <Panel>
              <SLbl>Monthly Waterfall</SLbl>
              <WFBar label="Gross Rent"   value={grossRentMo}  color="var(--accent)"  pct={100}     />
              <WFBar label="−Vacancy"     value={-vacancyMo}   color="#ef4444"        pct={vacancyMo/wfTotal*100}/>
              <WFBar label="EGI"          value={egiAllMo}     color="var(--accent)"  pct={egiPct}  />
              <WFBar label="−PITI"        value={-pitiMo}      color="#0891B2"        pct={pitiPct} />
              <WFBar label="−OpEx"        value={-opexMo}      color="#D97706"        pct={opexPct} />
              <WFBar label="Cash Flow"    value={cfMo}         color={cfMo>=0?"#10B981":"#ef4444"} pct={cfPct} isResult/>
            </Panel>
          </div>

          {/* ── Row B: PITI donut + OpEx donut ── */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:0}}>

            {/* PITI donut */}
            <Panel>
              <SLbl>PITI Breakdown · /mo</SLbl>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,alignItems:"center"}}>
                <DonutChart slices={pitiSlices} centerSub="total/mo"/>
                <div>
                  {pitiSlices.map(s=>(
                    <div key={s.name} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:"1px solid var(--border)"}}>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <div style={{width:8,height:8,borderRadius:2,background:s.color,flexShrink:0}}/>
                        <span style={{fontSize:11,color:"var(--muted)",fontFamily:"system-ui"}}>{s.name}</span>
                      </div>
                      <span style={{fontSize:12,fontWeight:700,color:"var(--text)",fontFamily:"system-ui"}}>{FMT_USD(s.value)}</span>
                    </div>
                  ))}
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0"}}>
                    <span style={{fontSize:11,fontWeight:700,color:"var(--text)",fontFamily:"system-ui"}}>Total</span>
                    <span style={{fontSize:13,fontWeight:900,color:"var(--text)",fontFamily:"system-ui"}}>{FMT_USD(pitiSlices.reduce((s,x)=>s+x.value,0))}</span>
                  </div>
                </div>
              </div>
            </Panel>

            {/* OpEx donut */}
            <Panel>
              <SLbl>Operating Expenses · /mo (excl. tax &amp; insurance)</SLbl>
              {opexSlices.length>0?(
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,alignItems:"center"}}>
                  <DonutChart slices={opexSlices} centerSub="total/mo"/>
                  <div>
                    {opexSlices.map(s=>(
                      <div key={s.name} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:"1px solid var(--border)"}}>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <div style={{width:8,height:8,borderRadius:2,background:s.color,flexShrink:0}}/>
                          <span style={{fontSize:11,color:"var(--muted)",fontFamily:"system-ui"}}>{s.name}</span>
                        </div>
                        <span style={{fontSize:12,fontWeight:700,color:"var(--text)",fontFamily:"system-ui"}}>{FMT_USD(s.value)}</span>
                      </div>
                    ))}
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0"}}>
                      <span style={{fontSize:11,fontWeight:700,color:"var(--text)",fontFamily:"system-ui"}}>Total</span>
                      <span style={{fontSize:13,fontWeight:900,color:"var(--text)",fontFamily:"system-ui"}}>{FMT_USD(opexSlices.reduce((s,x)=>s+x.value,0))}</span>
                    </div>
                  </div>
                </div>
              ):(
                <div style={{fontSize:11,color:"var(--muted)",fontFamily:"system-ui",padding:"12px 0"}}>No operating expenses configured in Assumptions.</div>
              )}
            </Panel>
          </div>
        </div>
      );
    })()}
    {/* ══ SUBHEADER 3 ══ */}
    <SubHdr>Property Details</SubHdr>

    {/* Row 3: 3-column detail panels */}
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>

      {/* Col 1: Property facts + Exit */}
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <Panel>
          <SLbl>Property</SLbl>
          {[
            ["Units", numUnits],
            ["Year Built", yearBuilt],
            ["Sq Ft", sqft!=="—"&&typeof sqft==="number"?sqft.toLocaleString():sqft],
            ["Lot Size", lotSize],
            ["Beds / Unit", beds],
            ["Baths / Unit", baths],
            ["Expected Close", expectedClose],
          ].map(([l,v],i,arr)=><KV key={l} label={l} value={v} last={i===arr.length-1}/>)}
        </Panel>
        <Panel>
          <SLbl>Exit (Year 10)</SLbl>
          {/* Gross proceeds waterfall */}
          <KV label="Exit Value" value={FMT_USD(result.exitValue)}/>
          <KV label="− Loan Payoff" value={FMT_USD(-result.exitLoanBalance)} color="var(--red)"/>
          <KV label="= Gross Proceeds" value={FMT_USD(result.exitValue-result.exitLoanBalance)} bold/>
          {/* Tax stack */}
          <div style={{marginTop:6,marginBottom:2,fontSize:9,fontWeight:800,letterSpacing:"0.08em",textTransform:"uppercase",color:"var(--muted)",fontFamily:"system-ui"}}>Tax on Sale</div>
          <KV label="Total Gain" value={FMT_USD(result.totalGainOnSale)}/>
          <KV label="§1250 Recapture (25%)" value={FMT_USD(-result.recaptureTax)} color="var(--red)"/>
          <KV label="LTCG (15%)" value={FMT_USD(-result.ltcgTax)} color="var(--red)"/>
          {/* PAL carryforward benefit — deferred tax asset, not cash */}
          {result.taxAdvEnabled&&result.palTaxBenefit>0&&(
            <div style={{background:"rgba(245,158,11,0.07)",border:"1px solid rgba(245,158,11,0.25)",borderRadius:6,padding:"5px 8px",margin:"4px 0"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
                <span style={{fontSize:10,color:"#f59e0b",fontFamily:"system-ui",fontWeight:700}}>Suspended Loss Tax Benefit</span>
                <span style={{fontSize:11,color:"#f59e0b",fontWeight:700,fontFamily:"system-ui"}}>+{FMT_USD(result.palTaxBenefit)}</span>
              </div>
              <div style={{fontSize:9,color:"var(--muted)",fontFamily:"system-ui",marginTop:2,lineHeight:1.4}}>
                Deferred tax asset — reduces tax owed at sale, not additional cash proceeds. Releases {FMT_USD(result.finalPalCarryforward)} of accumulated suspended losses at your {Math.round((result.taxAdvEnabled&&deal?.assumptions?.taxBracket)||22)}% bracket.
              </div>
            </div>
          )}
          <KV label="Net Tax on Sale" value={FMT_USD(-result.netTaxOnSale)} color="var(--red)" bold/>
          <div style={{height:1,background:"var(--border)",margin:"6px 0"}}/>
          <KV label="Net Proceeds" value={FMT_USD(result.netProceeds)} color="var(--accent)" bold last/>
          {!result.taxAdvEnabled&&result.finalPalCarryforward>0&&(
            <div style={{fontSize:9,color:"var(--muted)",fontStyle:"italic",fontFamily:"system-ui",marginTop:4,lineHeight:1.4}}>
              Enable Advanced Tax Modeling to see §1250 recapture and suspended loss tax benefit.
            </div>
          )}
          <div style={{fontSize:9,color:"var(--muted)",fontStyle:"italic",fontFamily:"system-ui",marginTop:4,lineHeight:1.4}}>
            A 1031 exchange defers all taxes shown above — suspended losses are not released.
          </div>
        </Panel>
      </div>

      {/* Col 2: Financing */}
      <Panel>
        <SLbl>Financing</SLbl>
        {[
          ["Purchase Price", FMT_USD(+a.purchasePrice)],
          ["Down Payment", FMT_USD(result.totalCashBase-(Object.values(a.closingCosts||{}).reduce((s,v)=>s+(+v||0),0)))+" ("+(+a.downPaymentPct||25)+"%)"],
          ["Loan Amount", FMT_USD(result.loanAmt)],
          ["Interest Rate", (+a.interestRate||7).toFixed(3)+"%"],
          ["Amortization", (a.amortYears||30)+" years"],
          ["Total Cash In", FMT_USD(result.totalCash)],
        ].map(([l,v],i)=><KV key={l} label={l} value={v}/>)}
        <div style={{marginTop:10,borderTop:"1px solid var(--border)",paddingTop:8}}>
          <div style={{fontSize:10,fontWeight:800,fontFamily:"system-ui",color:"var(--muted)",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:6}}>PITI Breakdown</div>
          <KV label="P&I" value={FMT_USD(pAndI)+"/mo"}/>
          <KV label="Property Tax" value={FMT_USD(taxMo)+"/mo"}/>
          <KV label="Insurance" value={FMT_USD(insMo)+"/mo"}/>
          <div style={{display:"flex",justifyContent:"space-between",padding:"7px 0",fontFamily:"system-ui"}}>
            <span style={{fontSize:12,fontWeight:800,color:"var(--text)"}}>PITI Total</span>
            <span style={{fontSize:14,fontWeight:900,color:"var(--text)"}}>{FMT_USD(piti)}/mo</span>
          </div>
        </div>
      </Panel>

      {/* Col 3: Rents + Expenses */}
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <Panel>
          <SLbl>Rents</SLbl>
          {a.units.slice(0,numUnits).map((u,i)=>(
            <KV key={i} label={"Unit "+(i+1)+(result.ooEnabled&&i===result.ooUnit?" 🏠":"")} value={FMT_USD(+(u.rent||u.listedRent)||0)+"/mo"} color={result.ooEnabled&&i===result.ooUnit?"var(--muted)":"var(--text)"}/>
          ))}
          <KV label="Gross Rent" value={FMT_USD(result.grossRentYear0/12)+"/mo"}/>
          <KV label={"Vacancy ("+((+a.vacancyRate)||0)+"%)"} value={FMT_USD(-result.grossRentYear0/12*(+a.vacancyRate||0)/100)+"/mo"} color="#dc2626"/>
          <KV label="EGI (All Units)" value={FMT_USD(result.years[0]?.egi/12||0)+"/mo"} color="var(--accent)" bold/>
          {result.ooEnabled&&<KV label="EGI (Tenant Only)" value={FMT_USD(egiExOO)+"/mo"} color="var(--accent)" bold/>}
          <KV label="NOI Year 1" value={FMT_USD(result.noi)+"/yr"} color="var(--accent)" last/>
        </Panel>
        <Panel>
          <SLbl>Annual Expenses</SLbl>
          {expRows.map(([l,v],i)=><KV key={l} label={l} value={FMT_USD(v)+"/yr"} last={i===expRows.length-1}/>)}
          {expRows.length===0&&<div style={{fontSize:12,color:"var(--muted)",fontFamily:"system-ui"}}>No expenses configured.</div>}
        </Panel>
      </div>
    </div>

    {/* ── GOOGLE MAP ── */}
    {maps && (
      <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,overflow:"hidden",marginBottom:10}}>
        <a href={maps} target="_blank" rel="noreferrer" style={{display:"block",textDecoration:"none"}}>
          <img
            src={"https://maps.googleapis.com/maps/api/staticmap?center="+encodeURIComponent(addr)+"&zoom=15&size=800x600&scale=2&maptype=roadmap&markers=color:red%7C"+encodeURIComponent(addr)+"&key=AIzaSyAg90J2ZmwbAwPwlRHTeREfAWfiOwR1hiQ"}
            alt="Map"
            style={{width:"100%",height:300,objectFit:"cover",display:"block"}}
          />
        </a>
        <div style={{padding:"8px 12px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <span style={{fontSize:12,color:"var(--muted)",fontWeight:600}}>📍 {addr}</span>
          <a href={maps} target="_blank" rel="noreferrer" style={{fontSize:12,color:"var(--accent)",fontWeight:700,textDecoration:"none"}}>Open in Maps →</a>
        </div>
      </div>
    )}

    {/* ── PHOTOS + NOTES side by side, double height ── */}
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
      <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,padding:14,minHeight:220}}>
        <div style={{fontSize:10,fontWeight:800,letterSpacing:"0.12em",textTransform:"uppercase",color:"var(--muted)",marginBottom:10,fontFamily:"system-ui"}}>Photos</div>
        <PhotoGallery deal={deal} onUpdate={onUpdate}/>
      </div>
      <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,padding:14,minHeight:220}}>
        <div style={{fontSize:10,fontWeight:800,letterSpacing:"0.12em",textTransform:"uppercase",color:"var(--muted)",marginBottom:10,fontFamily:"system-ui"}}>Notes</div>
        <textarea value={deal.notes||""} onChange={e=>onUpdate({...deal,notes:e.target.value})} placeholder="Add qualitative notes about this property, showing observations, negotiation strategy..." style={{width:"100%",height:170,background:"var(--input-bg)",border:"1px solid var(--border)",borderRadius:8,padding:"10px 12px",color:"var(--text)",fontSize:13,resize:"none",fontFamily:"system-ui",lineHeight:1.5,boxSizing:"border-box"}}/>
      </div>
    </div>

    {/* ── Rentcast Property Data ── */}
    {deal.assumptions.rentcastData && (()=>{
      const rd = deal.assumptions.rentcastData;
      const rcTax = rd.annualTax;
      const DataRow = ({label, value, highlight}) => (value != null && value !== "" && value !== "—") ? (
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:"1px solid var(--border-faint)"}}>
          <span style={{fontSize:12,color:"var(--muted)",fontWeight:600}}>{label}</span>
          <span style={{fontSize:13,fontWeight:700,color:highlight?"#6366F1":"var(--text)"}}>{value}</span>
        </div>
      ) : null;
      return(
        <div style={{marginTop:8,padding:"12px 0"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:"2px solid #6366F1",paddingBottom:6,marginBottom:12}}>
            <div style={{fontSize:12,fontWeight:800,letterSpacing:"0.1em",color:"#6366F1",textTransform:"uppercase"}}>🔍 Rentcast Property Data</div>
            <span style={{fontSize:11,color:"var(--muted)"}}>Fetched {rd.fetchedAt}</span>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 24px"}}>
            <div>
              <DataRow label="Property Type" value={rd.propertyType}/>
              <DataRow label="Bedrooms / Bathrooms" value={rd.bedrooms!=null?`${rd.bedrooms} bed / ${rd.bathrooms||"?"} bath`:null}/>
              <DataRow label="Square Footage" value={rd.squareFootage?rd.squareFootage.toLocaleString()+" sq ft":null}/>
              <DataRow label="Year Built" value={rd.yearBuilt}/>
              <DataRow label="Lot Size" value={rd.lotSize?rd.lotSize.toLocaleString()+" sq ft":null}/>
              <DataRow label="HOA Fee" value={rd.hoaFee?FMT_USD(rd.hoaFee)+"/mo":null} highlight={!!rd.hoaFee}/>
            </div>
            <div>
              <DataRow label="Assessed Value" value={rd.assessedValue?"$"+Math.round(rd.assessedValue).toLocaleString():null}/>
              <DataRow label="Annual Property Tax" value={rcTax?"$"+Math.round(rcTax).toLocaleString():null} highlight={!!rcTax}/>
              <DataRow label="Last Sale Price" value={rd.lastSalePrice?"$"+Math.round(rd.lastSalePrice).toLocaleString():null}/>
              <DataRow label="Last Sale Date" value={rd.lastSaleDate?new Date(rd.lastSaleDate).toLocaleDateString():null}/>
              <DataRow label="Rentcast Rent Est." value={rd.rentEstimate?FMT_USD(rd.rentEstimate)+"/mo":null} highlight={!!rd.rentEstimate}/>
              <DataRow label="Rent Range" value={(rd.rentEstimateLow&&rd.rentEstimateHigh)?`$${Math.round(rd.rentEstimateLow).toLocaleString()}–$${Math.round(rd.rentEstimateHigh).toLocaleString()}/mo`:null}/>
            </div>
          </div>
          {rd.hoaFee>0&&<div style={{marginTop:8,padding:"6px 10px",background:"#FEF3C7",borderRadius:6,fontSize:11,color:"#92400E"}}>⚠️ HOA fee of {FMT_USD(rd.hoaFee)}/mo detected — consider adding this as a monthly expense in Assumptions.</div>}
        </div>
      );
    })()}
  </div>);
}
// ─── EXPENSE INPUT ROW ────────────────────────────────────────────────────────

export default DealSummaryTab;
