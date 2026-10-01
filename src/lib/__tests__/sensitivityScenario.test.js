import { describe, test, expect, vi } from 'vitest';

vi.mock('@sentry/react', () => ({ addBreadcrumb: vi.fn(), captureException: vi.fn(), captureMessage: vi.fn() }));

const { applyScenario } = await import('../../components/SensitivityTab.jsx');

// Expense percentages live in assumptions.expenses (maintenancePct, ...). The what-if
// sliders scaled assumptions.maintenancePct etc. at the top level, which deals don't
// use, so in % mode the expense and property-tax sliders did nothing (2026-09 review).
const deal = () => ({
  assumptions: {
    units: [{ rent: 1000 }, { rent: 1000 }],
    expenseModes: { propertyTax: 'value', insurance: 'value', maintenance: 'pct', capex: 'pct', propertyMgmt: 'pct', utilities: 'value' },
    expenses: {
      propertyTax: 6000, insurance: 1800,
      maintenance: 0, maintenancePct: 5,
      capex: 0, capexPct: 5,
      propertyMgmt: 0, propertyMgmtPct: 8,
      utilities: 1200, utilitiesPct: 0,
    },
  },
});

describe('applyScenario — expense sliders', () => {
  test('+10% expenses scales % expenses where they are stored', () => {
    const a = applyScenario(deal(), { expenseDelta: 10 }).assumptions;
    expect(a.expenses.maintenancePct).toBeCloseTo(5.5, 6);
    expect(a.expenses.capexPct).toBeCloseTo(5.5, 6);
    expect(a.expenses.propertyMgmtPct).toBeCloseTo(8.8, 6);
  });

  test('+10% expenses still scales $ expenses', () => {
    const a = applyScenario(deal(), { expenseDelta: 10 }).assumptions;
    expect(a.expenses.insurance).toBeCloseTo(1980, 6);
    expect(a.expenses.utilities).toBeCloseTo(1320, 6);
  });

  test('+20% property tax scales the $ property tax', () => {
    const a = applyScenario(deal(), { propertyTaxDelta: 20 }).assumptions;
    expect(a.expenses.propertyTax).toBeCloseTo(7200, 6);
  });

  test('does not mutate the deal it was given', () => {
    const d = deal();
    applyScenario(d, { expenseDelta: 10, propertyTaxDelta: 20 });
    expect(d.assumptions.expenses.maintenancePct).toBe(5);
    expect(d.assumptions.expenses.propertyTax).toBe(6000);
  });
});
