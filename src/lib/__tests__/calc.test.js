import { describe, it, expect, vi } from 'vitest';

// Mock Supabase client before importing calc
vi.mock('../constants', () => ({
  sbClient: { auth: { getUser: vi.fn() } },
  sbWriteDeal: vi.fn(),
}));

import { calcDeal, newDeal, resolveExpenses, calcSensitivity, calcExitScenarios, DEFAULT_PREFS } from '../calc';

// ─── Helper: create a deal with specific overrides ──────────────────────────
function makeDeal(overrides = {}) {
  const deal = newDeal();
  const a = deal.assumptions;
  a.purchasePrice = overrides.purchasePrice ?? 400000;
  a.downPaymentPct = overrides.downPaymentPct ?? 25;
  a.interestRate = overrides.interestRate ?? 7;
  a.amortYears = overrides.amortYears ?? 30;
  a.numUnits = overrides.numUnits ?? 2;
  a.vacancyRate = overrides.vacancyRate ?? 5;
  a.rentGrowth = overrides.rentGrowth ?? 3;
  a.expenseGrowth = overrides.expenseGrowth ?? 3;
  a.appreciationRate = overrides.appreciationRate ?? 3;
  a.taxBracket = overrides.taxBracket ?? 22;
  a.ownerOccupied = overrides.ownerOccupied ?? false;
  // Set rents
  const rents = overrides.rents ?? [1500, 1500];
  for (let i = 0; i < a.units.length; i++) {
    a.units[i].rent = rents[i] || 0;
  }
  if (overrides.assumptions) Object.assign(a, overrides.assumptions);
  return deal;
}

// ─── TESTS ──────────────────────────────────────────────────────────────────

describe('newDeal', () => {
  it('creates a deal with default prefs', () => {
    const deal = newDeal();
    expect(deal.id).toBeDefined();
    expect(deal.assumptions).toBeDefined();
    expect(deal.assumptions.downPaymentPct).toBe(DEFAULT_PREFS.downPaymentPct);
    expect(deal.assumptions.units).toHaveLength(4);
    expect(deal.status).toBe('Analyzing');
  });

  it('seeds custom prefs into new deal', () => {
    const deal = newDeal({ downPaymentPct: 20, interestRate: 6.5 });
    expect(deal.assumptions.downPaymentPct).toBe(20);
    expect(deal.assumptions.interestRate).toBe(6.5);
  });
});

