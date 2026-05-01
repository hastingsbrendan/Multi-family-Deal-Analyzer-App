import { describe, test, expect } from 'vitest';
import {
  calcStateTax,
  STATE_TAX_DATA,
  FILING_STATUSES,
  getStateOptions,
  getTopMarginalRate,
} from '../taxEngine.js';

// ─── No-tax states ──────────────────────────────────────────────────────────

describe('calcStateTax — no-tax states', () => {
  test.each(['AK', 'FL', 'NV', 'NH', 'SD', 'TN', 'TX', 'WA', 'WY'])(
    '%s returns noTaxState:true and totalTax:0',
    (state) => {
      const r = calcStateTax({ state, magi: 100000, netRentalIncome: 50000 });
      expect(r.noTaxState).toBe(true);
      expect(r.totalTax).toBe(0);
      expect(r.stateTax).toBe(0);
      expect(r.effectiveRate).toBe(0);
    }
  );
});

// ─── Flat-rate states ───────────────────────────────────────────────────────

describe('calcStateTax — flat-rate states', () => {
  test('CO 4.4% — $50k rental income = $2,200', () => {
    const r = calcStateTax({ state: 'CO', magi: 100000, netRentalIncome: 50000 });
    expect(r.stateTax).toBeCloseTo(2200, 0);
    expect(r.noTaxState).toBe(false);
  });

  test('IL 4.95% — $30k rental income = $1,485', () => {
    const r = calcStateTax({ state: 'IL', magi: 80000, netRentalIncome: 30000 });
    expect(r.stateTax).toBeCloseTo(1485, 0);
  });

  test('AZ 2.5% — $20k rental income = $500', () => {
    const r = calcStateTax({ state: 'AZ', magi: 60000, netRentalIncome: 20000 });
    expect(r.stateTax).toBeCloseTo(500, 0);
  });
});

// ─── Progressive states — stacking method ───────────────────────────────────

describe('calcStateTax — progressive (stacking method)', () => {
  test('CA single: $120k MAGI + $18k rental → $1,674 (entirely in 9.3% bracket)', () => {
    // $120k–$138k both fall in the 70606–360659 bracket at 9.3%
    // stacking tax = 18000 × 0.093 = 1674
    const r = calcStateTax({
      state: 'CA', magi: 120000, netRentalIncome: 18000, filingStatus: 'single',
    });
    expect(r.stateTax).toBeCloseTo(1674, 0);
    expect(r.marginalRate).toBe(0.093);
  });

  test('AL progressive: $5k rental on $0 MAGI crosses all 3 brackets', () => {
    // AL single: 0-500 @2%, 500-3000 @4%, 3000+ @5%
    // tax(5000) = 500*0.02 + 2500*0.04 + 2000*0.05 = 10 + 100 + 100 = 210
    // tax(0) = 0 → stacking = 210
    const r = calcStateTax({
      state: 'AL', magi: 0, netRentalIncome: 5000, filingStatus: 'single',
    });
    expect(r.stateTax).toBeCloseTo(210, 0);
    expect(r.marginalRate).toBe(0.05);
  });
});

// ─── Filing status ──────────────────────────────────────────────────────────

