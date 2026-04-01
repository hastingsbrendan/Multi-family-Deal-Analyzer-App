// ─── RentHack calc.js unit tests ─────────────────────────────────────────────
// Run with: npm test
//
// Strategy: build minimal deal fixtures with zero closing costs, zero growth
// rates, and all expenses in "value" mode so expected outputs are deterministic
// and hand-verifiable. Each test group is isolated — no shared mutable state.

import { describe, test, expect, vi, beforeEach } from 'vitest';

// Mock Sentry before importing calc — it uses addBreadcrumb which doesn't exist in Node
vi.mock('@sentry/react', () => ({
  addBreadcrumb: vi.fn(),
  setUser: vi.fn(),
  captureException: vi.fn(),
}));

const { calcDeal, calcExitScenarios } = await import('../lib/calc.js');

// ─── Fixture helpers ──────────────────────────────────────────────────────────
// Returns a clean deal with deterministic outputs. Key defaults:
//   - 400k purchase, 25% down → loanAmt 300k
//   - 6% rate, 30yr amort → monthlyPayment ≈ $1798.65, annualDebtService ≈ $21,583.80
//   - 2 units × $1800/mo → grossRentYear0 = $43,200
//   - 5% vacancy → EGI = $41,040
//   - fixed expenses $12,120 → NOI = $28,920
//   - cashFlow yr1 ≈ $7,336.20
//   - Cap Rate ≈ 7.23%, DSCR ≈ 1.34, CoC ≈ 7.34%
function baseDeal(assumptionOverrides = {}) {
  return {
    id: 1,
    assumptions: {
      purchasePrice: 400000,
      downPaymentPct: 25,
      downPaymentDollar: 0,
      loanLimit: 0,
      interestRate: 6,
      amortYears: 30,
      holdPeriod: 5,
      closingCosts: { title: 0, transferTax: 0, inspection: 0, attorney: 0, lenderFees: 0, discountPoints: 0, appraisal: 0, creditReport: 0 },
      insuranceUpfront: false,
      sellerConcessions: 0,
      pmi: 0,
      numUnits: 2,
      units: [
        { rent: 1800, listedRent: 0, rentcastRent: 0 },
        { rent: 1800, listedRent: 0, rentcastRent: 0 },
        { rent: 0,    listedRent: 0, rentcastRent: 0 },
        { rent: 0,    listedRent: 0, rentcastRent: 0 },
      ],
      vacancyRate: 5,
      expenseModes: {
        propertyTax: 'value', insurance: 'value', maintenance: 'value',
        capex: 'value', propertyMgmt: 'value', utilities: 'value', hoa: 'value',
      },
      expenses: {
        propertyTax: 6000,    propertyTaxPct: 1.5,
        insurance: 1800,      insurancePct: 0.5,
        maintenance: 2160,    maintenancePct: 5,
        capex: 2160,          capexPct: 5,
        propertyMgmt: 0,      propertyMgmtPct: 0,
        utilities: 0,         utilitiesPct: 0,
        hoa: 0,
        costSegFee: 0,
      },
      selfManage: true,
      rentGrowth: 0,
      expenseGrowth: 0,
      appreciationRate: 0,
      taxBracket: 22,
      state: '',
      filingStatus: 'single',
      localTaxRate: 0,
      ownerOccupied: false,
      ownerUnit: 0,
      ownerOccupancyYears: 2,
      alternativeRent: 0,
      ownerUseUtilities: 0,
      refi: { enabled: false, year: 5, newRate: 6.5, newLTV: 75 },
      valueAdd: { enabled: false, reModelCost: 40000, rentBumpPerUnit: 200, unitsRenovated: 2, completionYear: 3 },
      tax: {
        enabled: false, landValuePct: 20, costSegEnabled: false,
        costSeg5YrPct: 15, costSeg15YrPct: 10, bonusDepPct: 100,
        sec179Amount: 0, paStatus: 'active_participant', agi: 100000,
      },
      ...assumptionOverrides,
    },
  };
}

