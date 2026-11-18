import { describe, test, expect } from 'vitest';
import { createSampleDeal, newDeal, calcDeal } from '../calc.js';

// M1 (2026-11 review): cap rate, expense ratio and the lender's DSCR describe the
// building with every unit rented at market rent. The owner's view (their unit
// earning nothing) is kept separately for the house-hack panel.

const investorDuplex = () => {
  const d = newDeal();
  const a = d.assumptions;
  Object.assign(a, { purchasePrice: 400000, downPaymentPct: 25, interestRate: 7, amortYears: 30, numUnits: 2,
    vacancyRate: 5, ownerOccupied: false, selfManage: false, rentGrowth: 3, expenseGrowth: 3, holdPeriod: 10 });
  a.units[0].rent = 2000; a.units[1].rent = 2000;
  a.expenses = { ...a.expenses, propertyTax: 6000, insurance: 2000, maintenancePct: 5, capexPct: 5, propertyMgmtPct: 8, utilities: 0, hoa: 0 };
  a.expenseModes = { ...a.expenseModes, maintenance: 'pct', capex: 'pct', propertyMgmt: 'pct', utilities: 'value' };
  return d;
};

describe('property-level metrics', () => {
  test('sample house hack: cap rate is the building\'s, not the owner-reduced one', () => {
    const r = calcDeal(createSampleDeal());
    // 2 × $1,550 × 12 = $37,200 gross; 5% vacancy; $11,800 opex (self-managed)
    const noiMarket = 37200 * 0.95 - 11800;
    expect(r.noiMarket).toBeCloseTo(noiMarket, 0);
    expect(r.capRate).toBeCloseTo(noiMarket / 340000, 4);
    expect(r.capRateOwner).toBeLessThan(r.capRate);
    expect(r.expenseRatio).toBeCloseTo(11800 / (37200 * 0.95), 4);
    expect(r.dscrLenderView).toBeCloseTo(noiMarket / r.years[0].debtService, 4);
  });

  test('investor deal: property and owner views are the same', () => {
    const r = calcDeal(investorDuplex());
    expect(r.capRate).toBeCloseTo(r.capRateOwner, 10);
    expect(r.noiMarket).toBeCloseTo(r.noi, 6);
    expect(r.dscrLenderView).toBeCloseTo(r.dscr, 10);
  });
});

describe('property management on collected rent', () => {
  test('investor deal: 8% of rent after vacancy, growing with rent', () => {
    const r = calcDeal(investorDuplex());
    expect(r.years[0].expBreakdown.propertyMgmt).toBeCloseTo(48000 * 0.95 * 0.08, 2);
    expect(r.years[1].expBreakdown.propertyMgmt).toBeCloseTo(r.years[1].egi * 0.08, 2);
  });

  test('house hack: no fee on the owner\'s own unit while they live there', () => {
    const d = investorDuplex();
    Object.assign(d.assumptions, { ownerOccupied: true, ownerUnit: 0, ownerOccupancyYears: 2, alternativeRent: 1800 });
    const r = calcDeal(d);
    expect(r.years[0].expBreakdown.propertyMgmt).toBeCloseTo(2000 * 12 * 0.95 * 0.08, 2); // one tenant unit
    expect(r.years[2].expBreakdown.propertyMgmt).toBeCloseTo(r.years[2].egi * 0.08, 2);   // both units after move-out
  });

  test('a $ management amount still grows with expense growth', () => {
    const d = investorDuplex();
    d.assumptions.expenseModes.propertyMgmt = 'value';
    d.assumptions.expenses.propertyMgmt = 3000;
    const r = calcDeal(d);
    expect(r.years[0].expBreakdown.propertyMgmt).toBeCloseTo(3000, 2);
    expect(r.years[1].expBreakdown.propertyMgmt).toBeCloseTo(3090, 2);
  });
});

// M2: IRR on one consistent basis. It mixed pre-tax yearly cash flow with after-tax
// sale proceeds, which understated returns.
describe('IRR bases', () => {
  const npv = (r, cfs) => cfs.reduce((s, c, t) => s + c / Math.pow(1 + r, t), 0);

  test('pre-tax IRR zeroes NPV of yearly cash flow + sale proceeds before tax', () => {
    const r = calcDeal(investorDuplex());
    const cfs = [-r.totalCashBase, ...r.years.map(y => y.cashFlow)];
    cfs[r.holdYears] += r.exitValue - r.sellingCosts - r.exitLoanBalance;
    expect(Math.abs(npv(r.irrPreTax, cfs))).toBeLessThan(1);
  });

  test('after-tax (headline) IRR zeroes NPV of after-tax cash flow + net proceeds', () => {
    const r = calcDeal(investorDuplex());
    const cfs = [-r.totalCashBase, ...r.years.map(y => y.afterTaxCashFlow)];
    cfs[r.holdYears] += r.netProceeds;
    expect(Math.abs(npv(r.irr, cfs))).toBeLessThan(1);
    expect(r.irr).toBeLessThan(r.irrPreTax); // a profitable deal pays some tax
  });

  test('house hack: counting the rent you no longer pay raises IRR; investors get the same number', () => {
    const hh = calcDeal(createSampleDeal());
    expect(hh.irrWithHousingSavings).toBeGreaterThan(hh.irr);
    const inv = calcDeal(investorDuplex());
    expect(inv.irrWithHousingSavings).toBe(inv.irr);
  });
});