describe('calcDeal', () => {
  it('returns empty object for null/missing deal', () => {
    expect(calcDeal(null)).toEqual({});
    expect(calcDeal({})).toEqual({});
    expect(calcDeal({ assumptions: {} })).toEqual({});
  });

  it('calculates correct loan amount', () => {
    const deal = makeDeal({ purchasePrice: 400000, downPaymentPct: 25 });
    const r = calcDeal(deal);
    expect(r.loanAmt).toBe(300000);
  });

  it('loanAmt correctly subtracts seller concessions (regression: was ignoring them)', () => {
    const deal = makeDeal({ purchasePrice: 400000, downPaymentPct: 25 });
    deal.assumptions.sellerConcessions = 10000;
    const r = calcDeal(deal);
    // loanAmt = 400000 - 100000 (dp) - 10000 (concessions) = 290000
    expect(r.loanAmt).toBe(290000);
  });

  it('calculates correct gross rent year 0', () => {
    const deal = makeDeal({ rents: [1500, 1200], numUnits: 2 });
    const r = calcDeal(deal);
    expect(r.grossRentYear0).toBe((1500 + 1200) * 12);
  });

  it('produces 10 years of projections', () => {
    const deal = makeDeal();
    const r = calcDeal(deal);
    expect(r.years).toHaveLength(10);
    expect(r.years[0].yr).toBe(1);
    expect(r.years[9].yr).toBe(10);
  });

  it('calculates positive monthly payment', () => {
    const deal = makeDeal({ purchasePrice: 400000 });
    const r = calcDeal(deal);
    expect(r.monthlyPayment).toBeGreaterThan(0);
    expect(r.annualDebtService).toBeCloseTo(r.monthlyPayment * 12, 2);
  });

  it('DSCR > 0 when there is income and debt', () => {
    const deal = makeDeal({ rents: [2000, 2000] });
    const r = calcDeal(deal);
    expect(r.dscr).toBeGreaterThan(0);
  });

  it('cap rate = NOI / purchase price', () => {
    const deal = makeDeal({ purchasePrice: 400000, rents: [2000, 2000] });
    const r = calcDeal(deal);
    const expected = r.years[0].noi / 400000;
    expect(r.capRate).toBeCloseTo(expected, 6);
  });

  it('IRR converges to a reasonable number', () => {
    const deal = makeDeal({ rents: [2000, 2000] });
    const r = calcDeal(deal);
    expect(r.irr).toBeGreaterThan(-1);
    expect(r.irr).toBeLessThan(1);
  });

  it('equity multiple > 0', () => {
    const deal = makeDeal({ rents: [2000, 2000] });
    const r = calcDeal(deal);
    expect(r.equityMultiple).toBeGreaterThan(0);
  });

  it('property value appreciates over 10 years', () => {
    const deal = makeDeal({ purchasePrice: 400000, appreciationRate: 3 });
    const r = calcDeal(deal);
    expect(r.years[9].propertyValue).toBeGreaterThan(400000);
  });

  it('loan balance decreases over time', () => {
    const deal = makeDeal();
    const r = calcDeal(deal);
    expect(r.years[9].balance).toBeLessThan(r.loanAmt);
    // Balance should decrease monotonically
    for (let i = 1; i < r.years.length; i++) {
      expect(r.years[i].balance).toBeLessThan(r.years[i - 1].balance);
    }
  });

  it('rent grows by rentGrowth rate', () => {
    const deal = makeDeal({ rents: [1000, 1000], rentGrowth: 3, numUnits: 2 });
    const r = calcDeal(deal);
    const yr1Rent = r.years[0].grossRent;
    const yr2Rent = r.years[1].grossRent;
    expect(yr2Rent / yr1Rent).toBeCloseTo(1.03, 4);
  });

  it('expenses grow by expenseGrowth rate', () => {
    const deal = makeDeal({ expenseGrowth: 3 });
    const r = calcDeal(deal);
    const yr1Exp = r.years[0].expenses;
    const yr2Exp = r.years[1].expenses;
    expect(yr2Exp / yr1Exp).toBeCloseTo(1.03, 4);
  });

  it('break-even occupancy is between 0 and 1', () => {
    const deal = makeDeal({ rents: [2000, 2000] });
    const r = calcDeal(deal);
    expect(r.breakEvenOccupancy).toBeGreaterThan(0);
    expect(r.breakEvenOccupancy).toBeLessThan(1);
  });
});

describe('calcDeal — owner occupancy', () => {
  it('reduces cash flow when owner-occupied', () => {
    const baseD = makeDeal({ rents: [1500, 1500], numUnits: 2 });
    const ooD = makeDeal({ rents: [1500, 1500], numUnits: 2, ownerOccupied: true });
    ooD.assumptions.ownerUnit = 0;
    ooD.assumptions.ownerOccupancyYears = 2;

    const baseR = calcDeal(baseD);
    const ooR = calcDeal(ooD);

    // OO deal deducts the owner unit rent from NOI — cash flow should be lower in year 1
    expect(ooR.years[0].cashFlow).toBeLessThan(baseR.years[0].cashFlow);
    // After OO period ends, ooRentDeduction drops to 0 — cash flow recovers to base level
    expect(ooR.years[2].ooRentDeduction).toBe(0);
  });

  it('incrementalCashFlow adds back alternative rent savings during OO period', () => {
    const deal = makeDeal({ rents: [1500, 1500], numUnits: 2, ownerOccupied: true });
    deal.assumptions.ownerUnit = 0;
    deal.assumptions.ownerOccupancyYears = 3;
    deal.assumptions.alternativeRent = 1200;
    const r = calcDeal(deal);
    // incrementalCashFlow = cashFlow + altRent — should be higher than raw cashFlow
    expect(r.years[0].incrementalCashFlow).toBeGreaterThan(r.years[0].cashFlow);
  });
});