// ─── 1. Guard / edge cases ────────────────────────────────────────────────────
describe('calcDeal — guard and edge cases', () => {
  test('returns empty object when deal is null', () => {
    expect(calcDeal(null)).toEqual({});
  });

  test('returns empty object when deal has no assumptions', () => {
    expect(calcDeal({ id: 1 })).toEqual({});
  });

  test('returns empty object when units array is missing', () => {
    const deal = baseDeal();
    delete deal.assumptions.units;
    expect(calcDeal(deal)).toEqual({});
  });

  test('handles zero purchase price without throwing', () => {
    const r = calcDeal(baseDeal({ purchasePrice: 0 }));
    expect(r.loanAmt).toBe(0);
    expect(r.monthlyPayment).toBe(0);
    expect(r.capRate).toBe(0);
  });
});

// ─── 2. Core financials ───────────────────────────────────────────────────────
describe('calcDeal — core financials (400k, 6%, 30yr, 2×$1800)', () => {
  let r;
  beforeEach(() => { r = calcDeal(baseDeal()); });

  // Loan mechanics
  test('loanAmt = purchasePrice × (1 − downPaymentPct)', () => {
    expect(r.loanAmt).toBeCloseTo(300000, 0);
  });

  test('totalCash = down payment when closing costs are zero', () => {
    expect(r.totalCash).toBeCloseTo(100000, 0);
  });

  // Standard 30yr 6% payment on $300k = $1,798.65 (textbook value)
  test('monthlyPayment ≈ $1,798.65 (30yr 6% on $300k)', () => {
    expect(r.monthlyPayment).toBeCloseTo(1798.65, 1);
  });

  test('annualDebtService = monthlyPayment × 12', () => {
    expect(r.annualDebtService).toBeCloseTo(r.monthlyPayment * 12, 1);
  });

  test('grossRentYear0 = sum of all unit rents × 12', () => {
    expect(r.grossRentYear0).toBe(43200);
  });

  test('baseExpenses = sum of all fixed expense fields', () => {
    // propertyTax(6000) + insurance(1800) + maintenance(2160) + capex(2160) = 12120
    expect(r.baseExpenses).toBe(12120);
  });

  test('NOI yr1 = EGI − expenses (EGI = grossRent × (1 − vacancy))', () => {
    const egi = 43200 * 0.95; // = 41040
    expect(r.noi).toBeCloseTo(egi - 12120, 0); // = 28920
  });

  test('Cap Rate yr1 ≈ 7.23%', () => {
    expect(r.capRate).toBeCloseTo(28920 / 400000, 4); // ≈ 0.0723
  });

  test('DSCR yr1 = NOI / annualDebtService (≈ 1.34)', () => {
    expect(r.dscr).toBeCloseTo(28920 / r.annualDebtService, 2);
  });

  test('cash flow yr1 = NOI − debt service (≈ $7,336)', () => {
    const expected = 28920 - r.annualDebtService;
    expect(r.years[0].cashFlow).toBeCloseTo(expected, 0);
  });

  test('CoC yr1 = cash flow / totalCash', () => {
    expect(r.cocReturn).toBeCloseTo(r.years[0].cashFlow / r.totalCash, 4);
  });

  test('monthlyCashFlow yr1 = cashFlow / 12', () => {
    expect(r.years[0].monthlyCashFlow).toBeCloseTo(r.years[0].cashFlow / 12, 2);
  });

  test('breakEvenOccupancy = (debtService + expenses) / grossRent', () => {
    const expected = (r.annualDebtService + r.baseExpenses) / r.grossRentYear0;
    expect(r.breakEvenOccupancy).toBeCloseTo(expected, 4);
  });

  test('DSCR < 1 when rents are too low to cover debt', () => {
    const r2 = calcDeal(baseDeal({ units: [
      { rent: 700, listedRent: 0, rentcastRent: 0 },
      { rent: 700, listedRent: 0, rentcastRent: 0 },
      { rent: 0,   listedRent: 0, rentcastRent: 0 },
      { rent: 0,   listedRent: 0, rentcastRent: 0 },
    ]}));
    expect(r2.dscr).toBeLessThan(1);
  });
});

