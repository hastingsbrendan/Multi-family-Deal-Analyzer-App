import { describe, test, expect } from 'vitest';
import {
  FEDERAL_TAX_YEAR, STANDARD_DEDUCTION, ordinaryTax, marginalRate, taxableBase, federalTaxOnIncome, federalTaxOnSale,
} from '../federalTaxEngine.js';
import { STATE_TAX_YEAR } from '../taxEngine.js';

// Hand-worked examples on the 2026 tables (IRS Rev. Proc. 2025-32).

describe('ordinaryTax — 2026 brackets', () => {
  test('single, $50,000 taxable', () => {
    // 12,400 × 10% + (50,000 − 12,400) × 12% = 1,240 + 4,512
    expect(ordinaryTax(50000, 'single')).toBeCloseTo(5752, 2);
  });

  test('married filing jointly, $250,000 taxable', () => {
    // 24,800×10% + 76,000×12% + 110,600×22% + 38,600×24%
    // = 2,480 + 9,120 + 24,332 + 9,264
    expect(ordinaryTax(250000, 'married')).toBeCloseTo(45196, 2);
  });

  test('zero or negative taxable income owes nothing', () => {
    expect(ordinaryTax(0)).toBe(0);
    expect(ordinaryTax(-5000)).toBe(0);
  });

  test('top bracket is 37%', () => {
    expect(marginalRate(1000000, 'single')).toBe(0.37);
    expect(marginalRate(0, 'single')).toBe(0.10);
  });
});

describe('standard deduction', () => {
  test('2026 amounts', () => {
    expect(STANDARD_DEDUCTION.single).toBe(16100);
    expect(STANDARD_DEDUCTION.married).toBe(32200);
  });

  test('taxable base is other income minus the standard deduction, never negative', () => {
    expect(taxableBase(100000, 'single')).toBe(83900);
    expect(taxableBase(100000, 'married')).toBe(67800);
    expect(taxableBase(10000, 'single')).toBe(0);
  });
});

describe('federalTaxOnIncome — rental income stacked on other income', () => {
  test('stays within one bracket', () => {
    // base 83,900 → 103,900, all in the 22% band (50,400–105,700): 20,000 × 22%
    const r = federalTaxOnIncome({ otherIncome: 100000, netIncome: 20000, filingStatus: 'single' });
    expect(r.tax).toBeCloseTo(4400, 2);
    expect(r.marginalRate).toBe(0.22);
  });

  test('crosses into the next bracket', () => {
    // base 83,900 → 113,900: 21,800 × 22% + 8,200 × 24% = 4,796 + 1,968
    const r = federalTaxOnIncome({ otherIncome: 100000, netIncome: 30000, filingStatus: 'single' });
    expect(r.tax).toBeCloseTo(6764, 2);
    expect(r.marginalRate).toBe(0.24);
  });

  test('an allowed loss saves tax at the rates it comes out of', () => {
    // base 43,900 → 33,900, all in the 12% band: −10,000 × 12%
    const r = federalTaxOnIncome({ otherIncome: 60000, netIncome: -10000, filingStatus: 'single' });
    expect(r.tax).toBeCloseTo(-1200, 2);
  });

  test('a loss cannot save more tax than the other income owes', () => {
    // base 3,900 → 0: only 3,900 × 10% of tax exists to save
    const r = federalTaxOnIncome({ otherIncome: 20000, netIncome: -10000, filingStatus: 'single' });
    expect(r.tax).toBeCloseTo(-390, 2);
  });

  test('rental income first uses up any unused standard deduction', () => {
    // No other income: 12,000 of rental profit − 16,100 deduction → nothing taxable
    expect(federalTaxOnIncome({ otherIncome: 0, netIncome: 12000, filingStatus: 'single' }).tax).toBeCloseTo(0, 2);
    // 10,000 other income leaves 6,100 of deduction: (10,000 + 12,000 − 16,100) × 10%
    expect(federalTaxOnIncome({ otherIncome: 10000, netIncome: 12000, filingStatus: 'single' }).tax).toBeCloseTo(590, 2);
  });

  test('married brackets are wider', () => {
    const single = federalTaxOnIncome({ otherIncome: 150000, netIncome: 30000, filingStatus: 'single' }).tax;
    const married = federalTaxOnIncome({ otherIncome: 150000, netIncome: 30000, filingStatus: 'married' }).tax;
    expect(married).toBeLessThan(single);
  });
});

