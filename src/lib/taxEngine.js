// ─── State Income Tax Engine ──────────────────────────────────────────────────
//
// Calculates state income tax on rental income using the "stacking method":
//   stateTaxOnRental = tax(MAGI + netRentalIncome) − tax(MAGI)
//
// This is the technically correct approach. It taxes rental income at the
// marginal rate(s) it actually occupies after stacking on top of other income,
// rather than applying a flat marginal rate which breaks at bracket boundaries.
//
// USAGE
// ─────
//   import { calcStateTax, STATE_TAX_DATA, FILING_STATUSES } from './taxEngine.js';
//
//   const result = calcStateTax({
//     state:           'CA',          // 2-letter state code
//     magi:            120000,        // user's non-rental income (USD)
//     netRentalIncome: 18000,         // net taxable rental income (USD)
//     filingStatus:    'single',      // 'single' | 'married'
//     localTaxRate:    0,             // optional additive local rate (0–1 decimal)
//   });
//   // result = { stateTax, localTax, totalTax, effectiveRate, marginalRate, noTaxState }
//
// DATA NOTES
// ──────────
// • Brackets are 2025 tax year rates (filed 2026).
// • Flat-rate states are stored as a single bracket for code uniformity.
// • No-income-tax states return { noTaxState: true, totalTax: 0 }.
// • Maryland local tax is modeled as a required additive layer (3% default county);
//   user can override via localTaxRate.
// • New York City local tax is NOT auto-applied; user must add via localTaxRate.
// • Bracket thresholds are in USD. 'Infinity' marks the top bracket.
// • Sources: Tax Foundation 2025 State Income Tax Rates & Brackets;
//   state revenue department publications.
//
// MAINTENANCE
// ───────────
// • Brackets change modestly year-to-year (inflation adjustments, rate cuts).
// • Update annually in January once states finalize their tables.
// • Fields: { rate: 0.XX, min: 0, max: Infinity }
//   rate = marginal rate for income within [min, max)
//   Single-bracket flat states: one entry with min:0, max:Infinity.
//
// FILING STATUS BEHAVIOR
// ──────────────────────
// Most states either:
//   (a) Double the single-filer thresholds for MFJ (noted inline), or
//   (b) Publish separate MFJ tables (stored separately).
// Where a state doubles exactly, the `married` key === null and the engine
// doubles the `single` brackets automatically.

// ─── Filing status constants ──────────────────────────────────────────────────
export const FILING_STATUSES = {
  SINGLE:  'single',
  MARRIED: 'married',
};

// ─── No-income-tax states ─────────────────────────────────────────────────────
// These 9 states levy no individual income tax on wages/rental income.
const NO_TAX_STATES = new Set([
  'AK', // Alaska
  'FL', // Florida
  'NV', // Nevada
  'NH', // New Hampshire (repealed interest/dividend tax 2025; no income tax)
  'SD', // South Dakota
  'TN', // Tennessee
  'TX', // Texas
  'WA', // Washington (capital gains only, not ordinary income)
  'WY', // Wyoming
]);

// ─── State bracket data ───────────────────────────────────────────────────────
// Format per state:
//   name:     Full state name
//   type:     'flat' | 'progressive' | 'none'
//   note:     Any important caveats
//   single:   Array of { rate, min, max } brackets for single filers
//   married:  null = double single thresholds; otherwise separate bracket array
//
// Rates are decimal (0.05 = 5%). Thresholds are USD integers.