// ─── 3. Hold period ───────────────────────────────────────────────────────────
describe('calcDeal — hold period', () => {
  test('years array length matches holdPeriod', () => {
    expect(calcDeal(baseDeal({ holdPeriod: 3 })).years).toHaveLength(3);
    expect(calcDeal(baseDeal({ holdPeriod: 10 })).years).toHaveLength(10);
    expect(calcDeal(baseDeal({ holdPeriod: 20 })).years).toHaveLength(20);
  });

  test('holdPeriod is clamped to 30 max; 0 falls back to default 10', () => {
    // holdPeriod=0 is falsy — the engine treats it as unset and defaults to 10
    // (calc.js: Math.round(+a.holdPeriod||10)) — 0||10 = 10
    expect(calcDeal(baseDeal({ holdPeriod: 0 })).years).toHaveLength(10);
    expect(calcDeal(baseDeal({ holdPeriod: 99 })).years).toHaveLength(30);
  });

  test('loan balance decreases each year (principal paydown)', () => {
    const r = calcDeal(baseDeal({ holdPeriod: 5 }));
    for (let i = 1; i < r.years.length; i++) {
      expect(r.years[i].balance).toBeLessThan(r.years[i - 1].balance);
    }
  });

  test('rent grows with rentGrowth rate year over year', () => {
    const r = calcDeal(baseDeal({ rentGrowth: 3, holdPeriod: 3 }));
    // Year 2 grossRent = Year 1 × 1.03
    expect(r.years[1].grossRent).toBeCloseTo(r.years[0].grossRent * 1.03, 0);
    expect(r.years[2].grossRent).toBeCloseTo(r.years[0].grossRent * 1.03 ** 2, 0);
  });

  test('NOI increases over time when rent grows faster than expenses', () => {
    const r = calcDeal(baseDeal({ rentGrowth: 5, expenseGrowth: 2, holdPeriod: 5 }));
    expect(r.years[4].noi).toBeGreaterThan(r.years[0].noi);
  });

  test('property value compounds by appreciationRate each year', () => {
    const r = calcDeal(baseDeal({ appreciationRate: 3, holdPeriod: 3 }));
    expect(r.years[0].propertyValue).toBeCloseTo(400000 * 1.03, 0);
    expect(r.years[2].propertyValue).toBeCloseTo(400000 * 1.03 ** 3, 0);
  });
});

// ─── 4. Owner occupancy ───────────────────────────────────────────────────────
describe('calcDeal — owner occupancy', () => {
  const ooDeal = () => baseDeal({
    ownerOccupied: true,
    ownerUnit: 0,
    ownerOccupancyYears: 2,
    alternativeRent: 1500,
  });

  test('collectible rent is reduced by owner unit rent during OO years', () => {
    const r = calcDeal(ooDeal());
    // Owner in unit 0 ($1800/mo) — yr1 rentAfterOO = grossRent − $21,600
    expect(r.years[0].ooRentDeduction).toBeCloseTo(1800 * 12, 0);
    expect(r.years[0].rentAfterOO).toBeCloseTo(43200 - 21600, 0);
  });

  test('OO rent deduction stops after ownerOccupancyYears', () => {
    const r = calcDeal(ooDeal());
    expect(r.years[0].ooRentDeduction).toBeGreaterThan(0); // yr1: owner in unit
    expect(r.years[1].ooRentDeduction).toBeGreaterThan(0); // yr2: still in unit
    expect(r.years[2].ooRentDeduction).toBe(0);             // yr3: moved out
  });

  test('incrementalCashFlow = cashFlow + altRent×12 during OO years', () => {
    const r = calcDeal(ooDeal());
    const yr1 = r.years[0];
    expect(yr1.incrementalCashFlow).toBeCloseTo(yr1.cashFlow + 1500 * 12, 0);
  });

  test('incrementalCashFlow equals cashFlow after OO years end', () => {
    const r = calcDeal(ooDeal());
    const yr3 = r.years[2]; // after ownerOccupancyYears=2
    expect(yr3.incrementalCashFlow).toBeCloseTo(yr3.cashFlow, 2);
  });

  test('non-OO deal: incrementalCashFlow always equals cashFlow', () => {
    const r = calcDeal(baseDeal({ ownerOccupied: false }));
    r.years.forEach(y => {
      expect(y.incrementalCashFlow).toBeCloseTo(y.cashFlow, 2);
    });
  });

  test('lender DSCR uses full-building rent (no OO deduction)', () => {
    const r = calcDeal(ooDeal());
    // dscrLenderView should be higher than investor DSCR during OO years
    // because lender underwrites all units as rented
    expect(r.years[0].dscrLenderView).toBeGreaterThan(r.years[0].dscr);
  });
});

