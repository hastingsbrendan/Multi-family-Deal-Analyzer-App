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

// Long-term capital gains: 0% up to the first threshold of taxable income, 15% up to
// the second, 20% above.
export const LTCG_THRESHOLDS = { single: [49450, 545500], married: [98900, 613700] };

// §1411 net investment income tax. Thresholds are statutory and not indexed.
export const NIIT_RATE = 0.038;
export const NIIT_THRESHOLD = { single: 200000, married: 250000 };

// Unrecaptured §1250 gain (straight-line depreciation on real property) is taxed at
// ordinary rates, capped at 25%.
export const UNRECAPTURED_1250_MAX_RATE = 0.25;

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

// Ordinary tax on the slice of taxable income between `lo` and `hi`, with each
// bracket's rate capped at `cap` (used for the 25% ceiling on §1250 gain).
function ordinaryTaxBetween(lo, hi, s, cap = Infinity) {
  let tax = 0, lower = 0;
  for (const [rate, upper] of ORDINARY_BRACKETS[s]) {
    const from = Math.max(lo, lower), to = Math.min(hi, upper);
    if (to > from) tax += (to - from) * Math.min(rate, cap);
    lower = upper;
    if (lower >= hi) break;
  }
  return tax;
}

/**
 * Federal tax on the gain from selling the property, stacked on the household's
 * other income in the order the IRS applies it:
 *   1. §1245 recapture (cost-seg personal property / land improvements) — ordinary rates
 *   2. unrecaptured §1250 gain (straight-line depreciation) — ordinary rates, max 25%
 *   3. remaining long-term gain — 0 / 15 / 20% by total taxable income
 * plus the 3.8% net investment income tax on the lesser of the gain or MAGI above
 * the threshold. Real-estate professionals who materially participate are exempt
 * from NIIT on rental property (pass niitApplies: false).
 *
 * flatOrdinaryRate: when the deal uses the flat-rate override, ordinary pieces use
 * that rate (§1250 still capped at 25%); long-term gain still uses the thresholds.
 */
export function federalTaxOnSale({
  otherIncome = 0, filingStatus = 'single',
  sec1245Gain = 0, sec1250Gain = 0, capitalGain = 0,
  niitApplies = true, flatOrdinaryRate = null,
}) {
  const s = status(filingStatus);
  const other = +otherIncome || 0;
  const g1245 = Math.max(0, +sec1245Gain || 0);
  const g1250 = Math.max(0, +sec1250Gain || 0);
  const gLtcg = Math.max(0, +capitalGain || 0);
  const sd = STANDARD_DEDUCTION[s];

  // Taxable-income levels as each layer of the gain is added (unused standard
  // deduction absorbs the first dollars, as in federalTaxOnIncome)
  const L0 = Math.max(0, other - sd);
  const L1 = Math.max(0, other + g1245 - sd);
  const L2 = Math.max(0, other + g1245 + g1250 - sd);
  const L3 = Math.max(0, other + g1245 + g1250 + gLtcg - sd);

  const flat = flatOrdinaryRate != null;
  const tax1245 = flat ? g1245 * flatOrdinaryRate : ordinaryTaxBetween(L0, L1, s);
  const tax1250 = flat
    ? g1250 * Math.min(flatOrdinaryRate, UNRECAPTURED_1250_MAX_RATE)
    : ordinaryTaxBetween(L1, L2, s, UNRECAPTURED_1250_MAX_RATE);

  const [t0, t15] = LTCG_THRESHOLDS[s];
  const band = (lo, hi) => Math.max(0, Math.min(L3, hi) - Math.max(L2, lo));
  const taxLtcg = band(t0, t15) * 0.15 + band(t15, Infinity) * 0.20;

  const gain = g1245 + g1250 + gLtcg;
  const niit = niitApplies
    ? NIIT_RATE * Math.max(0, Math.min(gain, other + gain - NIIT_THRESHOLD[s]))
    : 0;

  return { tax1245, tax1250, taxLtcg, niit, total: tax1245 + tax1250 + taxLtcg + niit };
}