export const STATE_TAX_DATA = {

  // ── A ──────────────────────────────────────────────────────────────────────

  AL: {
    name: 'Alabama', type: 'progressive',
    note: 'MFJ brackets differ from single; lowest bracket phased out at higher incomes.',
    single: [
      { rate: 0.02,  min: 0,      max: 500    },
      { rate: 0.04,  min: 500,    max: 3000   },
      { rate: 0.05,  min: 3000,   max: Infinity },
    ],
    married: [
      { rate: 0.02,  min: 0,      max: 1000   },
      { rate: 0.04,  min: 1000,   max: 6000   },
      { rate: 0.05,  min: 6000,   max: Infinity },
    ],
  },

  AK: { name: 'Alaska',        type: 'none', single: [], married: null },

  AR: {
    name: 'Arkansas', type: 'progressive',
    note: 'Two-bracket system post-2024 reform. Top rate 3.9%.',
    single: [
      { rate: 0.00,  min: 0,      max: 5099   },
      { rate: 0.039, min: 5099,   max: Infinity },
    ],
    married: null, // doubles single thresholds
  },

  AZ: {
    name: 'Arizona', type: 'flat',
    note: 'Flat 2.5% since 2023.',
    single:  [{ rate: 0.025, min: 0, max: Infinity }],
    married: null,
  },

  // ── C ──────────────────────────────────────────────────────────────────────

  CA: {
    name: 'California', type: 'progressive',
    note: '9-bracket system. 1% mental health surcharge on income > $1M (not modeled separately — included in top bracket rate of 13.3%). MFJ thresholds differ from single.',
    single: [
      { rate: 0.01,  min: 0,        max: 10756    },
      { rate: 0.02,  min: 10756,    max: 25499    },
      { rate: 0.04,  min: 25499,    max: 40245    },
      { rate: 0.06,  min: 40245,    max: 55866    },
      { rate: 0.08,  min: 55866,    max: 70606    },
      { rate: 0.093, min: 70606,    max: 360659   },
      { rate: 0.103, min: 360659,   max: 432787   },
      { rate: 0.113, min: 432787,   max: 721314   },
      { rate: 0.123, min: 721314,   max: 1000000  },
      { rate: 0.133, min: 1000000,  max: Infinity }, // includes 1% Mental Health surcharge
    ],
    married: [
      { rate: 0.01,  min: 0,        max: 21512    },
      { rate: 0.02,  min: 21512,    max: 50998    },
      { rate: 0.04,  min: 50998,    max: 80490    },
      { rate: 0.06,  min: 80490,    max: 111732   },
      { rate: 0.08,  min: 111732,   max: 141212   },
      { rate: 0.093, min: 141212,   max: 721318   },
      { rate: 0.103, min: 721318,   max: 865574   },
      { rate: 0.113, min: 865574,   max: 1000000  },
      { rate: 0.123, min: 1000000,  max: 1442628  },
      { rate: 0.133, min: 1442628,  max: Infinity },
    ],
  },

  CO: {
    name: 'Colorado', type: 'flat',
    note: 'Flat 4.4% (reverted from 4.25% temporary reduction).',
    single:  [{ rate: 0.044, min: 0, max: Infinity }],
    married: null,
  },

  CT: {
    name: 'Connecticut', type: 'progressive',
    note: '7 brackets. MFJ thresholds approximately double single.',
    single: [
      { rate: 0.02,   min: 0,       max: 10000   },
      { rate: 0.045,  min: 10000,   max: 50000   },
      { rate: 0.055,  min: 50000,   max: 100000  },
      { rate: 0.06,   min: 100000,  max: 200000  },
      { rate: 0.065,  min: 200000,  max: 250000  },
      { rate: 0.069,  min: 250000,  max: 500000  },
      { rate: 0.0699, min: 500000,  max: Infinity },
    ],
    married: [
      { rate: 0.02,   min: 0,       max: 20000   },
      { rate: 0.045,  min: 20000,   max: 100000  },
      { rate: 0.055,  min: 100000,  max: 200000  },
      { rate: 0.06,   min: 200000,  max: 400000  },
      { rate: 0.065,  min: 400000,  max: 500000  },
      { rate: 0.069,  min: 500000,  max: 1000000 },
      { rate: 0.0699, min: 1000000, max: Infinity },
    ],
  },

  // ── D ──────────────────────────────────────────────────────────────────────

  DC: {
    name: 'District of Columbia', type: 'progressive',
    note: 'DC has 7 brackets. Top rate 10.75% above $1M.',
    single: [
      { rate: 0.04,   min: 0,       max: 10000   },
      { rate: 0.06,   min: 10000,   max: 40000   },
      { rate: 0.065,  min: 40000,   max: 60000   },
      { rate: 0.085,  min: 60000,   max: 250000  },
      { rate: 0.0925, min: 250000,  max: 500000  },
      { rate: 0.0975, min: 500000,  max: 1000000 },
      { rate: 0.1075, min: 1000000, max: Infinity },
    ],
    married: null, // DC uses same brackets regardless of filing status
  },

  DE: {
    name: 'Delaware', type: 'progressive',
    note: '7 brackets. MFJ thresholds double single.',
    single: [
      { rate: 0.00,   min: 0,      max: 2000    },
      { rate: 0.02,   min: 2000,   max: 5000    },
      { rate: 0.039,  min: 5000,   max: 10000   },
      { rate: 0.048,  min: 10000,  max: 20000   },
      { rate: 0.052,  min: 20000,  max: 25000   },
      { rate: 0.0555, min: 25000,  max: 60000   },
      { rate: 0.066,  min: 60000,  max: Infinity },
    ],
    married: null,
  },

  // ── F ──────────────────────────────────────────────────────────────────────

  FL: { name: 'Florida', type: 'none', single: [], married: null },

  // ── G ──────────────────────────────────────────────────────────────────────

  GA: {
    name: 'Georgia', type: 'flat',
    note: 'Flat 5.19% as of 2025 (down from 5.39%).',
    single:  [{ rate: 0.0519, min: 0, max: Infinity }],
    married: null,
  },

  // ── H ──────────────────────────────────────────────────────────────────────

  HI: {
    name: 'Hawaii', type: 'progressive',
    note: '12-bracket system. Top rate 11% above $325K single / $650K MFJ.',
    single: [
      { rate: 0.014,  min: 0,       max: 2400    },
      { rate: 0.032,  min: 2400,    max: 4800    },
      { rate: 0.055,  min: 4800,    max: 9600    },
      { rate: 0.064,  min: 9600,    max: 14400   },
      { rate: 0.068,  min: 14400,   max: 19200   },
      { rate: 0.072,  min: 19200,   max: 24000   },
      { rate: 0.076,  min: 24000,   max: 36000   },
      { rate: 0.079,  min: 36000,   max: 48000   },
      { rate: 0.0825, min: 48000,   max: 150000  },
      { rate: 0.09,   min: 150000,  max: 175000  },
      { rate: 0.10,   min: 175000,  max: 325000  },
      { rate: 0.11,   min: 325000,  max: Infinity },
    ],
    married: [
      { rate: 0.014,  min: 0,       max: 4800    },
      { rate: 0.032,  min: 4800,    max: 9600    },
      { rate: 0.055,  min: 9600,    max: 19200   },
      { rate: 0.064,  min: 19200,   max: 28800   },
      { rate: 0.068,  min: 28800,   max: 38400   },
      { rate: 0.072,  min: 38400,   max: 48000   },
      { rate: 0.076,  min: 48000,   max: 72000   },
      { rate: 0.079,  min: 72000,   max: 96000   },
      { rate: 0.0825, min: 96000,   max: 300000  },
      { rate: 0.09,   min: 300000,  max: 350000  },
      { rate: 0.10,   min: 350000,  max: 650000  },
      { rate: 0.11,   min: 650000,  max: Infinity },
    ],
  },

  // ── I ──────────────────────────────────────────────────────────────────────

  IA: {
    name: 'Iowa', type: 'flat',
    note: 'Flat 3.8% as of 2025 (consolidated from progressive brackets).',
    single:  [{ rate: 0.038, min: 0, max: Infinity }],
    married: null,
  },

  ID: {
    name: 'Idaho', type: 'flat',
    note: 'Flat 5.3% as of 2025 (lowered from 5.695%).',
    single:  [{ rate: 0.053, min: 0, max: Infinity }],
    married: null,
  },

  IL: {
    name: 'Illinois', type: 'flat',
    note: 'Flat 4.95%.',
    single:  [{ rate: 0.0495, min: 0, max: Infinity }],
    married: null,
  },

  IN: {
    name: 'Indiana', type: 'flat',
    note: 'Flat 3.0% as of 2025 (reduced from 3.05%).',
    single:  [{ rate: 0.03, min: 0, max: Infinity }],
    married: null,
  },

  // ── K ──────────────────────────────────────────────────────────────────────

  KS: {
    name: 'Kansas', type: 'progressive',
    note: '2 brackets post-2024 reform. MFJ thresholds approximately double.',
    single: [
      { rate: 0.052, min: 0,      max: 23000   },
      { rate: 0.058, min: 23000,  max: Infinity },
    ],
    married: [
      { rate: 0.052, min: 0,      max: 46000   },
      { rate: 0.058, min: 46000,  max: Infinity },
    ],
  },

  KY: {
    name: 'Kentucky', type: 'flat',
    note: 'Flat 4.0%.',
    single:  [{ rate: 0.04, min: 0, max: Infinity }],
    married: null,
  },

  // ── L ──────────────────────────────────────────────────────────────────────

  LA: {
    name: 'Louisiana', type: 'flat',
    note: 'Flat 3.0% as of 2025 (converted from progressive).',
    single:  [{ rate: 0.03, min: 0, max: Infinity }],
    married: null,
  },

  // ── M ──────────────────────────────────────────────────────────────────────

  MA: {
    name: 'Massachusetts', type: 'progressive',
    note: '5% standard rate; 9% surtax on income over $1M (millionaires tax). MFJ same thresholds.',
    single: [
      { rate: 0.05, min: 0,        max: 1000000 },
      { rate: 0.09, min: 1000000,  max: Infinity },
    ],
    married: null,
  },

  MD: {
    name: 'Maryland', type: 'progressive',
    note: 'State rate only. Maryland also mandates a county/city income tax (typically 2.25%–3.2%); model as localTaxRate. Default county rate 3.0% recommended.',
    single: [
      { rate: 0.02,   min: 0,       max: 1000    },
      { rate: 0.03,   min: 1000,    max: 2000    },
      { rate: 0.04,   min: 2000,    max: 3000    },
      { rate: 0.0475, min: 3000,    max: 100000  },
      { rate: 0.05,   min: 100000,  max: 125000  },
      { rate: 0.0525, min: 125000,  max: 150000  },
      { rate: 0.055,  min: 150000,  max: 250000  },
      { rate: 0.0625, min: 250000,  max: 500000  },
      { rate: 0.065,  min: 500000,  max: Infinity },
    ],
    married: [
      { rate: 0.02,   min: 0,       max: 1000    },
      { rate: 0.03,   min: 1000,    max: 2000    },
      { rate: 0.04,   min: 2000,    max: 3000    },
      { rate: 0.0475, min: 3000,    max: 150000  },
      { rate: 0.05,   min: 150000,  max: 175000  },
      { rate: 0.0525, min: 175000,  max: 225000  },
      { rate: 0.055,  min: 225000,  max: 300000  },
      { rate: 0.0625, min: 300000,  max: 500000  },
      { rate: 0.065,  min: 500000,  max: Infinity },
    ],
  },

  ME: {
    name: 'Maine', type: 'progressive',
    note: '3 brackets. MFJ thresholds double single.',
    single: [
      { rate: 0.058,  min: 0,       max: 24500   },
      { rate: 0.0675, min: 24500,   max: 58050   },
      { rate: 0.0715, min: 58050,   max: Infinity },
    ],
    married: null,
  },

  MI: {
    name: 'Michigan', type: 'flat',
    note: 'Flat 4.05%.',
    single:  [{ rate: 0.0405, min: 0, max: Infinity }],
    married: null,
  },

  MN: {
    name: 'Minnesota', type: 'progressive',
    note: '4 brackets. Top rate 9.85% at $198,630 single / $330,410 MFJ. 1% net investment income surtax above $1M (not modeled here).',
    single: [
      { rate: 0.0535, min: 0,       max: 32570   },
      { rate: 0.068,  min: 32570,   max: 107220  },
      { rate: 0.0785, min: 107220,  max: 198630  },
      { rate: 0.0985, min: 198630,  max: Infinity },
    ],
    married: [
      { rate: 0.0535, min: 0,       max: 47090   },
      { rate: 0.068,  min: 47090,   max: 189060  },
      { rate: 0.0785, min: 189060,  max: 330410  },
      { rate: 0.0985, min: 330410,  max: Infinity },
    ],
  },

  MO: {
    name: 'Missouri', type: 'progressive',
    note: 'Top rate 4.7% (reduced from 4.8% in 2025). 8 brackets below that.',
    single: [
      { rate: 0.00,   min: 0,      max: 1207    },
      { rate: 0.015,  min: 1207,   max: 2414    },
      { rate: 0.02,   min: 2414,   max: 3621    },
      { rate: 0.025,  min: 3621,   max: 4828    },
      { rate: 0.03,   min: 4828,   max: 6035    },
      { rate: 0.035,  min: 6035,   max: 7242    },
      { rate: 0.04,   min: 7242,   max: 8449    },
      { rate: 0.045,  min: 8449,   max: 9556    },
      { rate: 0.047,  min: 9556,   max: Infinity },
    ],
    married: null,
  },

  MS: {
    name: 'Mississippi', type: 'flat',
    note: 'Flat 4.4% (reduced from 4.7% in 2025).',
    single:  [{ rate: 0.044, min: 0, max: Infinity }],
    married: null,
  },

  MT: {
    name: 'Montana', type: 'progressive',
    note: '2 brackets post-2024 reform. MFJ thresholds double.',
    single: [
      { rate: 0.047, min: 0,      max: 20500   },
      { rate: 0.059, min: 20500,  max: Infinity },
    ],
    married: null,
  },

  // ── N ──────────────────────────────────────────────────────────────────────

  NC: {
    name: 'North Carolina', type: 'flat',
    note: 'Flat 4.25% (reduced from 4.5% in 2025).',
    single:  [{ rate: 0.0425, min: 0, max: Infinity }],
    married: null,
  },

  ND: {
    name: 'North Dakota', type: 'progressive',
    note: '2 brackets. Very low rates.',
    single: [
      { rate: 0.00,   min: 0,      max: 44725   },
      { rate: 0.025,  min: 44725,  max: Infinity },
    ],
    married: [
      { rate: 0.00,   min: 0,      max: 74750   },
      { rate: 0.025,  min: 74750,  max: Infinity },
    ],
  },

  NE: {
    name: 'Nebraska', type: 'progressive',
    note: '4 brackets. Top rate 5.20% (reduced from 5.84% in 2025). MFJ thresholds differ.',
    single: [
      { rate: 0.0246, min: 0,      max: 3700    },
      { rate: 0.0351, min: 3700,   max: 22170   },
      { rate: 0.0501, min: 22170,  max: 35730   },
      { rate: 0.052,  min: 35730,  max: Infinity },
    ],
    married: [
      { rate: 0.0246, min: 0,      max: 7390    },
      { rate: 0.0351, min: 7390,   max: 44340   },
      { rate: 0.0501, min: 44340,  max: 71470   },
      { rate: 0.052,  min: 71470,  max: Infinity },
    ],
  },

  NH: { name: 'New Hampshire', type: 'none', single: [], married: null },

  NJ: {
    name: 'New Jersey', type: 'progressive',
    note: '7 brackets. Top rate 10.75% above $1M. MFJ thresholds differ.',
    single: [
      { rate: 0.014,  min: 0,        max: 20000   },
      { rate: 0.0175, min: 20000,    max: 35000   },
      { rate: 0.035,  min: 35000,    max: 40000   },
      { rate: 0.05525,min: 40000,    max: 75000   },
      { rate: 0.0637, min: 75000,    max: 500000  },
      { rate: 0.0897, min: 500000,   max: 1000000 },
      { rate: 0.1075, min: 1000000,  max: Infinity },
    ],
    married: [
      { rate: 0.014,  min: 0,        max: 20000   },
      { rate: 0.0175, min: 20000,    max: 50000   },
      { rate: 0.0245, min: 50000,    max: 70000   },
      { rate: 0.035,  min: 70000,    max: 80000   },
      { rate: 0.05525,min: 80000,    max: 150000  },
      { rate: 0.0637, min: 150000,   max: 500000  },
      { rate: 0.0897, min: 500000,   max: 1000000 },
      { rate: 0.1075, min: 1000000,  max: Infinity },
    ],
  },

  NM: {
    name: 'New Mexico', type: 'progressive',
    note: '5 brackets post-2025 reform. Top rate 5.9%. MFJ thresholds double.',
    single: [
      { rate: 0.015, min: 0,       max: 5500    },
      { rate: 0.032, min: 5500,    max: 11000   },
      { rate: 0.043, min: 11000,   max: 16000   },
      { rate: 0.049, min: 16000,   max: 210000  },
      { rate: 0.059, min: 210000,  max: Infinity },
    ],
    married: null,
  },

  NV: { name: 'Nevada', type: 'none', single: [], married: null },

  NY: {
    name: 'New York', type: 'progressive',
    note: '9 brackets. Top rate 10.9% above $25M. NYC/Yonkers residents pay additional local tax — add via localTaxRate (NYC: ~3.88% single, ~3.88% MFJ). MFJ thresholds differ from single.',
    single: [
      { rate: 0.04,   min: 0,         max: 17150    },
      { rate: 0.045,  min: 17150,     max: 23600    },
      { rate: 0.0525, min: 23600,     max: 27900    },
      { rate: 0.055,  min: 27900,     max: 161550   },
      { rate: 0.06,   min: 161550,    max: 323200   },
      { rate: 0.0685, min: 323200,    max: 2155350  },
      { rate: 0.0965, min: 2155350,   max: 5000000  },
      { rate: 0.103,  min: 5000000,   max: 25000000 },
      { rate: 0.109,  min: 25000000,  max: Infinity },
    ],
    married: [
      { rate: 0.04,   min: 0,         max: 17150    },
      { rate: 0.045,  min: 17150,     max: 23600    },
      { rate: 0.0525, min: 23600,     max: 27900    },
      { rate: 0.055,  min: 27900,     max: 323200   },
      { rate: 0.06,   min: 323200,    max: 2155350  },
      { rate: 0.0685, min: 2155350,   max: 5000000  }, // Note: NY MFJ top brackets differ
      { rate: 0.0965, min: 5000000,   max: 10000000 },
      { rate: 0.103,  min: 10000000,  max: 25000000 },
      { rate: 0.109,  min: 25000000,  max: Infinity },
    ],
  },

  // ── O ──────────────────────────────────────────────────────────────────────

  OH: {
    name: 'Ohio', type: 'progressive',
    note: '4 brackets. Top rate 3.99%. Many OH cities also levy a municipal income tax (0.5%–3%); add via localTaxRate.',
    single: [
      { rate: 0.00,   min: 0,       max: 26050   },
      { rate: 0.0276, min: 26050,   max: 100000  },
      { rate: 0.0333, min: 100000,  max: 115300  },
      { rate: 0.0399, min: 115300,  max: Infinity },
    ],
    married: null,
  },

  OK: {
    name: 'Oklahoma', type: 'progressive',
    note: '6 brackets. MFJ thresholds double.',
    single: [
      { rate: 0.0025, min: 0,      max: 1000    },
      { rate: 0.0075, min: 1000,   max: 2500    },
      { rate: 0.0175, min: 2500,   max: 3750    },
      { rate: 0.0275, min: 3750,   max: 4900    },
      { rate: 0.0375, min: 4900,   max: 7200    },
      { rate: 0.0475, min: 7200,   max: Infinity },
    ],
    married: null,
  },

  OR: {
    name: 'Oregon', type: 'progressive',
    note: '4 brackets. Top rate 9.9% at $125K single / $250K MFJ. Oregon does not fully index top bracket for inflation.',
    single: [
      { rate: 0.0475, min: 0,       max: 18400   },
      { rate: 0.0675, min: 18400,   max: 46200   },
      { rate: 0.0875, min: 46200,   max: 125000  },
      { rate: 0.099,  min: 125000,  max: Infinity },
    ],
    married: [
      { rate: 0.0475, min: 0,       max: 36800   },
      { rate: 0.0675, min: 36800,   max: 92400   },
      { rate: 0.0875, min: 92400,   max: 250000  },
      { rate: 0.099,  min: 250000,  max: Infinity },
    ],
  },

  // ── P ──────────────────────────────────────────────────────────────────────

  PA: {
    name: 'Pennsylvania', type: 'flat',
    note: 'Flat 3.07%. Philadelphia residents pay an additional city wage tax.',
    single:  [{ rate: 0.0307, min: 0, max: Infinity }],
    married: null,
  },

  // ── R ──────────────────────────────────────────────────────────────────────

  RI: {
    name: 'Rhode Island', type: 'progressive',
    note: '3 brackets. MFJ thresholds double.',
    single: [
      { rate: 0.0375, min: 0,       max: 77450   },
      { rate: 0.0475, min: 77450,   max: 176050  },
      { rate: 0.0599, min: 176050,  max: Infinity },
    ],
    married: null,
  },

  // ── S ──────────────────────────────────────────────────────────────────────

  SC: {
    name: 'South Carolina', type: 'progressive',
    note: 'Top rate 6.0% (reduced from 6.2% in 2025). MFJ thresholds double.',
    single: [
      { rate: 0.00,  min: 0,      max: 3200    },
      { rate: 0.03,  min: 3200,   max: 6410    },
      { rate: 0.04,  min: 6410,   max: 9620    },
      { rate: 0.05,  min: 9620,   max: 12820   },
      { rate: 0.06,  min: 12820,  max: Infinity },
    ],
    married: null,
  },

  SD: { name: 'South Dakota', type: 'none', single: [], married: null },

  // ── T ──────────────────────────────────────────────────────────────────────

  TN: { name: 'Tennessee', type: 'none', single: [], married: null },

  TX: { name: 'Texas', type: 'none', single: [], married: null },

  // ── U ──────────────────────────────────────────────────────────────────────

  UT: {
    name: 'Utah', type: 'flat',
    note: 'Flat 4.5% (reduced from 4.55% in 2025).',
    single:  [{ rate: 0.045, min: 0, max: Infinity }],
    married: null,
  },

  // ── V ──────────────────────────────────────────────────────────────────────

  VA: {
    name: 'Virginia', type: 'progressive',
    note: '4 brackets. Top rate 5.75% above $17K (unchanged for decades). MFJ same thresholds.',
    single: [
      { rate: 0.02,   min: 0,      max: 3000    },
      { rate: 0.03,   min: 3000,   max: 5000    },
      { rate: 0.05,   min: 5000,   max: 17000   },
      { rate: 0.0575, min: 17000,  max: Infinity },
    ],
    married: null,
  },

  VT: {
    name: 'Vermont', type: 'progressive',
    note: '4 brackets. Top rate 8.75% above $213,150 single / $259,500 MFJ.',
    single: [
      { rate: 0.0335, min: 0,       max: 45400   },
      { rate: 0.066,  min: 45400,   max: 110050  },
      { rate: 0.076,  min: 110050,  max: 213150  },
      { rate: 0.0875, min: 213150,  max: Infinity },
    ],
    married: [
      { rate: 0.0335, min: 0,       max: 75850   },
      { rate: 0.066,  min: 75850,   max: 183400  },
      { rate: 0.076,  min: 183400,  max: 259500  },
      { rate: 0.0875, min: 259500,  max: Infinity },
    ],
  },

  // ── W ──────────────────────────────────────────────────────────────────────

  WA: { name: 'Washington', type: 'none', single: [], married: null },

  WI: {
    name: 'Wisconsin', type: 'progressive',
    note: '4 brackets. Top rate 7.65% above $304,600 single / $405,550 MFJ.',
    single: [
      { rate: 0.035,  min: 0,       max: 14320   },
      { rate: 0.044,  min: 14320,   max: 28640   },
      { rate: 0.053,  min: 28640,   max: 304600  },
      { rate: 0.0765, min: 304600,  max: Infinity },
    ],
    married: [
      { rate: 0.035,  min: 0,       max: 19090   },
      { rate: 0.044,  min: 19090,   max: 38190   },
      { rate: 0.053,  min: 38190,   max: 405550  },
      { rate: 0.0765, min: 405550,  max: Infinity },
    ],
  },

  WV: {
    name: 'West Virginia', type: 'progressive',
    note: '5 brackets. All rates reduced in 2025. Top rate 4.82% (from 5.12%).',
    single: [
      { rate: 0.0236, min: 0,      max: 10000   },
      { rate: 0.0315, min: 10000,  max: 25000   },
      { rate: 0.0354, min: 25000,  max: 40000   },
      { rate: 0.0433, min: 40000,  max: 60000   },
      { rate: 0.0482, min: 60000,  max: Infinity },
    ],
    married: null,
  },

  WY: { name: 'Wyoming', type: 'none', single: [], married: null },
};