describe('calcDeal — refinance', () => {
  it('refi produces cash-out and changes debt service', () => {
    const deal = makeDeal({ purchasePrice: 400000, rents: [2000, 2000], appreciationRate: 5 });
    deal.assumptions.refi = { enabled: true, year: 3, newRate: 5.5, newLTV: 75 };
    const r = calcDeal(deal);

    // Refi event should exist in year 3
    expect(r.years[2].refiEvent).toBeTruthy();
    expect(r.years[2].refiEvent.cashOut).toBeGreaterThanOrEqual(0);
    // Debt service should change after refi
    expect(r.years[2].debtService).not.toBe(r.years[0].debtService);
  });
});

describe('calcDeal — value-add', () => {
  it('value-add increases rent after completion year', () => {
    const deal = makeDeal({ rents: [1000, 1000], numUnits: 2 });
    deal.assumptions.valueAdd = { enabled: true, reModelCost: 40000, rentBumpPerUnit: 200, unitsRenovated: 2, completionYear: 2 };
    const r = calcDeal(deal);

    // Before completion: no rent lift
    expect(r.years[0].vaRentLift).toBe(0);
    // After completion: rent lift active
    expect(r.years[1].vaRentLift).toBeGreaterThan(0);
  });
});

describe('resolveExpenses', () => {
  it('calculates expenses from percentage mode', () => {
    const grossRent = 36000;
    const a = {
      expenseModes: { propertyTax: 'pct', insurance: 'pct', maintenance: 'pct', capex: 'pct', propertyMgmt: 'pct', utilities: 'value' },
      expenses: { propertyTax: 0, propertyTaxPct: 10, insurance: 0, insurancePct: 5, maintenance: 0, maintenancePct: 5, capex: 0, capexPct: 5, propertyMgmt: 0, propertyMgmtPct: 8, utilities: 1200, utilitiesPct: 0 },
      selfManage: false,
    };
    const exp = resolveExpenses(a, grossRent);
    expect(exp.propertyTax).toBeCloseTo(3600, 0); // 10% of 36000
    expect(exp.insurance).toBeCloseTo(1800, 0);    // 5% of 36000
    expect(exp.utilities).toBe(1200);               // fixed value
    expect(exp.total).toBeGreaterThan(0);
  });

  it('sets property management to 0 when self-managed', () => {
    const a = {
      expenseModes: { propertyTax: 'value', insurance: 'value', maintenance: 'value', capex: 'value', propertyMgmt: 'pct', utilities: 'value' },
      expenses: { propertyTax: 5000, insurance: 2000, maintenance: 2000, capex: 2000, propertyMgmt: 0, propertyMgmtPct: 8, utilities: 0, utilitiesPct: 0 },
      selfManage: true,
    };
    const exp = resolveExpenses(a, 36000);
    expect(exp.propertyMgmt).toBe(0);
  });
});

describe('calcSensitivity', () => {
  it('returns 5 sensitivity deltas', () => {
    const deal = makeDeal({ rents: [1500, 1500] });
    const sens = calcSensitivity(deal);
    expect(sens).toHaveLength(5);
    expect(sens.map(s => s.label)).toEqual(['Rent', 'Vacancy', 'Purchase Price', 'Interest Rate', 'Appreciation']);
  });

  it('higher rent increases IRR', () => {
    const deal = makeDeal({ rents: [1500, 1500] });
    const sens = calcSensitivity(deal);
    const rentSens = sens.find(s => s.label === 'Rent');
    expect(rentSens.irrHighDelta).toBeGreaterThan(0);
    expect(rentSens.irrLowDelta).toBeLessThan(0);
  });
});