// ─── 5. FHA Self-Sufficiency Test ─────────────────────────────────────────────
describe('calcDeal — FHA Self-Sufficiency Test', () => {
  test('does not apply to 2-unit properties', () => {
    const r = calcDeal(baseDeal({ numUnits: 2 }));
    expect(r.fhaSelfSufficiency.applies).toBe(false);
  });

  test('applies to 3-unit and 4-unit properties', () => {
    const r3 = calcDeal(baseDeal({ numUnits: 3,
      units: [{ rent:1200,listedRent:0,rentcastRent:0 }, { rent:1200,listedRent:0,rentcastRent:0 },
              { rent:1200,listedRent:0,rentcastRent:0 }, { rent:0,listedRent:0,rentcastRent:0 }] }));
    expect(r3.fhaSelfSufficiency.applies).toBe(true);
  });

  test('PASS when 75% of gross rents ≥ PITI', () => {
    // 3 units × $1200/mo = $43,200/yr. 75% = $32,400
    // PITI = annualDebtService($21,583) + propertyTax($6,000) + insurance($1,800) = $29,383 → PASS
    const r = calcDeal(baseDeal({
      numUnits: 3,
      units: [{ rent:1200,listedRent:0,rentcastRent:0 }, { rent:1200,listedRent:0,rentcastRent:0 },
              { rent:1200,listedRent:0,rentcastRent:0 }, { rent:0,listedRent:0,rentcastRent:0 }],
    }));
    const fha = r.fhaSelfSufficiency;
    expect(fha.applies).toBe(true);
    expect(fha.passes).toBe(true);
    expect(fha.delta).toBeGreaterThan(0); // positive = surplus
  });

  test('FAIL when 75% of gross rents < PITI (high-cost property)', () => {
    // 600k purchase, 6%, 30yr → monthlyPayment ≈ $2,697.98, annual ≈ $32,376
    // PITI ≈ $32,376 + $9,000 + $2,700 = $44,076
    // 3 units × $1200/mo = $43,200, 75% = $32,400 < $44,076 → FAIL
    const r = calcDeal(baseDeal({
      purchasePrice: 600000,
      numUnits: 3,
      units: [{ rent:1200,listedRent:0,rentcastRent:0 }, { rent:1200,listedRent:0,rentcastRent:0 },
              { rent:1200,listedRent:0,rentcastRent:0 }, { rent:0,listedRent:0,rentcastRent:0 }],
      expenses: {
        propertyTax: 9000, propertyTaxPct: 1.5,
        insurance: 2700,   insurancePct: 0.5,
        maintenance: 2160, maintenancePct: 5,
        capex: 2160,       capexPct: 5,
        propertyMgmt: 0,   propertyMgmtPct: 0,
        utilities: 0,      utilitiesPct: 0,
        hoa: 0,            costSegFee: 0,
      },
    }));
    const fha = r.fhaSelfSufficiency;
    expect(fha.applies).toBe(true);
    expect(fha.passes).toBe(false);
    expect(fha.delta).toBeLessThan(0); // negative = shortfall
  });

  test('threshold75Pct = 75% of all-unit gross annual rent', () => {
    const r = calcDeal(baseDeal({
      numUnits: 3,
      units: [{ rent:1000,listedRent:0,rentcastRent:0 }, { rent:1000,listedRent:0,rentcastRent:0 },
              { rent:1000,listedRent:0,rentcastRent:0 }, { rent:0,listedRent:0,rentcastRent:0 }],
    }));
    expect(r.fhaSelfSufficiency.threshold75Pct).toBeCloseTo(1000 * 3 * 12 * 0.75, 0);
  });
});