describe('calcStateTax — filing status', () => {
  test('AZ married brackets double (married: null) — same result as single for flat', () => {
    const single = calcStateTax({ state: 'AZ', magi: 50000, netRentalIncome: 20000, filingStatus: 'single' });
    const married = calcStateTax({ state: 'AZ', magi: 50000, netRentalIncome: 20000, filingStatus: 'married' });
    // AZ is flat rate — doubling brackets doesn't change result
    expect(single.stateTax).toBeCloseTo(married.stateTax, 2);
  });

  test('CA married vs single — married pays less due to wider brackets', () => {
    // At $50k MAGI + $30k rental, the progressive brackets differ
    const single = calcStateTax({ state: 'CA', magi: 50000, netRentalIncome: 30000, filingStatus: 'single' });
    const married = calcStateTax({ state: 'CA', magi: 50000, netRentalIncome: 30000, filingStatus: 'married' });
    expect(married.stateTax).toBeLessThan(single.stateTax);
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────────────

describe('calcStateTax — edge cases', () => {
  test('negative netRentalIncome → totalTax: 0', () => {
    const r = calcStateTax({ state: 'CA', magi: 100000, netRentalIncome: -5000 });
    expect(r.totalTax).toBe(0);
    expect(r.effectiveRate).toBe(0);
  });

  test('zero MAGI → rental income starts at bracket 0', () => {
    const r = calcStateTax({ state: 'CA', magi: 0, netRentalIncome: 10000, filingStatus: 'single' });
    // First 10000 at 1% (bracket 0–10756)
    expect(r.stateTax).toBeCloseTo(100, 0);
    expect(r.marginalRate).toBe(0.01);
  });

  test('unknown state code → noTaxState: true', () => {
    const r = calcStateTax({ state: 'ZZ', magi: 100000, netRentalIncome: 50000 });
    expect(r.noTaxState).toBe(true);
    expect(r.totalTax).toBe(0);
  });

  test('null state → noTaxState: true', () => {
    const r = calcStateTax({ state: null, magi: 100000, netRentalIncome: 50000 });
    expect(r.noTaxState).toBe(true);
  });

  test('empty string state → noTaxState: true', () => {
    const r = calcStateTax({ state: '', magi: 100000, netRentalIncome: 50000 });
    expect(r.noTaxState).toBe(true);
  });
});

// ─── Local tax ──────────────────────────────────────────────────────────────

describe('calcStateTax — local tax', () => {
  test('localTaxRate=0.03 adds 3% of rental income', () => {
    const r = calcStateTax({ state: 'CA', magi: 100000, netRentalIncome: 20000, localTaxRate: 0.03 });
    expect(r.localTax).toBeCloseTo(600, 0);
    expect(r.totalTax).toBeCloseTo(r.stateTax + 600, 0);
  });

  test('localTaxRate=0 → localTax: 0', () => {
    const r = calcStateTax({ state: 'CA', magi: 100000, netRentalIncome: 20000, localTaxRate: 0 });
    expect(r.localTax).toBe(0);
  });
});

// ─── getStateOptions ────────────────────────────────────────────────────────

describe('getStateOptions', () => {
  const options = getStateOptions();

  test('returns 51 entries (50 states + DC)', () => {
    expect(options.length).toBe(51);
  });

  test('entries are sorted alphabetically by name', () => {
    for (let i = 1; i < options.length; i++) {
      expect(options[i].name.localeCompare(options[i - 1].name)).toBeGreaterThanOrEqual(0);
    }
  });

  test('each entry has { code, name }', () => {
    for (const opt of options) {
      expect(typeof opt.code).toBe('string');
      expect(opt.code).toMatch(/^[A-Z]{2}$/);
      expect(typeof opt.name).toBe('string');
      expect(opt.name.length).toBeGreaterThan(0);
    }
  });
});

// ─── getTopMarginalRate ─────────────────────────────────────────────────────

describe('getTopMarginalRate', () => {
  test('CA single → 0.133', () => {
    expect(getTopMarginalRate('CA')).toBe(0.133);
  });

  test('FL → 0 (no-tax state)', () => {
    expect(getTopMarginalRate('FL')).toBe(0);
  });

  test('IL → 0.0495 (flat)', () => {
    expect(getTopMarginalRate('IL')).toBe(0.0495);
  });

  test('unknown state → 0', () => {
    expect(getTopMarginalRate('ZZ')).toBe(0);
  });
});

// ─── STATE_TAX_DATA bracket integrity ───────────────────────────────────────

describe('STATE_TAX_DATA — bracket integrity', () => {
  const entries = Object.entries(STATE_TAX_DATA);

  test('all state codes are 2-letter uppercase', () => {
    for (const [code] of entries) {
      expect(code).toMatch(/^[A-Z]{2}$/);
    }
  });

  test('every state with brackets has valid rate/min/max and sorted ascending', () => {
    for (const [code, data] of entries) {
      if (data.type === 'none') continue;
      for (const brackets of [data.single, data.married].filter(Boolean)) {
        for (let i = 0; i < brackets.length; i++) {
          const b = brackets[i];
          expect(b.rate).toBeGreaterThanOrEqual(0);
          expect(b.min).toBeLessThan(b.max);
          if (i > 0) {
            expect(b.min).toBeGreaterThanOrEqual(brackets[i - 1].min);
          }
        }
      }
    }
  });
});
