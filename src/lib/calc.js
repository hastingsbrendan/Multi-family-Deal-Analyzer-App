// ─── Financial calculation engine ────────────────────────────────────────────
import { sbClient } from './constants';
const DEFAULT_PREFS = {
  // Default assumptions applied to every new deal
  downPaymentPct:   25,
  interestRate:     7.0,
  amortYears:       30,
  vacancyRate:      5,
  rentGrowth:       3,
  expenseGrowth:    3,
  appreciationRate: 3,
  taxBracket:       22,
  closingCosts: { title:1500, transferTax:2000, inspection:500, attorney:1000, lenderFees:2000, discountPoints:0, appraisal:600, creditReport:50 },
  // Expense defaults
  propertyTaxPct:   1.5,
  insurancePct:     0.5,
  maintenancePct:   5,
  capexPct:         5,
  propertyMgmtPct:  8,
  // Red flag thresholds
  dscrFloor:        1.2,
  capRateFloor:     0.06,
  expRatioCeiling:  0.50 };

// newDeal accepts optional user prefs to seed defaults
const newDeal = (prefs) => {
  const p = { ...DEFAULT_PREFS, ...(prefs || {}) };
  return ({
  id: Date.now(), address: "", status: "Analyzing", notes: "", showingDate: "", showingTime: "", photos: [],
  assumptions: {
    purchasePrice: 450000, purchasePriceSource: "",
    downPaymentPct: p.downPaymentPct, downPaymentSource: "", downPaymentDollar: 0,
    loanLimit: 0, loanAmount: 0,
    interestRate: p.interestRate, interestRateSource: "",
    amortYears: p.amortYears, amortSource: "",
    closingCosts: { ...p.closingCosts },
    insuranceUpfront: false,
    sellerConcessions: 0, sellerConcessionsSource: "",
    pmi: 0, pmiSource: "",
    units: Array(4).fill(null).map((_,i) => ({ rent: 0, rentSource:"", listedRent: 0, rentcastRent: 0 })),
    numUnits: 2,
    beds: "", baths: "", yearBuilt: "", sqftTotal: "", lotSize: "", annualPropertyTax: "", expectedCloseDate: "",
    vacancyRate: p.vacancyRate, vacancySource: "",
    expenseModes: { propertyTax:"pct", insurance:"pct", maintenance:"pct", capex:"pct", propertyMgmt:"pct", utilities:"value" },
    expenses: {
      propertyTax:6000, propertyTaxSource:"", propertyTaxPct: p.propertyTaxPct,
      insurance:1800, insuranceSource:"", insurancePct: p.insurancePct,
      maintenance:2400, maintenanceSource:"", maintenancePct: p.maintenancePct,
      capex:2400, capexSource:"", capexPct: p.capexPct,
      propertyMgmt:2160, propertyMgmtSource:"", propertyMgmtPct: p.propertyMgmtPct,
      utilities:0, utilitiesSource:"", utilitiesPct:0 },
    selfManage:false, rentGrowth: p.rentGrowth, expenseGrowth: p.expenseGrowth, appreciationRate: p.appreciationRate, taxBracket: p.taxBracket,
    ownerOccupied:true, ownerUnit:0, ownerOccupancyYears:2, alternativeRent:0, ownerUseUtilities:0,
    refi: { enabled:false, year:5, newRate:6.5, newLTV:75 },
    valueAdd: { enabled:false, reModelCost:40000, rentBumpPerUnit:200, unitsRenovated:2, completionYear:3 } },
  comps: Array(5).fill(null).map(() => ({ address:"", source:"", units:Array(4).fill(null).map(()=>({rent:0})), numUnits:2, distance:"" })),
  showing: {
    impression: "",
    units: Array(4).fill(null).map(() => ({
      condition: "", notes: "", rehabMode: "lump",
      rehabLump: 0, rehabPhase: "1",
      lineItems: [
        {cat:"Flooring",cost:0,phase:"1"},{cat:"Kitchen",cost:0,phase:"1"},
        {cat:"Bathrooms",cost:0,phase:"1"},{cat:"Paint",cost:0,phase:"1"},
        {cat:"Appliances",cost:0,phase:"1"},{cat:"Electrical",cost:0,phase:"1"},
        {cat:"Plumbing",cost:0,phase:"1"},{cat:"HVAC",cost:0,phase:"1"},
        {cat:"Roof",cost:0,phase:"1"},{cat:"Windows",cost:0,phase:"1"},
        {cat:"Other",cost:0,phase:"1",customLabel:""},
      ] })),
    exterior: {
      condition: "", notes: "", rehabMode: "lump",
      rehabLump: 0, rehabPhase: "1",
      lineItems: [
        {cat:"Roof",cost:0,phase:"1"},{cat:"Siding",cost:0,phase:"1"},
        {cat:"Foundation",cost:0,phase:"1"},{cat:"Landscaping",cost:0,phase:"1"},
        {cat:"Driveway/Parking",cost:0,phase:"1"},{cat:"Windows/Doors",cost:0,phase:"1"},
        {cat:"Other",cost:0,phase:"1",customLabel:""},
      ] } },
  redFlags: { manual: [] } }); };