// ─── Bracket calculation engine ───────────────────────────────────────────────

/**
 * Apply progressive bracket table to a given income.
 * Returns total tax owed on that income.
 * @param {Array<{rate:number, min:number, max:number}>} brackets
 * @param {number} income
 * @returns {number}
 */
function applyBrackets(brackets, income) {
  if (!brackets || brackets.length === 0 || income <= 0) return 0;
  let tax = 0;
  for (const { rate, min, max } of brackets) {
    if (income <= min) break;
    const taxableInBracket = Math.min(income, max) - min;
    tax += taxableInBracket * rate;
  }
  return tax;
}

/**
 * Get the effective bracket array for a given state + filing status.
 * When married === null, doubles the single-filer thresholds automatically.
 * @param {string} state   2-letter state code
 * @param {string} filing  'single' | 'married'
 * @returns {Array<{rate:number, min:number, max:number}>}
 */
function getBrackets(state, filing) {
  const data = STATE_TAX_DATA[state];
  if (!data || data.type === 'none') return [];

  if (filing === FILING_STATUSES.MARRIED) {
    if (data.married !== null) return data.married;
    // Auto-double single thresholds for MFJ
    return data.single.map(b => ({
      rate: b.rate,
      min:  b.min  === 0        ? 0        : b.min  * 2,
      max:  b.max  === Infinity ? Infinity : b.max  * 2,
    }));
  }
  return data.single;
}

