// ─── BACK-113: engine invariants across generated deals ──────────────────────
// Fixed-example tests missed every bug in the 2026-09 review because each one was
// an interaction between features (loan limit × cash, concessions × loan,
// amortization × hold, cost seg × state tax). These tests generate a few hundred
// varied deals from a fixed seed and check rules that must hold for EVERY deal.
//
// A failure prints the seed and deal index. To replay one deal:
//   const deal = generateDeals(SEED, N)[index];
// Change SEED locally to explore more of the space.

import { describe, test, expect, vi } from 'vitest';

vi.mock('@sentry/react', () => ({ addBreadcrumb: vi.fn(), captureException: vi.fn(), captureMessage: vi.fn() }));

const { calcDeal, newDeal } = await import('../calc.js');

const SEED = 20260930;
const N = 500;

// mulberry32 — small, fast, deterministic PRNG
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateDeals(seed, count) {
  const r = rng(seed);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const between = (lo, hi) => lo + r() * (hi - lo);
  const chance = (p) => r() < p;
  const deals = [];

  for (let i = 0; i < count; i++) {
    const d = newDeal();
    const a = d.assumptions;
    const numUnits = pick([2, 3, 4]);
    const price = Math.round(between(100000, 2000000) / 1000) * 1000;
    const holdPeriod = pick([1, 2, 3, 5, 7, 10, 15, 20, 25, 30]);

    Object.assign(a, {
      purchasePrice: price,
      downPaymentPct: pick([0, 3.5, 5, 10, 20, 25, 35]),
      interestRate: pick([0, 3, 5.5, 6.5, 7.25, 9]),
      amortYears: pick([15, 20, 30]),
      holdPeriod,
      numUnits,
      vacancyRate: pick([0, 3, 5, 8, 15]),
      rentGrowth: pick([-2, 0, 2, 3, 5]),
      expenseGrowth: pick([0, 2, 3, 4]),
      appreciationRate: pick([-5, -1, 0, 2, 3, 5, 8]),
      taxBracket: pick([0, 10, 12, 22, 24, 32, 37]),
      sellingCostPct: pick([0, 5, 6, 8]),
      pmi: chance(0.3) ? pick([50, 120, 250]) : 0,
      sellerConcessions: chance(0.3) ? pick([2000, 8000, 15000, 40000]) : 0,
      loanLimit: chance(0.2) ? Math.round(price * between(0.4, 1.1)) : 0,
      insuranceUpfront: chance(0.5),
      state: pick(['', 'CA', 'NY', 'TX', 'IL', 'FL', 'PA', 'OH']),
      filingStatus: pick(['single', 'married']),
      ownerOccupied: chance(0.5),
      ownerUnit: Math.floor(r() * numUnits),
      ownerOccupancyYears: pick([1, 2, 3, 5]),
      alternativeRent: pick([0, 1500, 2500]),
      ownerUseUtilities: pick([0, 1200]),
      selfManage: chance(0.4),
    });
    a.units = a.units.map((u, k) => ({ ...u, rent: k < numUnits ? Math.round(between(400, 5000)) : 0 }));
    a.closingCosts = { ...a.closingCosts, title: pick([0, 1500, 4000]), lenderFees: pick([0, 2000, 6000]) };
    a.expenses = {
      ...a.expenses,
      propertyTax: Math.round(price * between(0.004, 0.025)),
      insurance: Math.round(price * between(0.002, 0.008)),
      maintenance: pick([0, 1500, 4000]), maintenancePct: pick([0, 5, 8]),
      capex: pick([0, 1500, 4000]), capexPct: pick([0, 5, 8]),
      propertyMgmt: pick([0, 3000]), propertyMgmtPct: pick([0, 8, 10]),
      utilities: pick([0, 1200, 3600]), hoa: pick([0, 0, 1200]),
    };
    a.expenseModes = {
      ...a.expenseModes,
      // a legacy "pct" mode on property tax / insurance must be ignored by the engine
      propertyTax: pick(['value', 'pct']), insurance: pick(['value', 'pct']),
      maintenance: pick(['value', 'pct']), capex: pick(['value', 'pct']), propertyMgmt: pick(['value', 'pct']),
    };
    a.refi = {
      enabled: holdPeriod > 1 && chance(0.3),
      year: 1 + Math.floor(r() * Math.max(1, holdPeriod - 1)),
      newRate: pick([0, 4.5, 6, 8]),
      newLTV: pick([50, 70, 75, 80, 90]),
    };
    a.valueAdd = {
      enabled: chance(0.25),
      reModelCost: pick([10000, 40000, 120000]),
      rentBumpPerUnit: pick([100, 250, 500]),
      unitsRenovated: pick([1, 2, 4]),
      completionYear: pick([1, 2, 3, 5]),
    };
    a.tax = {
      ...a.tax,
      enabled: chance(0.35),
      landValuePct: pick([10, 20, 35]),
      costSegEnabled: chance(0.5),
      costSeg5YrPct: pick([10, 15, 25]),
      costSeg15YrPct: pick([5, 10, 15]),
      bonusDepPct: pick([0, 40, 100]),
      sec179Amount: pick([0, 0, 25000]),
      paStatus: pick(['active_participant', 're_professional', 'passive']),
      agi: pick([50000, 120000, 140000, 250000, 600000]),
    };
    deals.push(d);
  }
  return deals;
}