// ─── GROUPS API ──────────────────────────────────────────────────────

async function sbGetMyGroups() {
  const { data: { user } } = await sbClient.auth.getUser();
  if (!user) return [];
  const { data: memberships } = await sbClient
    .from('group_members').select('group_id, role, status').eq('user_id', user.id);
  if (!memberships?.length) return [];
  const groupIds = memberships.map(m => m.group_id);
  const { data: groups } = await sbClient
    .from('groups').select('id, name, description, created_by, created_at').in('id', groupIds);
  return (groups || []).map(g => ({
    ...g,
    role:   memberships.find(m => m.group_id === g.id)?.role   || 'Viewer',
    status: memberships.find(m => m.group_id === g.id)?.status || 'active' }));
}

async function sbGetPendingInvites() {
  const { data: { user } } = await sbClient.auth.getUser();
  if (!user) return [];
  const { data } = await sbClient
    .from('group_members')
    .select('group_id, role, invited_by, created_at, groups(name, description)')
    .eq('user_id', user.id).eq('status', 'pending');
  return data || [];
}

async function sbCreateGroup(name, description) {
  const { data: { user } } = await sbClient.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { data: group, error } = await sbClient
    .from('groups').insert({ name, description: description || '', created_by: user.id })
    .select().single();
  if (error) throw error;
  await sbClient.from('group_members').insert({
    group_id: group.id, user_id: user.id, role: 'Owner',
    status: 'active', invited_by: user.id
  });
  return group;
}

async function sbInviteMember(groupId, email, role) {
  const { data: { user } } = await sbClient.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { data: profile } = await sbClient
    .from('profiles').select('id').eq('email', email).maybeSingle();
  if (!profile) {
    const { error } = await sbClient.from('group_invites_pending')
      .insert({ group_id: groupId, invited_email: email, role, invited_by: user.id });
    if (error) throw error;
    return { pending: true };
  }
  const { error } = await sbClient.from('group_members')
    .insert({ group_id: groupId, user_id: profile.id, role, status: 'pending', invited_by: user.id });
  if (error) throw error;
  return { pending: false };
}

async function sbRespondToInvite(groupId, accept) {
  const { data: { user } } = await sbClient.auth.getUser();
  if (!user) return;
  if (accept) {
    await sbClient.from('group_members').update({ status: 'active' })
      .eq('group_id', groupId).eq('user_id', user.id);
  } else {
    await sbClient.from('group_members').delete()
      .eq('group_id', groupId).eq('user_id', user.id);
  }
}

async function sbLeaveGroup(groupId) {
  const { data: { user } } = await sbClient.auth.getUser();
  if (!user) return;
  await sbClient.from('group_members').delete()
    .eq('group_id', groupId).eq('user_id', user.id);
}

async function sbGetGroupMembers(groupId) {
  const { data } = await sbClient
    .from('group_members')
    .select('user_id, role, status, profiles(display_name, email)')
    .eq('group_id', groupId);
  return data || [];
}

async function sbUpdateMemberRole(groupId, memberId, newRole) {
  await sbClient.from('group_members').update({ role: newRole })
    .eq('group_id', groupId).eq('user_id', memberId);
}

async function sbRemoveMember(groupId, memberId) {
  await sbClient.from('group_members').delete()
    .eq('group_id', groupId).eq('user_id', memberId);
}

async function sbGetGroupDeals(groupId) {
  const { data } = await sbClient
    .from('group_deals').select('deal_data, updated_at')
    .eq('group_id', groupId).order('updated_at', { ascending: false });
  return (data?.[0]?.deal_data) || [];
}

async function sbWriteGroupDeals(groupId, deals) {
  const { data: { user } } = await sbClient.auth.getUser();
  if (!user) return;
  const { error } = await sbClient.from('group_deals')
    .upsert({ group_id: groupId, deal_data: deals, updated_by: user.id, updated_at: new Date().toISOString() },
            { onConflict: 'group_id' });
  if (error) throw error;
}

