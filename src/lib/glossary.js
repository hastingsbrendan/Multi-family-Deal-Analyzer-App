// Centralized plain-English explanations for investor jargon used across the app.
// Import the GLOSSARY object and pass values into <Tip text={GLOSSARY.dscr}/>.
//
// Keep these short (2–3 sentences max) and free of jargon themselves. If a term
// references another term, prefer plain words: "annual income after expenses"
// rather than "NOI".

export const GLOSSARY = {
  // ── Returns & profitability ────────────────────────────────────────────────
  cocReturn:
    "Cash-on-Cash Return — your first-year cash income divided by the cash you put in. " +
    "Above 6% is healthy; below 3% is weak.",
  irr:
    "Internal Rate of Return — annualized total return including cash flow, principal " +
    "paydown, appreciation, and exit proceeds. Above 12% is strong; below 8% is weak.",
  capRate:
    "Cap Rate — annual income (after expenses, before mortgage) divided by purchase price. " +
    "It measures the property's yield. Above 5% is healthy in most markets.",
  noi:
    "Net Operating Income — annual rent minus vacancy and operating expenses, " +
    "BEFORE mortgage payments. Lenders use NOI to size loans.",
  egi:
    "Effective Gross Income — gross rent minus your vacancy assumption.",
  equityMultiple:
    "Equity Multiple — total dollars returned divided by dollars invested. " +
    "1.0x means you broke even; 2.0x means you doubled your money over the hold period.",
  cashFlow:
    "Cash Flow — what's left over each month after rent collected, expenses paid, " +
    "and mortgage paid. Positive = you pocket money; negative = it costs you to hold.",
  incrementalCashFlow:
    "Incremental Cash Flow — your cash flow PLUS the rent you'd otherwise pay to live " +
    "elsewhere (only relevant when you live in one unit). Shows true cost of owning vs. renting.",
  effectiveMortgage:
    "Your monthly housing cost after tenants pay you. Calculated as principal + interest " +
    "+ taxes + insurance MINUS the rent the other units bring in.",

  // ── Risk metrics ────────────────────────────────────────────────────────────
  dscr:
    "Debt Service Coverage Ratio — annual income (after expenses) divided by annual " +
    "mortgage payments. Lenders typically require ≥1.25x. Below 1.0x means rent doesn't " +
    "cover the loan.",
  dscrLenderView:
    "Lender-view DSCR uses 100% of building rent (no owner-unit deduction) — this is " +
    "what your lender will see when underwriting your loan.",
  expenseRatio:
    "Operating expenses as a percentage of effective gross income. Above 50% suggests " +
    "the property is expensive to run; below 35% is unusually lean.",
  vacancyRate:
    "Assumed % of the year a unit sits empty between tenants. 5% is a common default; " +
    "C-class properties may need 8–10%.",
  breakEvenOccupancy:
    "Break-Even Occupancy — the minimum % of units rented to cover all expenses and " +
    "mortgage payments. Lower is safer.",

  // ── Loan & financing ───────────────────────────────────────────────────────
  pmi:
    "Private Mortgage Insurance — extra monthly fee charged when down payment is below " +
    "20% on conventional loans. Drops off automatically at 78% LTV.",
  ltv:
    "Loan-to-Value — loan amount divided by property value. 80% LTV = 20% down.",
  loanLimit:
    "Federal cap on conforming or FHA loan size for the property's county. Loans above " +
    "this limit are considered jumbo.",
  fhaSelfSufficiency:
    "FHA Self-Sufficiency Test — required for 3–4 unit FHA loans. 75% of total rents " +
    "from ALL units (including the owner unit) must cover the full mortgage payment, " +
    "taxes, and insurance. (HUD Handbook 4000.1 §II.A.4.b.iv)",

  // ── Tax concepts ───────────────────────────────────────────────────────────
  qbi:
    "Qualified Business Income deduction (IRC §199A) — pass-through landlords can " +
    "deduct up to 20% of net rental income. Phase-outs apply at high incomes.",
  costSegregation:
    "Cost Segregation Study — accelerates depreciation by reclassifying portions of " +
    "the building (appliances, flooring, land improvements) into 5- or 15-year asset " +
    "lives instead of 27.5 years. Front-loads tax deductions.",
  bonusDepreciation:
    "Bonus Depreciation — lets you deduct up to 100% of cost-segregated property in " +
    "Year 1 (instead of spreading it over the asset life). 100% restored permanently " +
    "by OBBBA for property acquired after Jan 19, 2025.",
  palCarryforward:
    "Passive Activity Loss carryforward (IRC §469) — rental losses you couldn't deduct " +
    "this year (because you exceeded the $25K active-participant cap or aren't a real " +
    "estate professional) get banked. They offset future rental income or release in " +
    "full when you sell.",
  sec1250Recapture:
    "§1250 Unrecaptured Gain — at sale, the portion of your gain equal to the depreciation " +
    "you took is taxed at 25% (not the 15% long-term capital gains rate). The rest is " +
    "true LTCG at 15%.",
  ownerOccupied:
    "House-hack scenario where you live in one unit while renting the others. " +
    "Unlocks low down payments (3.5% FHA, 5% conventional) but you forgo that unit's rent.",
  alternativeRent:
    "What you'd pay to rent a comparable place if you weren't living in this property. " +
    "Used to compare 'cost of owning' vs. 'cost of renting.'",
  rentGrowth:
    "Annual % rent increase assumption used to project future cash flow. " +
    "3% is typical; markets can run 4–6% during boom years.",
  expenseGrowth:
    "Annual % expense increase assumption (taxes, insurance, maintenance). " +
    "3% is the common default.",
  appreciationRate:
    "Annual % home-value increase assumption. Long-run US average is ~3.5% nominal.",
  holdPeriod:
    "How many years you plan to own the property before selling. IRR and exit " +
    "calculations use this horizon.",
};

export default GLOSSARY;