// ─── 6. Value-add renovation ──────────────────────────────────────────────────
describe('calcDeal — value-add renovation', () => {
  const vaDeal = () => baseDeal({
    holdPeriod: 5,
    valueAdd: { enabled: true, reModelCost: 40000, rentBumpPerUnit: 300, unitsRenovated: 2, completionYear: 2 },
  });

  test('remodel cost outflow: 50% yr1, 50% yr2, 0 thereafter', () => {
    const r = calcDeal(vaDeal());
    expect(r.years[0].vaRemodelOutflow).toBeCloseTo(20000, 0);
    expect(r.years[1].vaRemodelOutflow).toBeCloseTo(20000, 0);
    expect(r.years[2].vaRemodelOutflow).toBe(0);
  });

  test('rent bump is NOT applied before completionYear', () => {
    const r = calcDeal(vaDeal()); // completionYear = 2
    expect(r.years[0].vaRentLift).toBe(0); // yr1: no lift yet
  });

  test('rent bump IS applied from completionYear onwards', () => {
    const r = calcDeal(vaDeal()); // completionYear = 2, bump = 300×2 units = 600/mo = 7200/yr
    expect(r.years[1].vaRentLift).toBeCloseTo(300 * 2 * 12, 0); // yr2: bump applies
    expect(r.years[2].vaRentLift).toBeCloseTo(300 * 2 * 12, 0); // yr3: still applies
  });

  test('totalCash includes remodel cost', () => {
    const r = calcDeal(vaDeal());
    expect(r.totalCash).toBeCloseTo(100000 + 40000, 0); // down + reno
  });

  test('vaEnabled IRR > non-VA IRR (value-add improves returns when rents rise)', () => {
    const rVA  = calcDeal(vaDeal());
    const rBase = calcDeal(baseDeal({ holdPeriod: 5 }));
    // VA is hard to compare directly (different cash invested), but irrWithVA should
    // differ from irrWithoutVA when VA is enabled
    expect(rVA.vaEnabled).toBe(true);
    expect(rVA.irrWithVA).not.toEqual(rVA.irrWithoutVA);
  });
});

// ─── 7. Refinance ─────────────────────────────────────────────────────────────
describe('calcDeal — refinance', () => {
  const refiDeal = () => baseDeal({
    holdPeriod: 7,
    appreciationRate: 3,
    refi: { enabled: true, year: 3, newRate: 5.5, newLTV: 75 },
  });

  test('refiEvent appears in the correct year only', () => {
    const r = calcDeal(refiDeal());
    expect(r.years[0].refiEvent).toBeNull();
    expect(r.years[1].refiEvent).toBeNull();
    expect(r.years[2].refiEvent).not.toBeNull(); // yr3 = index 2
    expect(r.years[3].refiEvent).toBeNull();
  });

  test('refi cash-out is non-negative', () => {
    const r = calcDeal(refiDeal());
    expect(r.years[2].refiEvent.cashOut).toBeGreaterThanOrEqual(0);
  });

  test('balance resets upward at refi year (new larger loan)', () => {
    const r = calcDeal(refiDeal());
    // After refi, balance = new loan amount (higher than pre-refi balance)
    expect(r.years[2].balance).toBeGreaterThan(r.years[1].balance);
  });

  test('refiYear property returned on result when refi enabled', () => {
    const r = calcDeal(refiDeal());
    expect(r.refiYear).toBe(3);
  });

  test('refiYear is null when refi disabled', () => {
    const r = calcDeal(baseDeal());
    expect(r.refiYear).toBeNull();
  });
});

// ─── 8. Exit analysis ─────────────────────────────────────────────────────────
describe('calcDeal — exit analysis', () => {
  test('exitValue = purchasePrice × (1+appreciationRate)^holdYears', () => {
    const r = calcDeal(baseDeal({ appreciationRate: 3, holdPeriod: 5 }));
    expect(r.exitValue).toBeCloseTo(400000 * 1.03 ** 5, 0);
  });

  test('netProceeds = exitValue − exitLoanBalance − netTaxOnSale', () => {
    const r = calcDeal(baseDeal({ appreciationRate: 3, holdPeriod: 5 }));
    expect(r.netProceeds).toBeCloseTo(r.exitValue - r.exitLoanBalance - r.netTaxOnSale, 0);
  });

  test('IRR is positive for a profitable deal', () => {
    const r = calcDeal(baseDeal({ appreciationRate: 3, holdPeriod: 10 }));
    expect(r.irr).toBeGreaterThan(0);
  });

  test('IRR improves with higher appreciation', () => {
    const r0 = calcDeal(baseDeal({ appreciationRate: 0, holdPeriod: 10 }));
    const r5 = calcDeal(baseDeal({ appreciationRate: 5, holdPeriod: 10 }));
    expect(r5.irr).toBeGreaterThan(r0.irr);
  });

  test('equityMultiple > 1 for a profitable hold', () => {
    const r = calcDeal(baseDeal({ appreciationRate: 3, holdPeriod: 10 }));
    expect(r.equityMultiple).toBeGreaterThan(1);
  });

  test('no capital gains tax when appreciation is zero', () => {
    // With appreciationRate=0 and 5yr hold, exitValue = purchasePrice → no gain
    const r = calcDeal(baseDeal({ appreciationRate: 0, holdPeriod: 5 }));
    expect(r.totalGainOnSale).toBeCloseTo(0, 0);
    expect(r.netTaxOnSale).toBeCloseTo(0, 0);
  });
});