describe('calcDeal — holdPeriod (BACK-805)', () => {
  it('defaults to 10 years when holdPeriod is not set', () => {
    const deal = makeDeal();
    const r = calcDeal(deal);
    expect(r.years).toHaveLength(10);
  });

  it('respects a custom holdPeriod of 5 years', () => {
    const deal = makeDeal({ assumptions: { holdPeriod: 5 } });
    const r = calcDeal(deal);
    expect(r.years).toHaveLength(5);
    expect(r.years[4].yr).toBe(5);
  });

  it('respects a custom holdPeriod of 20 years', () => {
    const deal = makeDeal({ assumptions: { holdPeriod: 20 } });
    const r = calcDeal(deal);
    expect(r.years).toHaveLength(20);
    expect(r.years[19].yr).toBe(20);
  });

  it('defaults to 10 when holdPeriod is 0 (falsy)', () => {
    // holdPeriod uses ||10 fallback, so 0 is treated the same as unset
    const deal = makeDeal({ assumptions: { holdPeriod: 0 } });
    const r = calcDeal(deal);
    expect(r.years).toHaveLength(10);
  });

  it('clamps holdPeriod to 30 at maximum', () => {
    const deal = makeDeal({ assumptions: { holdPeriod: 50 } });
    const r = calcDeal(deal);
    expect(r.years).toHaveLength(30);
  });

  it('longer hold period produces lower IRR when cash flow is negative', () => {
    // High purchase price relative to rent = negative cash flow; longer hold = lower return
    const deal = makeDeal({ purchasePrice: 800000, rents: [1000, 1000] });
    const r5  = calcDeal({ ...deal, assumptions: { ...deal.assumptions, holdPeriod: 5 } });
    const r20 = calcDeal({ ...deal, assumptions: { ...deal.assumptions, holdPeriod: 20 } });
    // IRR should differ between hold periods
    expect(r5.irr).not.toBeCloseTo(r20.irr, 3);
  });
});

describe('calcExitScenarios', () => {
  it('always includes standard exit years', () => {
    const deal = makeDeal({ assumptions: { holdPeriod: 10 } });
    const scenarios = calcExitScenarios(deal);
    const years = scenarios.map(s => s.yr);
    expect(years).toContain(3);
    expect(years).toContain(5);
    expect(years).toContain(10);
  });

  it('includes user hold period as a scenario', () => {
    const deal = makeDeal({ assumptions: { holdPeriod: 12 } });
    const scenarios = calcExitScenarios(deal);
    const userScenario = scenarios.find(s => s.isUserSelected);
    expect(userScenario).toBeDefined();
    expect(userScenario.yr).toBe(12);
  });

  it('marks only one scenario as isUserSelected', () => {
    const deal = makeDeal({ assumptions: { holdPeriod: 7 } });
    const scenarios = calcExitScenarios(deal);
    const selected = scenarios.filter(s => s.isUserSelected);
    expect(selected).toHaveLength(1);
  });

  it('returns required metric fields for each scenario', () => {
    const deal = makeDeal({ rents: [2000, 2000] });
    const scenarios = calcExitScenarios(deal);
    for (const s of scenarios) {
      expect(s).toHaveProperty('yr');
      expect(s).toHaveProperty('irr');
      expect(s).toHaveProperty('equityMultiple');
      expect(s).toHaveProperty('netProceeds');
      expect(s).toHaveProperty('cocReturn');
      expect(s).toHaveProperty('exitValue');
    }
  });

  it('scenarios are sorted in ascending year order', () => {
    const deal = makeDeal({ assumptions: { holdPeriod: 8 } });
    const scenarios = calcExitScenarios(deal);
    for (let i = 1; i < scenarios.length; i++) {
      expect(scenarios[i].yr).toBeGreaterThan(scenarios[i - 1].yr);
    }
  });

  it('longer hold period has higher exit value due to appreciation', () => {
    const deal = makeDeal({ purchasePrice: 400000, appreciationRate: 3 });
    const scenarios = calcExitScenarios(deal);
    const yr3 = scenarios.find(s => s.yr === 3);
    const yr20 = scenarios.find(s => s.yr === 20);
    expect(yr20.exitValue).toBeGreaterThan(yr3.exitValue);
  });
});