async function sbShareDealToGroup(deal, groupId) {
  const { data: { user } } = await sbClient.auth.getUser();
  const existing = await sbGetGroupDeals(groupId);
  // Merge with a default deal so calcDeal never crashes on missing fields
  const sharedDeal = {
    ...newDeal(DEFAULT_PREFS),
    ...deal,
    id: Date.now(),
    sharedFromUserId: user?.id,
    sharedAt: new Date().toISOString()
  };
  await sbWriteGroupDeals(groupId, [...existing, sharedDeal]);
  return sharedDeal;
}

// ─── FINANCIAL ENGINE ─────────────────────────────────────────────────────────
function resolveExpenses(a, grossRentYear0) {
  const modes = a.expenseModes || {};
  const val = (vk, pk) => (modes[vk]==="pct") ? grossRentYear0*((+a.expenses[pk]||0)/100) : (+a.expenses[vk]||0);
  const mgmt = a.selfManage ? 0 : val("propertyMgmt","propertyMgmtPct");
  const pt=val("propertyTax","propertyTaxPct"), ins=val("insurance","insurancePct");
  const maint=val("maintenance","maintenancePct"), capex=val("capex","capexPct"), util=val("utilities","utilitiesPct");
  return { propertyTax:pt, insurance:ins, maintenance:maint, capex, propertyMgmt:mgmt, utilities:util, total:pt+ins+maint+capex+mgmt+util };
}

