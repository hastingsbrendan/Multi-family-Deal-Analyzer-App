// ─── Calc-engine accuracy fixes (2026-06 audit) ──────────────────────────────
// TDD tests for the P0/P2 accuracy findings:
//   A. Zero-value inputs must not be coerced to defaults (0% down / VA loans)
//   B. PMI must flow into cash flow, CoC, and taxes (with 78%-LTV cancellation)
//   C. Value-add remodel cost must be counted ONCE in IRR / equity multiple
//   D. Exit taxes must use adjusted basis (§1250) and deduct selling costs
//   E. After-tax cash flow must include the state tax the app displays
//   F. Basic mode must respect §469 passive-loss limits (active participant)
//   G. IRR solver must never return NaN/absurd values
//   H. Sensitivity must perturb effective rent (listedRent fallback) and
//      never produce negative vacancy
//   I. Value-add draws all land in year 1 when completionYear is 1
//
// Fixture mirrors src/__tests__/calc.test.js baseDeal: deterministic numbers —
//   400k price, 25% down → 300k loan @ 6%/30yr → payment $1,798.65
//   2×$1800 rents → gross 43,200 · 5% vacancy → EGI 41,040
//   fixed expenses 12,120 → NOI 28,920 · yr1 CF ≈ 7,336
// sellingCostPct is 0 in the fixture so legacy expectations stay hand-checkable;
// selling-cost behavior is tested explicitly where relevant.

import { describe, test, expect, vi } from 'vitest';

vi.mock('@sentry/react', () => ({
  addBreadcrumb: vi.fn(),
  setUser: vi.fn(),
  captureException: vi.fn(),
}));

const { calcDeal, calcSensitivity, newDeal, DEFAULT_PREFS } = await import('../calc.js');