// ─── Phase 2: tax on a sale ──────────────────────────────────────────────────
describe('federalTaxOnSale — gain stacked in IRS order', () => {
  test('straight-line recapture + long-term gain + NIIT', () => {
    // Other income 100k single → base 83,900.
    // §1250 gain 50k: 83,900→105,700 @22% = 4,796; 105,700→133,900 @24% = 6,768 → 11,564
    // Long-term gain 200k on 133,900→333,900: all inside the 15% band (49,450–545,500) → 30,000
    // NIIT: MAGI 350k − 200k = 150k (< 250k of gain) × 3.8% = 5,700
    const r = federalTaxOnSale({ otherIncome: 100000, filingStatus: 'single', sec1250Gain: 50000, capitalGain: 200000 });
    expect(r.tax1250).toBeCloseTo(11564, 2);
    expect(r.taxLtcg).toBeCloseTo(30000, 2);
    expect(r.niit).toBeCloseTo(5700, 2);
    expect(r.total).toBeCloseTo(47264, 2);
  });

  test('straight-line recapture is capped at 25% per dollar', () => {
    // Base 283,900 sits in the 35% bracket; 20k of §1250 gain at min(35%, 25%) = 5,000
    const r = federalTaxOnSale({ otherIncome: 300000, filingStatus: 'single', sec1250Gain: 20000 });
    expect(r.tax1250).toBeCloseTo(5000, 2);
  });

  test('the cap applies per dollar, not to the total', () => {
    // Base 190,000 − 16,100 = 173,900. 100k of §1250 gain runs 173,900→273,900:
    //   173,900→201,775 @24% = 6,690; 201,775→256,225 @min(32%,25%) = 13,612.50;
    //   256,225→273,900 @min(35%,25%) = 4,418.75 → 24,721.25
    const r = federalTaxOnSale({ otherIncome: 190000, filingStatus: 'single', sec1250Gain: 100000 });
    expect(r.tax1250).toBeCloseTo(24721.25, 2);
  });

  test('cost-seg (§1245) recapture is ordinary income with no cap', () => {
    // Base 283,900 in the 35% bracket: 20k × 35%
    const r = federalTaxOnSale({ otherIncome: 300000, filingStatus: 'single', sec1245Gain: 20000 });
    expect(r.tax1245).toBeCloseTo(7000, 2);
  });

  test('long-term gain inside the 0% band is untaxed', () => {
    // Other 20k → base 3,900; 20k gain reaches 23,900 < 49,450
    const r = federalTaxOnSale({ otherIncome: 20000, filingStatus: 'single', capitalGain: 20000 });
    expect(r.taxLtcg).toBe(0);
    expect(r.niit).toBe(0);
  });

  test('long-term gain crossing into the 20% band (married)', () => {
    // Other 600k → base 567,800. 100k gain to 667,800:
    //   567,800→613,700 @15% = 6,885; 613,700→667,800 @20% = 10,820
    const r = federalTaxOnSale({ otherIncome: 600000, filingStatus: 'married', capitalGain: 100000 });
    expect(r.taxLtcg).toBeCloseTo(17705, 2);
  });

  test('real-estate professionals are exempt from NIIT on rental property', () => {
    const r = federalTaxOnSale({ otherIncome: 400000, filingStatus: 'single', capitalGain: 200000, niitApplies: false });
    expect(r.niit).toBe(0);
  });

  test('flat-rate override: recapture at the flat rate (25% cap for straight-line)', () => {
    const r = federalTaxOnSale({ otherIncome: 100000, sec1245Gain: 10000, sec1250Gain: 10000, flatOrdinaryRate: 0.32 });
    expect(r.tax1245).toBeCloseTo(3200, 2);
    expect(r.tax1250).toBeCloseTo(2500, 2);
  });
});

// Tax tables are dated. These fail once the calendar passes the year the data is
// for, as a reminder to update federalTaxEngine.js (IRS publishes each fall) and
// taxEngine.js (Tax Foundation state brackets, published each February).
describe('tax data is current', () => {
  const year = new Date().getFullYear();
  test(`federal tables are for ${FEDERAL_TAX_YEAR}`, () => {
    expect(year, `federalTaxEngine.js has ${FEDERAL_TAX_YEAR} tables — update for ${year}`).toBeLessThanOrEqual(FEDERAL_TAX_YEAR);
  });
  test(`state tables are for ${STATE_TAX_YEAR}`, () => {
    expect(year, `taxEngine.js has ${STATE_TAX_YEAR} state brackets — update for ${year}`).toBeLessThanOrEqual(STATE_TAX_YEAR);
  });
});
