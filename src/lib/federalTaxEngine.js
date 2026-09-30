// ─── Federal Income Tax Engine ────────────────────────────────────────────────
//
// Federal counterpart to taxEngine.js. Rental income is taxed with the stacking
// method — it sits on top of the household's other income, so it is taxed at the
// rates it actually occupies:
//
//   taxOnRental = tax(other + rental − SD) − tax(other − SD)      (each floored at 0)
//
// Losses work the same way in reverse, so an allowed loss saves tax at the rates it
// comes out of and can never save more than the other income owes.
//
// DATA — 2026 tax year. Source: IRS Rev. Proc. 2025-32 (2026 inflation adjustments,
// reflecting the One Big Beautiful Bill Act). Update FEDERAL_TAX_YEAR and the tables
// when the IRS publishes the next year's figures (each October);
// federalTaxEngine.test.js fails once the calendar passes FEDERAL_TAX_YEAR.
//
// Only single and married-filing-jointly are modelled (the app's two filing statuses).

export const FEDERAL_TAX_YEAR = 2026;

// [rate, upper bound of taxable income for that rate]
export const ORDINARY_BRACKETS = {
  single: [
    [0.10, 12400], [0.12, 50400], [0.22, 105700], [0.24, 201775],
    [0.32, 256225], [0.35, 640600], [0.37, Infinity],
  ],
  married: [
    [0.10, 24800], [0.12, 100800], [0.22, 211400], [0.24, 403550],
    [0.32, 512450], [0.35, 768700], [0.37, Infinity],
  ],
};

export const STANDARD_DEDUCTION = { single: 16100, married: 32200 };

const status = (s) => (s === 'married' ? 'married' : 'single');

/** Federal tax on a given amount of taxable income. */
export function ordinaryTax(taxable, filingStatus = 'single') {
  let tax = 0, lower = 0;
  for (const [rate, upper] of ORDINARY_BRACKETS[status(filingStatus)]) {
    if (taxable <= lower) break;
    tax += (Math.min(taxable, upper) - lower) * rate;
    lower = upper;
  }
  return tax;
}

/** Rate that applies to the next dollar at this level of taxable income. */
export function marginalRate(taxable, filingStatus = 'single') {
  for (const [rate, upper] of ORDINARY_BRACKETS[status(filingStatus)]) {
    if (taxable < upper) return rate;
  }
  return ORDINARY_BRACKETS[status(filingStatus)].at(-1)[0];
}

/** Taxable income from other sources alone (other income minus the standard deduction). */
export function taxableBase(otherIncome, filingStatus = 'single') {
  return Math.max(0, (+otherIncome || 0) - STANDARD_DEDUCTION[status(filingStatus)]);
}

/**
 * Federal tax change from adding `netIncome` (negative = an allowed loss) on top of
 * `otherIncome`. Returns { tax, marginalRate } — tax is negative for a tax saving.
 */
export function federalTaxOnIncome({ otherIncome = 0, netIncome = 0, filingStatus = 'single' }) {
  const s = status(filingStatus);
  const other = +otherIncome || 0;
  const base = taxableBase(other, s);
  const withRental = Math.max(0, other + (+netIncome || 0) - STANDARD_DEDUCTION[s]);
  return {
    tax: ordinaryTax(withRental, s) - ordinaryTax(base, s),
    marginalRate: marginalRate(Math.max(base, withRental), s),
  };
}