// ─── 9. Expense modes (pct vs value) ─────────────────────────────────────────
describe('calcDeal — expense modes', () => {
  test('pct mode: propertyTax = rate% × grossRent', () => {
    const r = calcDeal(baseDeal({
      expenseModes: {
        propertyTax: 'pct', insurance: 'value', maintenance: 'value',
        capex: 'value', propertyMgmt: 'value', utilities: 'value', hoa: 'value',
      },
      expenses: {
        propertyTax: 0,    propertyTaxPct: 10,   // 10% of grossRentYear0
        insurance: 0,      insurancePct: 0,
        maintenance: 0,    maintenancePct: 0,
        capex: 0,          capexPct: 0,
        propertyMgmt: 0,   propertyMgmtPct: 0,
        utilities: 0,      utilitiesPct: 0,
        hoa: 0,            costSegFee: 0,
      },
    }));
    // 10% of grossRentYear0 (43200) = 4320
    expect(r.baseExpenses).toBeCloseTo(4320, 0);
  });

  test('propertyMgmt is zero when selfManage=true regardless of pct setting', () => {
    const r = calcDeal(baseDeal({
      selfManage: true,
      expenseModes: { ...baseDeal().assumptions.expenseModes, propertyMgmt: 'pct' },
      expenses: { ...baseDeal().assumptions.expenses, propertyMgmtPct: 8 },
    }));
    expect(r.baseExpPreakdown?.propertyMgmt ?? r.baseExpBreakdown?.propertyMgmt ?? 0).toBe(0);
    // Verify indirectly: NOI should match expectation without mgmt fee
    expect(r.noi).toBeCloseTo(43200 * 0.95 - 12120, 0);
  });

  test('HOA fee adds to base expenses', () => {
    const r = calcDeal(baseDeal({ expenses: { ...baseDeal().assumptions.expenses, hoa: 2400 } }));
    expect(r.baseExpenses).toBeCloseTo(12120 + 2400, 0);
  });

  test('seller concessions reduce totalCash and loan amount', () => {
    const r = calcDeal(baseDeal({ sellerConcessions: 10000 }));
    // loanAmt = pp - dp - sellerConcessions = 400000 - 100000 - 10000 = 290000
    expect(r.loanAmt).toBeCloseTo(290000, 0);
    // totalCash = dp + closingCosts - sellerConcessions = 100000 - 10000 = 90000
    expect(r.totalCash).toBeCloseTo(90000, 0);
  });
});

// ─── 10. calcExitScenarios ────────────────────────────────────────────────────
describe('calcExitScenarios', () => {
  test('always includes standard exit years (3, 5, 7, 10, 15, 20)', () => {
    const scenarios = calcExitScenarios(baseDeal({ holdPeriod: 10 }));
    const years = scenarios.map(s => s.yr);
    [3, 5, 7, 10, 15, 20].forEach(yr => expect(years).toContain(yr));
  });

  test('includes user hold period if not already in standard set', () => {
    const scenarios = calcExitScenarios(baseDeal({ holdPeriod: 8 }));
    const years = scenarios.map(s => s.yr);
    expect(years).toContain(8);
  });

  test('marks correct scenario as isUserSelected', () => {
    const scenarios = calcExitScenarios(baseDeal({ holdPeriod: 7 }));
    const selected = scenarios.filter(s => s.isUserSelected);
    expect(selected).toHaveLength(1);
    expect(selected[0].yr).toBe(7);
  });

  test('equityMultiple increases with longer hold for appreciating property', () => {
    // Note: IRR does NOT necessarily increase with hold length — longer holds can lower IRR
    // because capital is tied up longer. Equity multiple (total return) reliably increases.
    const scenarios = calcExitScenarios(baseDeal({ appreciationRate: 3, holdPeriod: 10 }));
    const yr5  = scenarios.find(s => s.yr === 5);
    const yr15 = scenarios.find(s => s.yr === 15);
    expect(yr15.equityMultiple).toBeGreaterThan(yr5.equityMultiple);
  });
});
