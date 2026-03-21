// ─── Financial calculation engine ────────────────────────────────────────────
//
// FIELD GLOSSARY (deal.assumptions)
// ─────────────────────────────────
// purchasePrice         Agreed purchase price (USD)
// downPaymentPct        Down payment as % of purchase price (e.g. 25 = 25%)
// downPaymentDollar     Mirror field kept in sync with downPaymentPct; used when
//                       purchasePrice is 0 (dollar-first entry mode)
// interestRate          Annual mortgage rate (e.g. 7.0 = 7%)
// amortYears            Amortization period in years (typically 30)
// numUnits              2 | 3 | 4 — number of rentable units
// units[]               Array of 4 unit objects (slice to numUnits for calcs):
//   .rent               Current/expected monthly rent (what we underwrite)
//   .listedRent         MLS listed rent (informational)
//   .rentcastRent       RentCast API estimate (informational)
// ownerOccupied         True = owner lives in one unit (house-hack)
// ownerUnit             Index of the owner-occupied unit (0-based)
// ownerOccupancyYears   How many years the owner plans to live there
// alternativeRent       What the owner would pay to rent elsewhere (opportunity cost)
// ownerUseUtilities     Monthly utility cost for the owner unit (added to expenses)
// vacancyRate           Annual vacancy assumption as % (e.g. 5 = 5%)
// rentGrowth            Annual rent growth rate as % (e.g. 3 = 3%)
// expenseGrowth         Annual operating expense growth rate as %
// appreciationRate      Annual property appreciation rate as %
// taxBracket            Federal income tax bracket as % (e.g. 22 = 22%)
// pmi                   Monthly PMI payment (USD) — set by loanEngine when < 20% down
// sellerConcessions     Seller-paid costs reducing cash needed at close (USD)
// loanLimit             Optional conforming/FHA loan limit cap (USD); 0 = no cap
// closingCosts          Itemized closing costs object (title, transferTax, etc.)
// insuranceUpfront      True = first-year insurance premium paid at close (not monthly)
// expenses              Operating expense values (USD or % depending on expenseModes)
// expenseModes          Per-expense mode: "pct" (% of gross rent) | "value" (USD/yr)
//   .propertyTax        Annual property tax
//   .insurance          Landlord insurance
//   .maintenance        Routine maintenance/repairs
//   .capex              Capital expenditure reserve
//   .propertyMgmt       Property management fee (0 if selfManage=true)
//   .utilities          Landlord-paid utilities (water, trash, etc.)
//   .hoa                HOA / condo association fee (USD/yr); always a fixed value, no pct mode
// selfManage            True = skip property management expense
// annualPropertyTax     Raw value from Rentcast/Zillow API; written to expenses.propertyTax
// refi                  Refinance scenario object:
//   .enabled            True = model a cash-out refi at .year
//   .year               Year (1-9) when refi closes
//   .newRate            New interest rate after refi (%)
//   .newLTV             LTV used to compute new loan amount (%)
// valueAdd              Value-add renovation scenario:
//   .enabled            True = model renovation costs and rent bump
//   .reModelCost        Total renovation budget (USD); spread 50/50 over yr1 and yr2
//   .rentBumpPerUnit    Monthly rent increase per renovated unit (USD)
//   .unitsRenovated     Number of units renovated (≤ numUnits)
//   .completionYear     Year renovation is complete and rent bump takes effect
//
// DEPRECATED / UNUSED FIELDS (kept for backward compat, not read by calcDeal)
// ─────────────────────────────────────────────────────────────────────────────
// assumptions.loanAmount       Never read; loanAmt is computed internally in calcDeal
// assumptions.*Source fields   (purchasePriceSource, interestRateSource, etc.)
//                              UI-ready annotation fields; not yet displayed in any tab.
//                              Keep in newDeal() for future "sources" feature.
//
import * as Sentry from '@sentry/react';
import { calcStateTax } from './taxEngine.js';

// ─── Tax & depreciation constants (IRC §168 / §469) ──────────────────────────
const RESIDENTIAL_DEP_YEARS = 27.5; // IRC §168(c)(1) — residential rental property
const CS_5YR_LIFE   = 5;            // Personal property / 5-yr cost seg component
const CS_15YR_LIFE  = 15;           // Land improvements / 15-yr cost seg component
const DEFAULT_LAND_PCT = 0.20;      // Default land allocation when advanced tax is off
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
  state:            '',    // 2-letter state code; empty = no state tax modeled
  filingStatus:     'single', // 'single' | 'married'
  localTaxRate:     0,     // additive local income tax rate (decimal, e.g. 0.03 = 3%)
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
  expRatioCeiling:  0.50,
  // Hold period — configurable exit year (BACK-805)
  holdPeriod:       10,
  // Advanced Tax Modeling defaults (BACK-013)
  tax: { enabled:false, landValuePct:20, costSegEnabled:false, costSeg5YrPct:15, costSeg15YrPct:10, bonusDepPct:100, sec179Amount:0, paStatus:'active_participant', agi:100000 } };