function calcDeal(deal) {
  if (!deal?.assumptions) return {};
  const a = deal.assumptions;
  const pp=+a.purchasePrice||0, dpPct=(+a.downPaymentPct||25)/100, dp=pp>0?pp*dpPct:(+a.downPaymentDollar||0);
  const insUpfront=a.insuranceUpfront?(+a.expenses?.insurance||0):0;
  const closingCostsTotal=Object.values(a.closingCosts).reduce((s,v)=>s+(+v||0),0)+insUpfront;
  const totalCash=dp+closingCostsTotal-(+a.sellerConcessions||0);
  const naturalLoanCalc=Math.max(0,pp-dp-(+a.sellerConcessions||0));
  const loanLimitCalc=+a.loanLimit||0;
  const loanAmt=loanLimitCalc>0?Math.min(naturalLoanCalc,loanLimitCalc):pp-dp, rate=(+a.interestRate||7)/100/12, n=(+a.amortYears||30)*12;
  const monthlyPayment=loanAmt>0&&rate>0?loanAmt*(rate*Math.pow(1+rate,n))/(Math.pow(1+rate,n)-1):loanAmt/n;
  const annualDebtService=monthlyPayment*12;
  const grossRentYear0=a.units.slice(0,a.numUnits).reduce((s,u)=>s+(+(u.rent||u.listedRent)||0)*12,0);
  // Owner-occupancy: one unit not rented for ownerOccupancyYears years
  const ooEnabled=!!a.ownerOccupied;
  const ooUnit=ooEnabled?Math.min(+a.ownerUnit||0,a.numUnits-1):null;
  const ooYears=ooEnabled?Math.max(1,+a.ownerOccupancyYears||2):0;
  const ooAnnualRentLost=ooEnabled?(+(a.units[ooUnit]?.rent||a.units[ooUnit]?.listedRent)||0)*12:0;
  const ooAnnualUtilities=ooEnabled?(+a.ownerUseUtilities||0):0;
  const ooAltRentMonthly=ooEnabled?(+a.alternativeRent||0):0;
  const vacRate=(+a.vacancyRate||0)/100, rentGrowth=(+a.rentGrowth||0)/100;
  const expGrowth=(+a.expenseGrowth||0)/100, appRate=(+a.appreciationRate||0)/100;
  const baseExp=resolveExpenses(a,grossRentYear0), baseExpenses=baseExp.total;
  const years=[];
  let balance=loanAmt;
  const refiEnabled=a.refi?.enabled&&+a.refi?.year>=1&&+a.refi?.year<=9;
  const refiYear=refiEnabled?+a.refi.year:null;
  const refiRate=refiEnabled?(+a.refi.newRate||7)/100/12:null;
  const refiLTV=refiEnabled?(+a.refi.newLTV||75)/100:null;
  let refiCashOut=0, currentMonthlyPayment=monthlyPayment, currentAnnualDebtService=annualDebtService;
  const va=a.valueAdd||{}, vaEnabled=!!va.enabled;
  const vaCompletionYr=vaEnabled?Math.max(1,Math.min(10,+va.completionYear||3)):null;
  const vaReModelCost=vaEnabled?(+va.reModelCost||0):0;
  const vaRentBump=vaEnabled?(+va.rentBumpPerUnit||0)*Math.min(+va.unitsRenovated||0,a.numUnits)*12:0;
  const totalCashWithVA=totalCash+vaReModelCost;
  for(let yr=1;yr<=10;yr++){
    let refiEvent=null;
    if(refiEnabled&&yr===refiYear){
      const pv=pp*Math.pow(1+appRate,yr-1), newLoanAmt=pv*refiLTV;
      refiCashOut=Math.max(0,newLoanAmt-balance);
      const refiN=(+a.amortYears||30)*12;
      const newMonthly=newLoanAmt>0&&refiRate>0?newLoanAmt*(refiRate*Math.pow(1+refiRate,refiN))/(Math.pow(1+refiRate,refiN)-1):newLoanAmt/refiN;
      balance=newLoanAmt; currentMonthlyPayment=newMonthly; currentAnnualDebtService=newMonthly*12;
      refiEvent={cashOut:refiCashOut,newLoanAmt,newRate:a.refi.newRate};
    }
    const vaRentLiftThisYr=vaEnabled&&yr>=vaCompletionYr?vaRentBump:0;
    const ooRentLostThisYr=ooEnabled&&yr<=ooYears?ooAnnualRentLost:0;
    const ooUtilitiesThisYr=ooEnabled&&yr<=ooYears?ooAnnualUtilities*Math.pow(1+(+a.expenseGrowth||0)/100,yr-1):0;
    const grossRent=(grossRentYear0+vaRentLiftThisYr)*Math.pow(1+rentGrowth,yr-1);
    const vacancyLoss=grossRent*vacRate, egi=grossRent-vacancyLoss;
    const mult=Math.pow(1+expGrowth,yr-1);
    const expBreakdown={propertyTax:baseExp.propertyTax*mult,insurance:baseExp.insurance*mult,maintenance:baseExp.maintenance*mult,capex:baseExp.capex*mult,propertyMgmt:baseExp.propertyMgmt*mult,utilities:baseExp.utilities*mult};
    const expenses=baseExpenses*mult, noi=egi-expenses;
    let principal=0,interest=0,newBalance=balance;
    if(balance>0){for(let m=0;m<12;m++){const intPay=newBalance*(refiEnabled&&yr>=refiYear?refiRate:rate);const prinPay=currentMonthlyPayment-intPay;interest+=intPay;principal+=prinPay;newBalance-=prinPay;}}
    balance=newBalance;
    const vaRemodelOutflow=yr===1?vaReModelCost/2:yr===2?vaReModelCost/2:0;
    const cashFlow=noi-currentAnnualDebtService+(refiEvent?refiEvent.cashOut:0)-vaRemodelOutflow;
    const monthlyCashFlow=cashFlow/12;
    const cocReturn=totalCashWithVA>0?(noi-currentAnnualDebtService)/totalCashWithVA:0;
    const capRate=pp>0?noi/pp:0, dscr=currentAnnualDebtService>0?noi/currentAnnualDebtService:0;
    const annualDepreciation=(pp*0.8)/27.5, taxableIncome=noi-interest-annualDepreciation;
    const qbi=taxableIncome>0?taxableIncome*0.2:0, federalTaxable=taxableIncome-qbi;
    const bracketRate=(+a.taxBracket||22)/100, taxEffect=federalTaxable*bracketRate;
    const afterTaxCashFlow=(noi-currentAnnualDebtService)-taxEffect+(refiEvent?refiEvent.cashOut:0)-vaRemodelOutflow;
    const baseCapRate=grossRentYear0*(1-vacRate)-baseExpenses>0&&pp>0?(grossRentYear0*(1-vacRate)-baseExpenses)/pp:0.06;
    const vaImpliedValueLift=vaEnabled&&yr>=vaCompletionYr&&baseCapRate>0?(vaRentBump*(1-vacRate))/baseCapRate:0;
    const propertyValue=pp*Math.pow(1+appRate,yr)+vaImpliedValueLift;
    const ooCashFlow=ooEnabled&&yr<=ooYears?cashFlow-ooRentLostThisYr-ooUtilitiesThisYr:null;
    const ooMonthlyCashFlow=ooCashFlow!==null?ooCashFlow/12:null;
    years.push({yr,grossRent,vacancyLoss,egi,expenses,expBreakdown,noi,debtService:currentAnnualDebtService,cashFlow,monthlyCashFlow,cocReturn,capRate,dscr,principal,interest,balance:newBalance,depreciation:annualDepreciation,taxableIncome,qbi,taxEffect,afterTaxCashFlow,propertyValue,equity:propertyValue-newBalance,appreciationGain:propertyValue-pp,principalPaydown:loanAmt-newBalance,refiEvent,vaRemodelOutflow,vaRentLift:vaRentLiftThisYr,ooRentLost:ooRentLostThisYr,ooUtilities:ooUtilitiesThisYr,ooCashFlow,ooMonthlyCashFlow});
  }
  const exitValue=years[9]?.propertyValue||pp*Math.pow(1+appRate,10);
  const capitalGains=exitValue-pp, capitalGainsTax=capitalGains*0.15;
  const netProceeds=exitValue-(years[9]?.balance||0)-capitalGainsTax;
  const irrCFs=[-totalCashWithVA,...years.map(y=>y.cashFlow)]; irrCFs[10]+=netProceeds;
  let irr=0.1;
  for(let i=0;i<100;i++){let npv=0,dnpv=0;irrCFs.forEach((cf,t)=>{npv+=cf/Math.pow(1+irr,t);dnpv-=t*cf/Math.pow(1+irr,t+1);});if(Math.abs(npv)<0.01)break;irr-=npv/dnpv;}
  const equityMultiple=totalCashWithVA>0?(years.reduce((s,y)=>s+y.cashFlow,0)+netProceeds)/totalCashWithVA:0;
  const breakEvenOccupancy=grossRentYear0>0?(annualDebtService+baseExpenses)/grossRentYear0:0;
  let irrWithoutVA=irr,irrWithVA=irr;
  if(vaEnabled){const d2=JSON.parse(JSON.stringify(deal));d2.assumptions.valueAdd={...va,enabled:false};irrWithoutVA=calcDeal(d2).irr;irrWithVA=irr;}
  return {totalCash:totalCashWithVA,totalCashBase:totalCash,loanAmt,monthlyPayment,annualDebtService,grossRentYear0,baseExpenses,baseExpBreakdown:baseExp,noi:years[0]?.noi||0,cocReturn:years[0]?.cocReturn||0,capRate:years[0]?.capRate||0,dscr:years[0]?.dscr||0,irr,equityMultiple,breakEvenOccupancy,exitValue,netProceeds,capitalGainsTax,years,refiCashOut,refiYear:refiEnabled?refiYear:null,vaEnabled,vaReModelCost,vaRentBump,vaCompletionYr,irrWithoutVA,irrWithVA,ooEnabled,ooUnit,ooYears,ooAnnualRentLost,ooAltRentMonthly};
}