/**
 * Calculate state income tax on rental income using the stacking method.
 *
 * The stacking method: rental income sits on top of MAGI, so the tax it
 * incurs is: tax(MAGI + netRentalIncome) − tax(MAGI)
 * This correctly handles bracket crossings that a flat marginal rate misses.
 *
 * @param {Object} params
 * @param {string}  params.state            2-letter state code (e.g. 'CA')
 * @param {number}  params.magi             User's non-rental MAGI (USD)
 * @param {number}  params.netRentalIncome  Net taxable rental income (USD)
 * @param {string}  params.filingStatus     'single' | 'married'
 * @param {number}  [params.localTaxRate]   Additive local income tax rate (0–1 decimal, default 0)
 *
 * @returns {{
 *   stateTax:      number,   // state income tax on rental income
 *   localTax:      number,   // local income tax on rental income
 *   totalTax:      number,   // stateTax + localTax
 *   effectiveRate: number,   // totalTax / netRentalIncome (0–1)
 *   marginalRate:  number,   // highest bracket rate that applies to rental income
 *   noTaxState:    boolean,  // true if state has no income tax
 *   stateName:     string,   // full state name
 * }}
 */
export function calcStateTax({
  state,
  magi            = 0,
  netRentalIncome = 0,
  filingStatus    = FILING_STATUSES.SINGLE,
  localTaxRate    = 0,
}) {
  const stateCode = (state || '').toUpperCase();
  const data = STATE_TAX_DATA[stateCode];

  // Unknown state or no-tax state
  if (!data || data.type === 'none' || NO_TAX_STATES.has(stateCode)) {
    return {
      stateTax:      0,
      localTax:      0,
      totalTax:      0,
      effectiveRate: 0,
      marginalRate:  0,
      noTaxState:    true,
      stateName:     data?.name || stateCode,
    };
  }

  if (netRentalIncome <= 0) {
    return {
      stateTax:      0,
      localTax:      0,
      totalTax:      0,
      effectiveRate: 0,
      marginalRate:  0,
      noTaxState:    false,
      stateName:     data.name,
    };
  }

  const brackets = getBrackets(stateCode, filingStatus);
  const magiSafe = Math.max(0, magi);

  // Stacking method — tax the rental income at the marginal rates it actually occupies
  const taxWithRental    = applyBrackets(brackets, magiSafe + netRentalIncome);
  const taxWithoutRental = applyBrackets(brackets, magiSafe);
  const stateTax         = Math.max(0, taxWithRental - taxWithoutRental);

  // Local tax applies to rental income at a flat additive rate
  const localRate = Math.max(0, localTaxRate || 0);
  const localTax  = netRentalIncome * localRate;
  const totalTax  = stateTax + localTax;

  // Marginal rate: the rate of the highest bracket touched by rental income
  const topOfRental = magiSafe + netRentalIncome;
  let marginalRate  = 0;
  for (const { rate, min } of brackets) {
    if (topOfRental > min) marginalRate = rate;
  }

  const effectiveRate = netRentalIncome > 0 ? totalTax / netRentalIncome : 0;

  return {
    stateTax,
    localTax,
    totalTax,
    effectiveRate,
    marginalRate,
    noTaxState: false,
    stateName:  data.name,
  };
}

// ─── Convenience helpers ──────────────────────────────────────────────────────

/**
 * Returns an array of { code, name } for all states, sorted alphabetically by name.
 * Useful for populating a state dropdown.
 */
export function getStateOptions() {
  return Object.entries(STATE_TAX_DATA)
    .map(([code, data]) => ({ code, name: data.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Returns the top marginal rate for a state (useful for quick display).
 * @param {string} state
 * @param {string} filingStatus
 * @returns {number} rate as decimal (e.g. 0.133 for CA)
 */
export function getTopMarginalRate(state, filingStatus = FILING_STATUSES.SINGLE) {
  const stateCode = (state || '').toUpperCase();
  const brackets  = getBrackets(stateCode, filingStatus);
  if (!brackets || brackets.length === 0) return 0;
  return brackets[brackets.length - 1].rate;
}