// newDeal accepts optional user prefs to seed defaults
const newDeal = (prefs) => {
  const p = { ...DEFAULT_PREFS, ...(prefs || {}) };
  return ({
  id: Date.now(), address: "", status: "Analyzing", notes: "", showingDate: "", showingTime: "", photos: [],
  assumptions: {
    purchasePrice: 450000, purchasePriceSource: "",
    downPaymentPct: p.downPaymentPct, downPaymentSource: "", downPaymentDollar: 0,
    loanLimit: 0, // conforming/FHA cap; 0 = no cap; set by LoanTypeTab
    interestRate: p.interestRate, interestRateSource: "",
    amortYears: p.amortYears, amortSource: "",
    holdPeriod: p.holdPeriod||10,
    closingCosts: { ...p.closingCosts },
    insuranceUpfront: false,
    sellerConcessions: 0, sellerConcessionsSource: "",
    pmi: 0, pmiSource: "",
    units: Array(4).fill(null).map((_,i) => ({ rent: 0, rentSource:"", listedRent: 0, rentcastRent: 0 })),
    numUnits: 2,
    beds: "", baths: "", yearBuilt: "", sqftTotal: "", lotSize: "", annualPropertyTax: "", expectedCloseDate: "",
    vacancyRate: p.vacancyRate, vacancySource: "",
    expenseModes: { propertyTax:"pct", insurance:"pct", maintenance:"pct", capex:"pct", propertyMgmt:"pct", utilities:"value", hoa:"value", costSegFee:"value" },
    expenses: {
      propertyTax:6000, propertyTaxSource:"", propertyTaxPct: p.propertyTaxPct,
      insurance:1800, insuranceSource:"", insurancePct: p.insurancePct,
      maintenance:2400, maintenanceSource:"", maintenancePct: p.maintenancePct,
      capex:2400, capexSource:"", capexPct: p.capexPct,
      propertyMgmt:2160, propertyMgmtSource:"", propertyMgmtPct: p.propertyMgmtPct,
      utilities:0, utilitiesSource:"", utilitiesPct:0,
      hoa:0, hoaSource:"",
      costSegFee:0 },
    selfManage:false, rentGrowth: p.rentGrowth, expenseGrowth: p.expenseGrowth, appreciationRate: p.appreciationRate, taxBracket: p.taxBracket,
    state: p.state||'', filingStatus: p.filingStatus||'single', localTaxRate: p.localTaxRate||0,
    ownerOccupied:true, ownerUnit:0, ownerOccupancyYears:2, alternativeRent:0, ownerUseUtilities:0,
    refi: { enabled:false, year:5, newRate:6.5, newLTV:75 },
    valueAdd: { enabled:false, reModelCost:40000, rentBumpPerUnit:200, unitsRenovated:2, completionYear:3 },
    tax: { ...(p.tax||DEFAULT_PREFS.tax) } },
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

// ─── Groups API ───────────────────────────────────────────────────────────────
// Import directly from groups.js — removed re-export to prevent groups.js from
// being pulled into the main bundle via calc.js.

// ─── FINANCIAL ENGINE ─────────────────────────────────────────────────────────
function resolveExpenses(a, grossRentYear0) {
  const modes = a.expenseModes || {};
  const val = (vk, pk) => (modes[vk]==="pct") ? grossRentYear0*((+a.expenses[pk]||0)/100) : (+a.expenses[vk]||0);
  const mgmt = a.selfManage ? 0 : val("propertyMgmt","propertyMgmtPct");
  const pt=val("propertyTax","propertyTaxPct"), ins=val("insurance","insurancePct");
  const maint=val("maintenance","maintenancePct"), capex=val("capex","capexPct"), util=val("utilities","utilitiesPct");
  const hoa=(+a.expenses?.hoa||0);
  return { propertyTax:pt, insurance:ins, maintenance:maint, capex, propertyMgmt:mgmt, utilities:util, hoa, costSegFee:0, total:pt+ins+maint+capex+mgmt+util+hoa };
}

function calcDeal(deal, { _isRecursive = false } = {}) {
  if (!deal?.assumptions) return {};
  const a = deal.assumptions;
  // Guard: ensure units array exists (recovered/migrated deals may be missing it)
  if (!a.units || !Array.isArray(a.units)) return {};
  if (!a.numUnits) a.numUnits = a.units.length || 2;

  // DEBUG: breadcrumb for diagnostics — shape snapshot at calc time
  if (!_isRecursive) {
    Sentry.addBreadcrumb({
      category: 'calc',
      message: 'calcDeal',
      data: {
        dealId: deal._deal_id || deal.id,
        numUnits: a.numUnits,
        hasUnits: Array.isArray(a.units),
        hasComps: Array.isArray(deal.comps),
        hasShowing: !!deal.showing,
        vaEnabled: !!a.valueAdd?.enabled,
      },
      level: 'debug',
    });
  }
  const pp=+a.purchasePrice||0, dpPct=(+a.downPaymentPct||25)/100, dp=pp>0?pp*dpPct:(+a.downPaymentDollar||0);
  const insUpfront=a.insuranceUpfront?(+a.expenses?.insurance||0):0;
  const closingCostsTotal=Object.values(a.closingCosts).reduce((s,v)=>s+(+v||0),0)+insUpfront;
  const totalCash=dp+closingCostsTotal-(+a.sellerConcessions||0);
  // naturalLoanCalc = purchase price minus down payment minus any seller concessions.
  // loanAmt = capped at loanLimit if set; otherwise equals naturalLoanCalc.
  // Bug note: previously the non-limit path was `pp - dp` (missing sellerConcessions).
  const naturalLoanCalc=Math.max(0,pp-dp-(+a.sellerConcessions||0));
  const loanLimitCalc=+a.loanLimit||0;
  const loanAmt=loanLimitCalc>0?Math.min(naturalLoanCalc,loanLimitCalc):naturalLoanCalc;
  const rate=(+a.interestRate||7)/100/12;  // monthly interest rate
  const n=(+a.amortYears||30)*12;          // total payment periods
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
  // ── BACK-805: Hold period — clamp to valid range 1–30, default 10 ──────────────
  // Declared here so refiEnabled and vaCompletionYr can reference it safely.
  // Soft validation: refi year and VA completion year are clamped to holdYears
  // rather than throwing — silent clamp, no error, backward compatible.
  const holdYears=Math.max(1,Math.min(30,Math.round(+a.holdPeriod||10)));
  const refiEnabled=a.refi?.enabled&&+a.refi?.year>=1&&+a.refi?.year<=holdYears-1;
  const refiYear=refiEnabled?+a.refi.year:null;
  const refiRate=refiEnabled?(+a.refi.newRate||7)/100/12:null;
  const refiLTV=refiEnabled?(+a.refi.newLTV||75)/100:null;
  let refiCashOut=0, currentMonthlyPayment=monthlyPayment, currentAnnualDebtService=annualDebtService;
  const va=a.valueAdd||{}, vaEnabled=!!va.enabled;
  const vaCompletionYr=vaEnabled?Math.max(1,Math.min(holdYears,+va.completionYear||3)):null;
  const vaReModelCost=vaEnabled?(+va.reModelCost||0):0;
  const vaRentBump=vaEnabled?(+va.rentBumpPerUnit||0)*Math.min(+va.unitsRenovated||0,a.numUnits)*12:0;
  const totalCashWithVA=totalCash+vaReModelCost;
  // ── Advanced Tax Modeling config (BACK-013) ───────────────────────────────────
  // Bonus dep: 100% permanent under OBBBA (signed Jul 4, 2025) for property acquired after Jan 19, 2025.
  // Structure (27.5yr) does NOT qualify for bonus dep — only 5-yr and 15-yr components do.
  const taxCfg=a.tax||{};
  const taxAdvEnabled=!!taxCfg.enabled;
  const landPct=taxAdvEnabled?Math.min(0.95,Math.max(0,(+taxCfg.landValuePct||20)/100)):0.20;
  const buildingVal=pp*(1-landPct);
  const csEnabled=taxAdvEnabled&&!!taxCfg.costSegEnabled;
  const cs5Pct=csEnabled?Math.min(0.95,Math.max(0,(+taxCfg.costSeg5YrPct||15)/100)):0;
  const cs15Pct=csEnabled?Math.min(0.95,Math.max(0,(+taxCfg.costSeg15YrPct||10)/100)):0;
  const cs5Val=buildingVal*cs5Pct;
  const cs15Val=buildingVal*Math.min(cs15Pct,Math.max(0,1-cs5Pct)); // guard sum ≤ 100%
  const structureVal=buildingVal-cs5Val-cs15Val; // 27.5-yr remainder
  const bonusPct=csEnabled?Math.min(1,Math.max(0,(+taxCfg.bonusDepPct||100)/100)):0;
  const sec179=csEnabled?Math.min(+taxCfg.sec179Amount||0,cs5Val):0; // capped at 5-yr basis
  const paStatus=taxCfg.paStatus||'active_participant';
  const palAgi=+taxCfg.agi||100000;
  // BACK-020: PAL carryforward — accumulated suspended losses across years (IRC §469)
  // Grows when suspended losses exceed PAL allowance; absorbed by future taxable income.
  // Released in full upon taxable disposition (BACK-021). NOT released by 1031 exchange.
  let palCarryforward=0;
  // BACK-021: track cumulative depreciation taken for §1250 unrecaptured gain calculation at exit
  // §1250 recapture portion of the gain is taxed at 25% (not 15% LTCG rate)
  let cumulativeDepreciationTaken=0;
  for(let yr=1;yr<=holdYears;yr++){
    let refiEvent=null;
    if(refiEnabled&&yr===refiYear){
      // Refi: estimate property value at refi year, compute new loan at target LTV,
      // cash-out = new loan minus remaining balance (floored at 0)
      const pv=pp*Math.pow(1+appRate,yr-1), newLoanAmt=pv*refiLTV;
      refiCashOut=Math.max(0,newLoanAmt-balance);
      const refiN=(+a.amortYears||30)*12;
      const newMonthly=newLoanAmt>0&&refiRate>0?newLoanAmt*(refiRate*Math.pow(1+refiRate,refiN))/(Math.pow(1+refiRate,refiN)-1):newLoanAmt/refiN;
      balance=newLoanAmt; currentMonthlyPayment=newMonthly; currentAnnualDebtService=newMonthly*12;
      refiEvent={cashOut:refiCashOut,newLoanAmt,newRate:a.refi.newRate};
    }
    const vaRentLiftThisYr=vaEnabled&&yr>=vaCompletionYr?vaRentBump:0;
    // OO rent deduction: full owner-unit rent grown by rentGrowth (no vacancy — unit is occupied, not vacant).
    // Applied BEFORE vacancy so vacancy rate acts only on tenant-collectible rent.
    const ooRentDeductionThisYr=ooEnabled&&yr<=ooYears?ooAnnualRentLost*Math.pow(1+rentGrowth,yr-1):0;
    const ooUtilitiesThisYr=ooEnabled&&yr<=ooYears?ooAnnualUtilities*Math.pow(1+(+a.expenseGrowth||0)/100,yr-1):0;
    // Gross rent (all units) grows each year; VA bump added once renovation complete
    const grossRent=(grossRentYear0+vaRentLiftThisYr)*Math.pow(1+rentGrowth,yr-1);
    // Tenant-only rent after OO deduction; vacancy applies only to tenant-collectible rent
    const rentAfterOO=grossRent-ooRentDeductionThisYr;
    const vacancyLoss=rentAfterOO*vacRate, egi=rentAfterOO-vacancyLoss;
    // Expenses compounded by expenseGrowth; uses Year-0 base resolved by resolveExpenses()
    const mult=Math.pow(1+expGrowth,yr-1);
    // costSegFee is one-time Year 1 only — stored under a.tax (alongside cost seg settings), not grown by expenseGrowth
    const costSegFeeThisYr=(yr===1)?(+taxCfg.costSegFee||0):0;
    const expBreakdown={propertyTax:baseExp.propertyTax*mult,insurance:baseExp.insurance*mult,maintenance:baseExp.maintenance*mult,capex:baseExp.capex*mult,propertyMgmt:baseExp.propertyMgmt*mult,utilities:baseExp.utilities*mult,hoa:baseExp.hoa*mult,costSegFee:costSegFeeThisYr};
    const expenses=baseExpenses*mult+costSegFeeThisYr, noi=egi-expenses;
    // Amortization: monthly principal/interest split using outstanding balance
    let principal=0,interest=0,newBalance=balance;
    if(balance>0){for(let m=0;m<12;m++){const intPay=newBalance*(refiEnabled&&yr>=refiYear?refiRate:rate);const prinPay=currentMonthlyPayment-intPay;interest+=intPay;principal+=prinPay;newBalance-=prinPay;}}
    balance=newBalance;
    // Value-add reno cost: spread 50% yr1 / 50% yr2 (construction draw model)
    const vaRemodelOutflow=yr===1?vaReModelCost/2:yr===2?vaReModelCost/2:0;
    // Owner utilities: below-the-line outflow (not an operating expense, doesn't affect NOI)
    const cashFlow=noi-currentAnnualDebtService-ooUtilitiesThisYr+(refiEvent?refiEvent.cashOut:0)-vaRemodelOutflow;
    const monthlyCashFlow=cashFlow/12;
    // Incremental CF = Cash Flow + Alt Rent (OO years only).
    // Alt rent is what you'd spend renting elsewhere — it's a savings that offsets
    // negative cash flow. E.g. CF=-$2000/mo + altRent=$2000/mo → incremental≈$0.
    const ooAltRentAnnual=ooEnabled&&yr<=ooYears?(ooAltRentMonthly*12):0;
    const incrementalCashFlow=ooEnabled?cashFlow+ooAltRentAnnual:cashFlow;
    // CoC = (NOI - debt service) / total cash invested; does NOT include refi cash-out
    const cocReturn=totalCashWithVA>0?(noi-currentAnnualDebtService)/totalCashWithVA:0;
    const capRate=pp>0?noi/pp:0, dscr=currentAnnualDebtService>0?noi/currentAnnualDebtService:0;
    // BACK-018: lender-view DSCR uses full-building rent (all units, no OO deduction) — how a lender underwrites
    const dscrLenderView=currentAnnualDebtService>0?(grossRent*(1-vacRate)-expenses)/currentAnnualDebtService:0;
    // OO tax pro-rate: only the rental-unit share of deductions applies.
    // Rental ratio = (numUnits-1)/numUnits during OO years; 1.0 once owner moves out.
    // e.g. 3-unit OO → 2/3 deductible, 1/3 owner's personal share.
    const ooTaxProrateRatio=(ooEnabled&&yr<=ooYears&&a.numUnits>1)?(a.numUnits-1)/a.numUnits:1.0;
    const ooOwnerExpShare=ooEnabled&&yr<=ooYears?(1-ooTaxProrateRatio):0; // e.g. 1/3
    // NOI already excludes owner-unit rent. But NOI was computed net of ALL operating expenses
    // including the owner's personal share (1/N) which is NOT deductible for rental purposes.
    // Add back the owner's non-deductible expense share so taxable income reflects rental activity only.
    const ooExpAddBack=expenses*ooOwnerExpShare; // owner's share of expenses — not deductible
    // Depreciation: full RESIDENTIAL_DEP_YEARS schedule × rental ratio only
    const annualDepreciation=((pp*(1-DEFAULT_LAND_PCT))/RESIDENTIAL_DEP_YEARS)*ooTaxProrateRatio;
    // Taxable rental income: NOI + owner expense add-back − rental interest − rental depreciation
    const taxableIncome=(noi+ooExpAddBack)-(interest*ooTaxProrateRatio)-annualDepreciation;
    // QBI deduction: 20% of qualified business income (IRC §199A) if positive
    const qbi=taxableIncome>0?taxableIncome*0.2:0, federalTaxable=taxableIncome-qbi;
    const bracketRate=(+a.taxBracket||22)/100, taxEffect=federalTaxable*bracketRate;
    // State income tax — stacking method: tax(MAGI + rentalIncome) − tax(MAGI)
    // federalTaxable is the net rental income after deductions/QBI — correct input for state tax too.
    // MAGI comes from a.tax.agi (same field used by advanced tax module).
    const _stateTaxResult = calcStateTax({
      state:         a.state || '',
      magi:          +(a.tax?.agi || 0),
      netRentalIncome: federalTaxable,
      filingStatus:  a.filingStatus || 'single',
      localTaxRate:  +(a.localTaxRate || 0),
    });
    const stateTax         = _stateTaxResult.stateTax;
    const localTax         = _stateTaxResult.localTax;
    const totalStateTax    = _stateTaxResult.totalTax;
    const stateEffectiveRate = _stateTaxResult.effectiveRate;
    const noTaxState       = _stateTaxResult.noTaxState;
    const afterTaxCashFlow=(noi-currentAnnualDebtService)-taxEffect+(refiEvent?refiEvent.cashOut:0)-vaRemodelOutflow-ooUtilitiesThisYr;
    // ── Advanced Tax: cost seg depreciation + PAL (BACK-013) ─────────────────────
    // 5-yr property: Sec 179 applied first, bonus dep on remaining basis in Yr1, then SL on non-bonus remainder Yr1–5
    // 15-yr property: bonus dep in Yr1, SL on non-bonus remainder Yr1–15
    // Structure: 27.5-yr SL throughout (NOT eligible for bonus dep)
    let cs5Dep=0,cs15Dep=0;
    if(csEnabled){
      const cs5BonusBase=Math.max(0,cs5Val-sec179);  // basis eligible for bonus dep (after Sec 179)
      const cs5SLBasis=cs5BonusBase*(1-bonusPct);    // remaining basis for 5-yr SL
      if(yr===1){cs5Dep=sec179+cs5BonusBase*bonusPct+cs5SLBasis/CS_5YR_LIFE;}
      else if(yr<=CS_5YR_LIFE){cs5Dep=cs5SLBasis/CS_5YR_LIFE;}
      const cs15SLBasis=cs15Val*(1-bonusPct);        // remaining 15-yr basis after bonus dep
      if(yr===1){cs15Dep=cs15Val*bonusPct+cs15SLBasis/CS_15YR_LIFE;}
      else if(yr<=CS_15YR_LIFE){cs15Dep=cs15SLBasis/CS_15YR_LIFE;}
    }
    // Advanced tax also prorates SL dep by OO ratio; cost seg components only apply to rental portion
    const slDepreciation=taxAdvEnabled?(structureVal/RESIDENTIAL_DEP_YEARS*ooTaxProrateRatio):annualDepreciation;
    // Cost seg comps: prorated to rental units only during OO years
    const cs5DepProrated=cs5Dep*ooTaxProrateRatio;
    const cs15DepProrated=cs15Dep*ooTaxProrateRatio;
    const totalDepreciation=taxAdvEnabled?(slDepreciation+cs5DepProrated+cs15DepProrated):annualDepreciation;
    // Advanced taxable income: same addback logic — NOI + owner expense share − rental interest − rental depreciation
    const taxableIncomeAdv=taxAdvEnabled?((noi+ooExpAddBack)-(interest*ooTaxProrateRatio)-totalDepreciation):taxableIncome;
    // ── BACK-020: PAL carryforward + 4-step suspended loss tracking (IRC §469) ─────
    // Step 1: compute PAL allowance on current year's paper loss
    let palAllowedLoss=0;
    if(taxAdvEnabled&&taxableIncomeAdv<0){
      const paperLoss=-taxableIncomeAdv;
      if(paStatus==='re_professional'){
        palAllowedLoss=paperLoss; // RE professional: unlimited, no PAL restriction
      } else if(paStatus==='active_participant'){
        // $25k allowance phases out $0.50/$1 above $100k AGI, fully eliminated at $150k
        const phaseout=Math.min(25000,Math.max(0,(palAgi-100000)*0.5));
        palAllowedLoss=Math.min(paperLoss,Math.max(0,25000-phaseout));
      }
      // passive: palAllowedLoss stays 0 — all losses suspended
    }
    // Step 2: suspended loss this year = paper loss beyond what PAL allowance covers
    const suspendedLossThisYr=taxAdvEnabled&&taxableIncomeAdv<0
      ? Math.max(0,(-taxableIncomeAdv)-palAllowedLoss)
      : 0;
    if(taxAdvEnabled) palCarryforward+=suspendedLossThisYr;
    // Step 3: if there IS taxable income this year, carryforward absorbs it first
    // (the property's own prior suspended losses shelter future rental income)
    let carryforwardUsedThisYr=0;
    if(taxAdvEnabled&&taxableIncomeAdv>0&&palCarryforward>0){
      carryforwardUsedThisYr=Math.min(taxableIncomeAdv,palCarryforward);
      palCarryforward-=carryforwardUsedThisYr;
    }
    // Step 4: effective taxable income — loss years show allowed deduction; income years net carryforward
    const effectiveTaxIncAdv=taxAdvEnabled
      ?(taxableIncomeAdv>=0
          ? taxableIncomeAdv-carryforwardUsedThisYr   // income year: sheltered by carryforward
          : -palAllowedLoss)                          // loss year: only allowed loss is deductible
      :taxableIncome;
    // Snapshot of running carryforward balance after this year's transactions
    const cumulativeCarryforward=taxAdvEnabled?palCarryforward:0;
    const qbiAdv=effectiveTaxIncAdv>0?effectiveTaxIncAdv*0.2:0;
    const taxEffectAdv=taxAdvEnabled?((effectiveTaxIncAdv-qbiAdv)*bracketRate):taxEffect;
    // Tax benefit from carryforward applied this year: the tax that WOULD have been owed without the CF absorption.
    // This makes the saving explicit — taxEffectAdv already reflects the lower tax, but the user can't see why.
    // taxBenefitFromCF = (carryforwardUsed − QBI on that portion) × bracketRate
    const taxBenefitFromCF=taxAdvEnabled&&carryforwardUsedThisYr>0
      ? carryforwardUsedThisYr*(1-0.2)*bracketRate  // QBI would have applied to this income too
      : 0;
    const afterTaxCFAdv=taxAdvEnabled?((noi-currentAnnualDebtService)-ooUtilitiesThisYr-taxEffectAdv+(refiEvent?refiEvent.cashOut:0)-vaRemodelOutflow):afterTaxCashFlow;
    // VA implied value lift: rent bump capitalized at Year-0 cap rate (NOI / pp)
    const baseCapRate=grossRentYear0*(1-vacRate)-baseExpenses>0&&pp>0?(grossRentYear0*(1-vacRate)-baseExpenses)/pp:0.06;
    const vaImpliedValueLift=vaEnabled&&yr>=vaCompletionYr&&baseCapRate>0?(vaRentBump*(1-vacRate))/baseCapRate:0;
    const propertyValue=pp*Math.pow(1+appRate,yr)+vaImpliedValueLift;
    // Accumulate depreciation taken this year for §1250 recapture at exit (BACK-021)
    cumulativeDepreciationTaken+=taxAdvEnabled?totalDepreciation:annualDepreciation;
    years.push({yr,grossRent,ooRentDeduction:ooRentDeductionThisYr,rentAfterOO,vacancyLoss,egi,expenses,expBreakdown,noi,ooExpAddBack,debtService:currentAnnualDebtService,cashFlow,monthlyCashFlow,incrementalCashFlow,cocReturn,capRate,dscr,dscrLenderView,principal,interest,balance:newBalance,depreciation:annualDepreciation,taxableIncome,qbi,taxEffect,afterTaxCashFlow,stateTax,localTax,totalStateTax,stateEffectiveRate,noTaxState,propertyValue,equity:propertyValue-newBalance,appreciationGain:propertyValue-pp,principalPaydown:loanAmt-newBalance,refiEvent,vaRemodelOutflow,vaRentLift:vaRentLiftThisYr,ooUtilities:ooUtilitiesThisYr,ooTaxProrateRatio,slDepreciation,cs5Depreciation:cs5DepProrated,cs15Depreciation:cs15DepProrated,totalDepreciation,taxableIncomeAdv,palAllowedLoss,suspendedLossThisYr,carryforwardUsedThisYr,cumulativeCarryforward,effectiveTaxIncAdv,qbiAdv,taxEffectAdv,taxBenefitFromCF,afterTaxCFAdv});
  }
  // BACK-020: palCarryforward now holds the remaining accumulated suspended loss balance at end of hold.
  const finalPalCarryforward=palCarryforward;
  // ── BACK-021: Exit analysis with §1250 recapture + PAL carryforward release ─────────────────
  // §1250 unrecaptured gain: cumulative depreciation taken is taxed at 25% (not 15% LTCG).
  // PAL carryforward: released in full upon taxable disposition — reduces ordinary income tax at sale.
  // A 1031 exchange defers ALL of these taxes (not modeled here; noted in UI).
  //
  // Tax stack at exit:
  //   Total gain = exitValue − purchasePrice
  //   §1250 recapture portion = min(cumulativeDepreciation, totalGain) — taxed at 25%
  //   True LTCG = totalGain − recapturePortion — taxed at 15%
  //   PAL carryforward release reduces taxable income at ordinary rate (bracketRate)
  //   Net tax on sale = recaptureTax + ltcgTax − palTaxBenefit
  //   Net proceeds = exitValue − loanBalance − netTaxOnSale
  //
  // Note: basis adjustments (improvements, closing costs) not modeled — kept conservative.
  const exitValue=years[holdYears-1]?.propertyValue||pp*Math.pow(1+appRate,holdYears);
  const exitLoanBalance=years[holdYears-1]?.balance||0;
  const totalGainOnSale=Math.max(0,exitValue-pp);
  // §1250 recapture: capped at the actual gain (can't exceed what you're selling for)
  const sec1250RecapturePortion=Math.min(cumulativeDepreciationTaken,totalGainOnSale);
  const trueLTCGPortion=Math.max(0,totalGainOnSale-sec1250RecapturePortion);
  const recaptureTax=sec1250RecapturePortion*0.25;
  const ltcgTax=trueLTCGPortion*0.15;
  // PAL carryforward release: reduces taxable income at ordinary rate.
  // It offsets the gain dollar-for-dollar up to the amount of the gain; any excess offsets other income.
  // We model it as reducing the total tax bill (capped at total tax — cannot create a refund here).
  const bracketRateExit=(+(deal.assumptions?.taxBracket)||22)/100;
  const palTaxBenefit=taxAdvEnabled?Math.min(finalPalCarryforward*bracketRateExit, recaptureTax+ltcgTax):0;
  const netTaxOnSale=Math.max(0,recaptureTax+ltcgTax-palTaxBenefit);
  // Legacy field kept for backward compat (IRR calc, equity multiple)
  const capitalGains=totalGainOnSale, capitalGainsTax=netTaxOnSale;
  const netProceeds=exitValue-exitLoanBalance-netTaxOnSale;
  // IRR: Newton-Raphson on cash flow series [-initialCash, cf1..cf10+netProceeds]
  const irrCFs=[-totalCashWithVA,...years.map(y=>y.cashFlow)]; irrCFs[holdYears]+=netProceeds;
  let irr=0.1;
  for(let i=0;i<100;i++){let npv=0,dnpv=0;irrCFs.forEach((cf,t)=>{npv+=cf/Math.pow(1+irr,t);dnpv-=t*cf/Math.pow(1+irr,t+1);});if(Math.abs(npv)<0.01)break;irr-=npv/dnpv;}
  const equityMultiple=totalCashWithVA>0?(years.reduce((s,y)=>s+y.cashFlow,0)+netProceeds)/totalCashWithVA:0;
  const breakEvenOccupancy=grossRentYear0>0?(annualDebtService+baseExpenses)/grossRentYear0:0;
  let irrWithoutVA=irr,irrWithVA=irr;
  if(vaEnabled){const d2=JSON.parse(JSON.stringify(deal));d2.assumptions.valueAdd={...va,enabled:false};irrWithoutVA=calcDeal(d2,{_isRecursive:true}).irr;irrWithVA=irr;}
  // ── FHA Self-Sufficiency Test (BACK-062) ─────────────────────────────────────
  // Applies to 3–4 unit properties only. HUD rule: 75% of gross rents from ALL
  // units (including owner unit) must >= PITI. Ref: HUD Handbook 4000.1 §II.A.4.b.iv
  const fhaSelfSufficiency = (() => {
    if (a.numUnits < 3) return { applies: false };
    const grossRentAllUnits = a.units.slice(0, a.numUnits).reduce((s, u) => s + (+(u.rent||u.listedRent)||0) * 12, 0);
    const pitiAnnual = annualDebtService + (baseExp.propertyTax||0) + (baseExp.insurance||0);
    const threshold75Pct = grossRentAllUnits * 0.75;
    const passes = threshold75Pct >= pitiAnnual;
    const delta = threshold75Pct - pitiAnnual; // positive = surplus, negative = shortfall
    return { applies: true, grossRentAllUnits, threshold75Pct, pitiAnnual, passes, delta };
  })();

  return {totalCash:totalCashWithVA,totalCashBase:totalCash,loanAmt,monthlyPayment,annualDebtService,grossRentYear0,baseExpenses,baseExpBreakdown:baseExp,noi:years[0]?.noi||0,cocReturn:years[0]?.cocReturn||0,capRate:years[0]?.capRate||0,dscr:years[0]?.dscr||0,dscrLenderView:years[0]?.dscrLenderView||0,irr,equityMultiple,breakEvenOccupancy,exitValue,exitLoanBalance,totalGainOnSale,sec1250RecapturePortion,trueLTCGPortion,recaptureTax,ltcgTax,palTaxBenefit,netTaxOnSale,netProceeds,capitalGainsTax,years,holdYears,refiCashOut,refiYear:refiEnabled?refiYear:null,vaEnabled,vaReModelCost,vaRentBump,vaCompletionYr,irrWithoutVA,irrWithVA,ooEnabled,ooUnit,ooYears,ooAnnualRentLost,ooAltRentMonthly,taxAdvEnabled,finalPalCarryforward,cumulativeDepreciationTaken,fhaSelfSufficiency};
}

// ── BACK-805: Exit Year Scenario Analysis ─────────────────────────────────────
// Runs calcDeal at a fixed set of standard exit years plus the user's selected
// holdPeriod, returning a compact array of key metrics per exit year.
// Used by DealSummaryTab to render the Exit Year Scenarios panel.
function calcExitScenarios(deal) {
  const userHold = Math.max(1, Math.min(30, Math.round(+(deal?.assumptions?.holdPeriod)||10)));
  const standardYears = [3, 5, 7, 10, 15, 20];
  // Include user's hold period, dedupe, sort
  const yearsToRun = [...new Set([...standardYears, userHold])].filter(y => y >= 1 && y <= 30).sort((a,b)=>a-b);
  return yearsToRun.map(yr => {
    const d = JSON.parse(JSON.stringify(deal));
    d.assumptions.holdPeriod = yr;
    const r = calcDeal(d, { _isRecursive: true });
    return {
      yr,
      isUserSelected: yr === userHold,
      irr: r.irr || 0,
      equityMultiple: r.equityMultiple || 0,
      netProceeds: r.netProceeds || 0,
      cocReturn: r.cocReturn || 0,
      exitValue: r.exitValue || 0,
    };
  });
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

// ─── SAMPLE DEAL ──────────────────────────────────────────────────────────────
// Returns a pre-filled duplex used as the first-login welcome deal.
// Realistic Chicago-area numbers; owner-occupied; positive cash flow after rent.
const createSampleDeal = (prefs) => {
  const d = newDeal(prefs);
  d.address    = '123 Maple St, Chicago, IL 60614';
  d.status     = 'Analyzing';
  d._isSample  = true; // flag so we can avoid re-creating on subsequent logins

  const a = d.assumptions;
  a.purchasePrice  = 340000;
  a.downPaymentPct = 10;
  a.interestRate   = 6.8;
  a.amortYears     = 30;
  a.numUnits       = 2;

  // Both units have rent set — calc engine deducts owner unit via OO logic
  a.units[0].rent = 1550;  // owner unit market rate (calc deducts this during OO years)
  a.units[1].rent = 1550;  // tenant unit

  a.ownerOccupied       = true;
  a.ownerUnit           = 0;
  a.ownerOccupancyYears = 2;
  a.alternativeRent     = 1700; // comparable rental nearby — offsets negative CF

  a.vacancyRate = 5;

  // Expenses — realistic for a Chicago 2-flat
  a.expenseModes.propertyTax = 'value';
  a.expenseModes.insurance   = 'value';
  a.expenses.propertyTax  = 5800;
  a.expenses.insurance    = 1600;
  a.expenses.maintenance  = 2200;
  a.expenses.capex        = 2200;
  a.expenses.propertyMgmt = 0;   // self-managed
  a.expenses.utilities    = 0;

  a.rentGrowth       = 3;
  a.expenseGrowth    = 2;
  a.appreciationRate = 4;
  a.taxBracket       = 22;

  a.beds = 4; a.baths = 2; a.yearBuilt = 1965; a.sqftTotal = 2400;

  return d;
};

// ─── CSV EXPORT ───────────────────────────────────────────────────────────────

export { DEFAULT_PREFS, newDeal, createSampleDeal, resolveExpenses, calcDeal, calcExitScenarios, calcSensitivity };