function accDeal(assumptionOverrides = {}) {
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
      sellingCostPct: 0,
      closingCosts: { title: 0, transferTax: 0, inspection: 0, attorney: 0, lenderFees: 0, discountPoints: 0, appraisal: 0, creditReport: 0 },
      insuranceUpfront: false,
      sellerConcessions: 0,
      pmi: 0,
      numUnits: 2,
      units: [
        { rent: 1800, listedRent: 0, rentcastRent: 0 },
        { rent: 1800, listedRent: 0, rentcastRent: 0 },
        { rent: 0, listedRent: 0, rentcastRent: 0 },
        { rent: 0, listedRent: 0, rentcastRent: 0 },
      ],
      vacancyRate: 5,
      expenseModes: {
        propertyTax: 'value', insurance: 'value', maintenance: 'value',
        capex: 'value', propertyMgmt: 'value', utilities: 'value', hoa: 'value',
      },
      expenses: {
        propertyTax: 6000, propertyTaxPct: 1.5,
        insurance: 1800, insurancePct: 0.5,
        maintenance: 2160, maintenancePct: 5,
        capex: 2160, capexPct: 5,
        propertyMgmt: 0, propertyMgmtPct: 0,
        utilities: 0, utilitiesPct: 0,
        hoa: 0, costSegFee: 0,
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

// Net present value helper — used to verify the IRR actually zeroes the series
const npv = (rate, cfs) => cfs.reduce((s, cf, t) => s + cf / Math.pow(1 + rate, t), 0);

// ─── A. Zero-value inputs (VA loans, 0% rates) ───────────────────────────────
describe('zero-value inputs are honored, not coerced to defaults', () => {
  test('0% down payment models a full-price loan (VA scenario)', () => {
    const r = calcDeal(accDeal({ downPaymentPct: 0 }));
    expect(r.loanAmt).toBeCloseTo(400000, 0);
    // No down payment, no closing costs → essentially zero cash in
    expect(r.totalCash).toBeCloseTo(0, 0);
  });

  test('blank/missing downPaymentPct still defaults to 25%', () => {
    const r = calcDeal(accDeal({ downPaymentPct: '' }));
    expect(r.loanAmt).toBeCloseTo(300000, 0);
  });

  test('0% interest rate gives straight-line principal payment', () => {
    const r = calcDeal(accDeal({ interestRate: 0 }));
    expect(r.monthlyPayment).toBeCloseTo(300000 / 360, 2);
    expect(r.years[0].interest).toBeCloseTo(0, 2);
  });

  test('blank interestRate still defaults to 7%', () => {
    const r = calcDeal(accDeal({ interestRate: '' }));
    // 30yr 7% on 300k = $1,995.91 (textbook value)
    expect(r.monthlyPayment).toBeCloseTo(1995.91, 1);
  });

  test('0% tax bracket produces zero tax effect', () => {
    const r = calcDeal(accDeal({ taxBracket: 0 }));
    expect(r.years[0].taxEffect).toBeCloseTo(0, 6);
  });

  test('IRR stays finite when totalCash is zero (0% down, no closing costs)', () => {
    const r = calcDeal(accDeal({ downPaymentPct: 0 }));
    expect(Number.isFinite(r.irr)).toBe(true);
  });
});

// ─── B. PMI flows into the numbers ────────────────────────────────────────────
describe('PMI is modeled in cash flow, CoC, and taxes', () => {
  const pmiDeal = (over = {}) => accDeal({ downPaymentPct: 10, pmi: 150, ...over });

  test('year-1 cash flow is reduced by annual PMI', () => {
    const withPmi = calcDeal(pmiDeal());
    const noPmi = calcDeal(pmiDeal({ pmi: 0 }));
    expect(withPmi.years[0].cashFlow).toBeCloseTo(noPmi.years[0].cashFlow - 150 * 12, 0);
  });

  test('PMI does NOT change NOI or DSCR (it is a financing cost)', () => {
    const withPmi = calcDeal(pmiDeal());
    const noPmi = calcDeal(pmiDeal({ pmi: 0 }));
    expect(withPmi.years[0].noi).toBeCloseTo(noPmi.years[0].noi, 2);
    expect(withPmi.years[0].dscr).toBeCloseTo(noPmi.years[0].dscr, 4);
  });

  test('CoC return includes the PMI cost', () => {
    const r = calcDeal(pmiDeal());
    const expected = (r.years[0].noi - r.annualDebtService - 150 * 12) / r.totalCash;
    expect(r.cocReturn).toBeCloseTo(expected, 4);
  });

  test('PMI is reported per-year and cancels once balance ≤ 78% of purchase price', () => {
    const r = calcDeal(pmiDeal({ holdPeriod: 30 }));
    expect(r.years[0].pmi).toBeCloseTo(1800, 0); // active in year 1 (90% LTV)
    expect(r.years[29].pmi).toBe(0);             // long gone by year 30
    // Cancellation year: first year whose STARTING balance ≤ 78% of price
    const firstFree = r.years.find(y => y.pmi === 0);
    expect(firstFree).toBeDefined();
    const prior = r.years[firstFree.yr - 2]; // year before cancellation
    expect(prior.balance).toBeLessThanOrEqual(400000 * 0.78);
  });

  test('rental-portion PMI is tax-deductible (reduces taxable income)', () => {
    const withPmi = calcDeal(pmiDeal());
    const noPmi = calcDeal(pmiDeal({ pmi: 0 }));
    expect(withPmi.years[0].taxableIncome).toBeCloseTo(noPmi.years[0].taxableIncome - 1800, 0);
  });
});

// ─── C. Value-add cost counted once ───────────────────────────────────────────
describe('value-add remodel cost is single-counted in IRR and equity multiple', () => {
  const vaDeal = (over = {}) => accDeal({
    holdPeriod: 5,
    valueAdd: { enabled: true, reModelCost: 40000, rentBumpPerUnit: 300, unitsRenovated: 2, completionYear: 2 },
    ...over,
  });

  test('IRR zeroes the NPV of [−baseCash, yearly CFs (draws in-year), +proceeds]', () => {
    const r = calcDeal(vaDeal());
    const series = [-r.totalCashBase, ...r.years.map(y => y.cashFlow)];
    series[r.holdYears] += r.netProceeds;
    expect(Math.abs(npv(r.irr, series))).toBeLessThan(5); // ≈ 0 within rounding
  });

  test('equity multiple = (ΣCF + draws paid back out + proceeds) / total invested', () => {
    const r = calcDeal(vaDeal());
    const sumCF = r.years.reduce((s, y) => s + y.cashFlow, 0);
    const drawsPaid = r.years.reduce((s, y) => s + (y.vaRemodelOutflow || 0), 0);
    const expected = (sumCF + drawsPaid + r.netProceeds) / r.totalCash;
    expect(r.equityMultiple).toBeCloseTo(expected, 4);
  });

  test('a zero-benefit renovation lowers IRR vs base — but only by the cost once', () => {
    // rentBump 0 → renovation burns $40k for zero benefit.
    const burn = calcDeal(vaDeal({ valueAdd: { enabled: true, reModelCost: 40000, rentBumpPerUnit: 0, unitsRenovated: 2, completionYear: 2 } }));
    const base = calcDeal(accDeal({ holdPeriod: 5 }));
    expect(burn.irr).toBeLessThan(base.irr);
    // Single-count check: NPV of the explicit series at the reported IRR ≈ 0
    const series = [-burn.totalCashBase, ...burn.years.map(y => y.cashFlow)];
    series[burn.holdYears] += burn.netProceeds;
    expect(Math.abs(npv(burn.irr, series))).toBeLessThan(5);
  });
});

// ─── D. Exit: adjusted basis, §1250 recapture, selling costs ─────────────────
describe('exit taxes use adjusted basis and selling costs', () => {
  test('zero appreciation still triggers depreciation recapture', () => {
    // 5 yrs of straight-line dep on 80% of 400k = 11,636.36/yr → 58,181.82 total.
    // Sale at purchase price: amount realized 400k − basis (400k − 58,181.82)
    // → gain = 58,181.82, all of it §1250 recapture taxed at 25%.
    const r = calcDeal(accDeal({ appreciationRate: 0, holdPeriod: 5 }));
    const dep = r.cumulativeDepreciationTaken;
    expect(dep).toBeCloseTo(58181.82, 0);
    expect(r.totalGainOnSale).toBeCloseTo(dep, 0);
    expect(r.sec1250RecapturePortion).toBeCloseTo(dep, 0);
    expect(r.recaptureTax).toBeCloseTo(dep * 0.25, 0);
    expect(r.netTaxOnSale).toBeCloseTo(dep * 0.25, 0);
  });

  test('selling costs reduce net proceeds and the taxable gain', () => {
    const r = calcDeal(accDeal({ appreciationRate: 3, holdPeriod: 5, sellingCostPct: 6 }));
    const exitValue = 400000 * 1.03 ** 5;
    expect(r.exitValue).toBeCloseTo(exitValue, 0);
    expect(r.sellingCosts).toBeCloseTo(exitValue * 0.06, 0);
    expect(r.netProceeds).toBeCloseTo(
      r.exitValue - r.sellingCosts - r.exitLoanBalance - r.netTaxOnSale, 0);
    // Gain measured on amount realized (after selling costs), not gross price
    const adjustedBasis = 400000 - r.cumulativeDepreciationTaken;
    expect(r.totalGainOnSale).toBeCloseTo((exitValue - exitValue * 0.06) - adjustedBasis, 0);
  });

  test('sellingCostPct defaults to 6% for new deals', () => {
    expect(DEFAULT_PREFS.sellingCostPct).toBe(6);
    expect(newDeal().assumptions.sellingCostPct).toBe(6);
  });

  test('capital improvements (remodel draws) increase basis and shrink the gain', () => {
    const base = calcDeal(accDeal({ appreciationRate: 3, holdPeriod: 5 }));
    const va = calcDeal(accDeal({
      appreciationRate: 3, holdPeriod: 5,
      valueAdd: { enabled: true, reModelCost: 40000, rentBumpPerUnit: 0, unitsRenovated: 2, completionYear: 2 },
    }));
    // Same exit value (no rent bump → no implied value lift); basis is 40k higher
    expect(va.exitValue).toBeCloseTo(base.exitValue, 0);
    expect(va.totalGainOnSale).toBeCloseTo(Math.max(0, base.totalGainOnSale - 40000), 0);
  });
});

// ─── E. After-tax cash flow includes state tax ────────────────────────────────
describe('after-tax cash flow deducts the state tax shown in the table', () => {
  test('CA deal: afterTaxCashFlow = pre-tax CF − federal − state', () => {
    // Higher rents → positive taxable income so CA state tax is actually owed
    const r = calcDeal(accDeal({
      state: 'CA',
      units: [
        { rent: 2200, listedRent: 0, rentcastRent: 0 },
        { rent: 2200, listedRent: 0, rentcastRent: 0 },
        { rent: 0, listedRent: 0, rentcastRent: 0 },
        { rent: 0, listedRent: 0, rentcastRent: 0 },
      ],
      tax: { ...accDeal().assumptions.tax, agi: 120000 },
    }));
    const y = r.years[0];
    expect(y.totalStateTax).toBeGreaterThan(0); // sanity: positive taxable income in CA
    const preTax = y.noi - y.debtService;
    expect(y.afterTaxCashFlow).toBeCloseTo(preTax - y.taxEffect - y.totalStateTax, 0);
  });

  test('no-tax state: after-tax CF unchanged by state field', () => {
    const tx = calcDeal(accDeal({ state: 'TX' }));
    const none = calcDeal(accDeal({ state: '' }));
    expect(tx.years[0].afterTaxCashFlow).toBeCloseTo(none.years[0].afterTaxCashFlow, 2);
  });
});

// ─── F. §469 passive-loss limits in basic mode ────────────────────────────────
describe('basic mode respects §469 passive activity loss limits', () => {
  // Big paper loss: high price + low rents → taxableIncome deeply negative
  const lossDeal = (agi) => accDeal({
    purchasePrice: 900000,
    units: [
      { rent: 1200, listedRent: 0, rentcastRent: 0 },
      { rent: 1200, listedRent: 0, rentcastRent: 0 },
      { rent: 0, listedRent: 0, rentcastRent: 0 },
      { rent: 0, listedRent: 0, rentcastRent: 0 },
    ],
    tax: { ...accDeal().assumptions.tax, agi },
  });

  test('AGI ≥ $150k: paper losses give NO current-year tax benefit', () => {
    const r = calcDeal(lossDeal(200000));
    expect(r.years[0].taxableIncome).toBeLessThan(0); // sanity: it is a paper loss
    expect(r.years[0].taxEffect).toBe(0);             // benefit suspended, not granted
    expect(r.finalPalCarryforward).toBeGreaterThan(0); // suspended losses accumulate
  });

  test('AGI $100k: up to $25k of losses still deductible (allowance preserved)', () => {
    const r = calcDeal(lossDeal(100000));
    const y = r.years[0];
    expect(y.taxableIncome).toBeLessThan(0);
    if (-y.taxableIncome <= 25000) {
      expect(y.taxEffect).toBeLessThan(0); // full benefit
    } else {
      // benefit capped at the $25k allowance
      expect(y.taxEffect).toBeCloseTo(-25000 * 0.22, 0);
    }
  });

  test('small losses under the allowance keep their full benefit (no behavior change)', () => {
    // Default fixture has a small paper loss (≈ −$600), well under the $25k
    // allowance at AGI 100k — the tax benefit must be preserved, nothing suspended
    const r = calcDeal(accDeal());
    expect(r.years[0].taxableIncome).toBeLessThan(0);
    expect(r.years[0].taxEffect).toBeLessThan(0); // negative = tax savings
    expect(r.finalPalCarryforward).toBe(0);
  });
});

// ─── G. IRR guardrails ────────────────────────────────────────────────────────
describe('IRR solver guardrails', () => {
  test('IRR is finite and within [−99%, 1000%] for an extreme money-losing deal', () => {
    const r = calcDeal(accDeal({
      purchasePrice: 2000000,
      units: [
        { rent: 500, listedRent: 0, rentcastRent: 0 },
        { rent: 500, listedRent: 0, rentcastRent: 0 },
        { rent: 0, listedRent: 0, rentcastRent: 0 },
        { rent: 0, listedRent: 0, rentcastRent: 0 },
      ],
      holdPeriod: 30,
    }));
    expect(Number.isFinite(r.irr)).toBe(true);
    expect(r.irr).toBeGreaterThanOrEqual(-0.99);
    expect(r.irr).toBeLessThanOrEqual(10);
  });

  test('IRR is finite with refi cash-out (multiple sign changes)', () => {
    const r = calcDeal(accDeal({
      appreciationRate: 5, holdPeriod: 10,
      refi: { enabled: true, year: 3, newRate: 5.5, newLTV: 80 },
    }));
    expect(Number.isFinite(r.irr)).toBe(true);
  });
});

// ─── H. Sensitivity fixes ─────────────────────────────────────────────────────
describe('calcSensitivity edge cases', () => {
  test('rent sensitivity works for units priced via listedRent fallback', () => {
    const deal = accDeal({
      units: [
        { rent: 0, listedRent: 1800, rentcastRent: 0 },
        { rent: 0, listedRent: 1800, rentcastRent: 0 },
        { rent: 0, listedRent: 0, rentcastRent: 0 },
        { rent: 0, listedRent: 0, rentcastRent: 0 },
      ],
    });
    const rentSens = calcSensitivity(deal).find(s => s.label === 'Rent');
    expect(rentSens.irrHighDelta).toBeGreaterThan(0);
    expect(rentSens.irrLowDelta).toBeLessThan(0);
  });

  test('vacancy sensitivity clamps at 0% (no negative vacancy)', () => {
    const deal = accDeal({ vacancyRate: 2 }); // −5pp would be −3%
    const vacSens = calcSensitivity(deal).find(s => s.label === 'Vacancy');
    const atZeroVac = calcDeal(accDeal({ vacancyRate: 0 }));
    expect(vacSens.irrLowAbs).toBeCloseTo(atZeroVac.irr, 6);
  });
});

// ─── I. Value-add draws when completionYear = 1 ──────────────────────────────
describe('value-add draw timing', () => {
  test('completionYear 1 puts the full remodel cost in year 1', () => {
    const r = calcDeal(accDeal({
      valueAdd: { enabled: true, reModelCost: 40000, rentBumpPerUnit: 200, unitsRenovated: 2, completionYear: 1 },
    }));
    expect(r.years[0].vaRemodelOutflow).toBeCloseTo(40000, 0);
    expect(r.years[1].vaRemodelOutflow).toBe(0);
  });

  test('completionYear ≥ 2 keeps the 50/50 split (existing behavior)', () => {
    const r = calcDeal(accDeal({
      valueAdd: { enabled: true, reModelCost: 40000, rentBumpPerUnit: 200, unitsRenovated: 2, completionYear: 3 },
    }));
    expect(r.years[0].vaRemodelOutflow).toBeCloseTo(20000, 0);
    expect(r.years[1].vaRemodelOutflow).toBeCloseTo(20000, 0);
  });
});