// ── Run each deal once and share results across the invariants ────────────────
const deals = generateDeals(SEED, N);
const inputsBefore = deals.map(d => JSON.stringify(d));
const results = deals.map(d => calcDeal(d));

const closingTotal = (a) =>
  Object.values(a.closingCosts).reduce((s, v) => s + (+v || 0), 0) + (a.insuranceUpfront ? (+a.expenses.insurance || 0) : 0);
const npv = (rate, cfs) => cfs.reduce((s, cf, t) => s + cf / Math.pow(1 + rate, t), 0);
const near = (x, y, tol = 1e-6) => Math.abs(x - y) <= tol * Math.max(1, Math.abs(x), Math.abs(y));

// Collect every violation, then assert once with a readable, replayable message
function check(name, fn) {
  test(name, () => {
    const failures = [];
    results.forEach((r, i) => {
      const problem = fn(r, deals[i].assumptions, i);
      if (problem) failures.push(`deal #${i}: ${problem}`);
    });
    expect(failures, `seed ${SEED} — ${failures.length}/${N} deals fail:\n  ${failures.slice(0, 5).join('\n  ')}`).toEqual([]);
  });
}

describe(`engine invariants (seed ${SEED}, ${N} deals)`, () => {
  check('every numeric output is finite (no NaN / Infinity)', (r) => {
    for (const [k, v] of Object.entries(r)) {
      if (typeof v === 'number' && !Number.isFinite(v)) return `${k} = ${v}`;
    }
    for (const y of r.years) {
      for (const [k, v] of Object.entries(y)) {
        if (typeof v === 'number' && !Number.isFinite(v)) return `yr${y.yr}.${k} = ${v}`;
      }
    }
    return null;
  });

  check('calcDeal does not modify the deal it is given', (r, a, i) =>
    JSON.stringify(deals[i]) === inputsBefore[i] ? null : 'input changed');

  check('sources equal uses: loan + cash + seller credit = price + closing costs', (r, a) => {
    const credit = Math.min(Math.max(0, +a.sellerConcessions || 0), closingTotal(a));
    const lhs = r.loanAmt + r.totalCashBase + credit;
    const rhs = a.purchasePrice + closingTotal(a);
    return near(lhs, rhs) ? null : `sources ${lhs.toFixed(2)} vs uses ${rhs.toFixed(2)}`;
  });

  check('a loan limit is never exceeded', (r, a) =>
    a.loanLimit > 0 && r.loanAmt > a.loanLimit + 0.01 ? `loan ${r.loanAmt} > limit ${a.loanLimit}` : null);

  check('loan balance is never negative and never grows except at a refi', (r) => {
    let prev = r.loanAmt;
    for (const y of r.years) {
      if (y.balance < -0.01) return `yr${y.yr} balance ${y.balance.toFixed(2)}`;
      if (!y.refiEvent && y.balance > prev + 0.01) return `yr${y.yr} balance grew ${prev.toFixed(0)} → ${y.balance.toFixed(0)}`;
      prev = y.balance;
    }
    return null;
  });

  check('once the loan is paid off there is no interest or debt service (until a refi)', (r) => {
    let paidOff = false;
    for (const y of r.years) {
      if (y.refiEvent) paidOff = false; // a cash-out refi on a paid-off property starts a new loan
      if (paidOff && (Math.abs(y.interest) > 0.01 || y.debtService > 0.01)) {
        return `yr${y.yr} after payoff: interest ${y.interest.toFixed(2)}, debt service ${y.debtService.toFixed(2)}`;
      }
      if (y.balance <= 0.01) paidOff = true;
    }
    return null;
  });

  check('interest and principal are never negative', (r) => {
    const bad = r.years.find(y => y.interest < -0.01 || y.principal < -0.01);
    return bad ? `yr${bad.yr} interest ${bad.interest.toFixed(2)} principal ${bad.principal.toFixed(2)}` : null;
  });

  check('cumulative depreciation never exceeds the depreciable basis', (r, a) => {
    const land = a.tax.enabled ? Math.min(0.95, Math.max(0, a.tax.landValuePct / 100)) : 0.2;
    const basis = a.purchasePrice * (1 - land);
    return r.cumulativeDepreciationTaken <= basis + 0.01 ? null : `${r.cumulativeDepreciationTaken.toFixed(0)} > basis ${basis.toFixed(0)}`;
  });

  check('state tax is zero when there is no state tax or no state taxable income', (r, a) => {
    for (const y of r.years) {
      const base = a.tax.enabled ? y.effectiveTaxIncAdv : y.taxableAfterPal;
      if (y.totalStateTax < -0.001) return `yr${y.yr} negative state tax`;
      if ((base <= 0 || !a.state) && y.totalStateTax > 0.001) return `yr${y.yr} state tax ${y.totalStateTax.toFixed(2)} on base ${base.toFixed(2)}`;
    }
    return null;
  });

  check('after-tax cash flow = cash flow − federal tax − state tax', (r, a) => {
    for (const y of r.years) {
      const basic = y.cashFlow - y.taxEffect - y.totalStateTax;
      if (!near(y.afterTaxCashFlow, basic)) return `yr${y.yr} basic after-tax ${y.afterTaxCashFlow} vs ${basic}`;
      if (a.tax.enabled) {
        const adv = y.cashFlow - y.taxEffectAdv - y.totalStateTax;
        if (!near(y.afterTaxCFAdv, adv)) return `yr${y.yr} advanced after-tax ${y.afterTaxCFAdv} vs ${adv}`;
      }
    }
    return null;
  });

  check('PMI is either the entered amount or zero, and zero when none is entered', (r, a) => {
    const annual = (+a.pmi || 0) * 12;
    const bad = r.years.find(y => !(near(y.pmi, 0) || near(y.pmi, annual)));
    return bad ? `yr${bad.yr} pmi ${bad.pmi}` : null;
  });

  check('IRR is finite, within [−100%, 1000%], and zeroes NPV when it is an interior root', (r) => {
    if (!Number.isFinite(r.irr) || r.irr < -1 || r.irr > 10) return `irr ${r.irr}`;
    const cfs = [-r.totalCashBase, ...r.years.map(y => y.cashFlow)];
    cfs[cfs.length - 1] += r.netProceeds;
    if (cfs[0] >= 0) return null;                      // no investment → IRR undefined, reported 0
    if (r.irr <= -0.999 || r.irr >= 9.99) return null; // total-loss / capped outcomes
    const scale = cfs.reduce((s, c) => s + Math.abs(c), 0);
    const v = npv(r.irr, cfs);
    return Math.abs(v) <= Math.max(1, scale * 1e-6) ? null : `npv(irr=${r.irr.toFixed(4)}) = ${v.toFixed(2)}`;
  });

  check('a deal that never returns cash reports −100%, not 0%', (r) => {
    const cfs = [-r.totalCashBase, ...r.years.map(y => y.cashFlow)];
    cfs[cfs.length - 1] += r.netProceeds;
    if (cfs[0] < 0 && !cfs.some(c => c > 0) && r.irr !== -1) return `irr ${r.irr} with no positive cash flow`;
    return null;
  });

  check('equity multiple = distributions ÷ cash invested', (r, a) => {
    if (!(r.totalCash > 0)) return null;
    const draws = r.years.reduce((s, y) => s + (y.vaRemodelOutflow || 0), 0);
    const expected = (r.years.reduce((s, y) => s + y.cashFlow, 0) + draws + r.netProceeds) / r.totalCash;
    return near(r.equityMultiple, expected) ? null : `${r.equityMultiple} vs ${expected}`;
  });

  check('expense breakdown adds up and expenses are never negative', (r) => {
    const b = r.baseExpBreakdown;
    const sum = b.propertyTax + b.insurance + b.maintenance + b.capex + b.propertyMgmt + b.utilities + b.hoa;
    if (!near(sum, b.total)) return `breakdown ${sum} vs total ${b.total}`;
    const bad = r.years.find(y => y.expenses < -0.01);
    return bad ? `yr${bad.yr} expenses ${bad.expenses}` : null;
  });

  check('property tax and insurance always use the entered $ amounts', (r, a) => {
    const b = r.baseExpBreakdown;
    if (!near(b.propertyTax, +a.expenses.propertyTax || 0)) return `property tax ${b.propertyTax} vs entered ${a.expenses.propertyTax}`;
    if (!near(b.insurance, +a.expenses.insurance || 0)) return `insurance ${b.insurance} vs entered ${a.expenses.insurance}`;
    return null;
  });

  check('exit figures are non-negative where they must be', (r) => {
    for (const k of ['exitLoanBalance', 'sellingCosts', 'netTaxOnSale', 'recaptureTax', 'ltcgTax', 'palTaxBenefit',
                     'niitTax', 'stateTaxOnSale', 'sec1245RecapturePortion', 'sec1250RecapturePortion', 'trueLTCGPortion']) {
      if (r[k] < -0.01) return `${k} = ${r[k]}`;
    }
    return null;
  });

  check('FHA self-sufficiency PITI = debt service + property tax + insurance + PMI', (r, a) => {
    const f = r.fhaSelfSufficiency;
    if (a.numUnits < 3) return f.applies ? 'applies to a 2-unit deal' : null;
    const expected = r.annualDebtService + (+a.expenses.propertyTax || 0) + (+a.expenses.insurance || 0) + (+a.pmi || 0) * 12;
    return near(f.pitiAnnual, expected) ? null : `piti ${f.pitiAnnual} vs ${expected}`;
  });

  check('each year’s cash flow adds up from its parts', (r) => {
    for (const y of r.years) {
      const parts = y.noi - y.debtService - y.pmi - (y.ooUtilities || 0)
        + (y.refiEvent ? y.refiEvent.cashOut : 0) - (y.vaRemodelOutflow || 0);
      if (!near(y.cashFlow, parts)) return `yr${y.yr} cash flow ${y.cashFlow} vs parts ${parts}`;
    }
    return null;
  });

  check('DSCR = NOI ÷ debt service actually paid', (r) => {
    for (const y of r.years) {
      const expected = y.debtService > 0 ? y.noi / y.debtService : 0;
      if (!near(y.dscr, expected)) return `yr${y.yr} dscr ${y.dscr} vs ${expected}`;
    }
    return null;
  });

  check('value-add spending totals the renovation budget exactly once', (r, a) => {
    const spent = r.years.reduce((s, y) => s + (y.vaRemodelOutflow || 0), 0);
    const budget = a.valueAdd.enabled ? (+a.valueAdd.reModelCost || 0) : 0;
    return near(spent, budget) ? null : `spent ${spent} vs budget ${budget}`;
  });

  check('the gain splits exactly into §1245 + §1250 recapture + long-term gain', (r) => {
    const parts = r.sec1245RecapturePortion + r.sec1250RecapturePortion + r.trueLTCGPortion;
    if (!near(parts, r.totalGainOnSale)) return `parts ${parts} vs gain ${r.totalGainOnSale}`;
    if (r.sec1245RecapturePortion + r.sec1250RecapturePortion > r.cumulativeDepreciationTaken + 0.01) return 'recapture exceeds depreciation taken';
    return null;
  });

  check('net tax on sale = federal + NIIT + state − released passive losses', (r) => {
    const expected = Math.max(0, r.recaptureTax + r.ltcgTax + r.niitTax + r.stateTaxOnSale - r.palTaxBenefit);
    return near(r.netTaxOnSale, expected) ? null : `${r.netTaxOnSale} vs ${expected}`;
  });

  check('calcDeal is deterministic', (r, a, i) =>
    near(calcDeal(deals[i]).irr, r.irr, 0) ? null : 'second run gave a different IRR');
});