function calcSensitivity(deal) {
  const base=calcDeal(deal);
  const deltas=[{label:"Rent",unit:"±10%",key:"rent",range:[-0.1,0.1]},{label:"Vacancy",unit:"±5pp",key:"vacancy",range:[-5,5]},{label:"Purchase Price",unit:"±10%",key:"price",range:[-0.1,0.1]},{label:"Interest Rate",unit:"±1%",key:"rate",range:[-1,1]},{label:"Appreciation",unit:"±1%",key:"appr",range:[-1,1]}];
  return deltas.map(d=>{
    const [low,high]=d.range.map(delta=>{
      const m=JSON.parse(JSON.stringify(deal));
      if(d.key==="rent")m.assumptions.units=m.assumptions.units.map(u=>({...u,rent:+u.rent*(1+delta)}));
      if(d.key==="vacancy")m.assumptions.vacancyRate=+m.assumptions.vacancyRate+delta;
      if(d.key==="price")m.assumptions.purchasePrice=+m.assumptions.purchasePrice*(1+delta);
      if(d.key==="rate")m.assumptions.interestRate=+m.assumptions.interestRate+delta;
      if(d.key==="appr")m.assumptions.appreciationRate=+m.assumptions.appreciationRate+delta;
      const r=calcDeal(m);return{irr:r.irr,coc:r.cocReturn};
    });
    return{label:d.label,unit:d.unit,irrLowDelta:low.irr-base.irr,irrHighDelta:high.irr-base.irr,cocLowDelta:low.coc-base.cocReturn,cocHighDelta:high.coc-base.cocReturn,irrLowAbs:low.irr,irrHighAbs:high.irr,cocLowAbs:low.coc,cocHighAbs:high.coc};
  });
}

// ─── CSV EXPORT ───────────────────────────────────────────────────────────────

export { DEFAULT_PREFS, resolveExpenses, calcDeal, calcSensitivity };
