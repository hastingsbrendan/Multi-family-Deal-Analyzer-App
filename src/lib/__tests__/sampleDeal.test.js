import { describe, test, expect } from 'vitest';
import { createSampleDeal, calcDeal } from '../calc.js';

// The sample deal is the first thing every new account sees (2026-11 review). It set
// $ amounts for maintenance/CapEx and "self-managed", but inherited "% of rent" modes,
// so the engine charged 5% / 5% / 8% instead and Year 1 went negative.
describe('sample deal', () => {
  const r = calcDeal(createSampleDeal());
  const y1 = r.years[0];

  test('uses its own expense amounts and charges no management fee', () => {
    expect(y1.expBreakdown.maintenance).toBeCloseTo(2200, 0);
    expect(y1.expBreakdown.capex).toBeCloseTo(2200, 0);
    expect(y1.expBreakdown.propertyMgmt).toBe(0);
  });

  test('Year 1 beats renting nearby, as the welcome copy promises', () => {
    expect(y1.incrementalCashFlow).toBeGreaterThan(0);
  });

  test('state is set up front, so opening Assumptions does not change the numbers', () => {
    expect(createSampleDeal().assumptions.state).toBe('IL');
  });
});

describe('calcDeal cash-to-close fields used by Summary and exports', () => {
  const r = calcDeal(createSampleDeal());

  test('returns down payment and closing-cost totals', () => {
    expect(r.downPayment).toBeCloseTo(34000, 0);
    expect(r.closingCostsTotal).toBeGreaterThan(0);
    // total cash = down payment + closing costs (incl. prepaid insurance) − credits + shortfall
    expect(r.totalCashBase).toBeCloseTo(r.downPayment + r.closingCostsTotal - r.concessions + r.loanShortfall, 2);
  });
});
