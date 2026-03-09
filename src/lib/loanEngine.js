// ─── Loan Recommendation Engine ──────────────────────────────────────────────
// Expert-level loan matching for 2-4 unit multifamily properties.
// Mirrors the knowledge depth of a licensed loan officer.

export const LOAN_TYPES = {
  CONVENTIONAL: 'conventional',
  FHA:          'fha',
  VA:           'va',
  JUMBO:        'jumbo',
  FHA_203K:     'fha_203k',
  HOMESTYLE:    'homestyle',
  CHOICE_RENO:  'choice_reno',
  HOMEREADY:    'homeready',
  HOME_POSSIBLE:'home_possible',
  DSCR:         'dscr',
  BANK_STMT:    'bank_stmt',
  HARD_MONEY:   'hard_money',
};

// ─── Loan Metadata ────────────────────────────────────────────────────────────
export const LOAN_CATALOG = {
  [LOAN_TYPES.CONVENTIONAL]: {
    name: 'Conventional Loan',
    shortName: 'Conventional',
    category: 'Owner-Occupied & Investor',
    icon: '🏛️',
    tagline: 'The gold standard — flexible, widely available, best rates when you qualify',
    minCredit: 620,
    borderlineCredit: 660,
    downPaymentOO: { '2unit': 5, '3unit': 5, '4unit': 5 },
    downPaymentInv: { '2unit': 20, '3unit': 25, '4unit': 25 },
    maxDTI: 45,
    loanLimits2026: { standard: { '1unit':806500,'2unit':1032650,'3unit':1248150,'4unit':1551250 } },
    mi: 'PMI required if < 20% down; cancellable at 80% LTV',
    rate: 'Best available rate — at-market',
    ratePremium: 0,
    renovation: false,
    assumable: false,
    selfEmployedFriendly: 'standard',
    pros: [
      'Lowest rates when credit score ≥ 720',
      'PMI cancels at 80% LTV — FHA mortgage insurance never cancels',
      'Most lenders offer it — maximum competition keeps rates down',
      '5% down available for owner-occupied 2-4 units (Fannie Mae Nov 2023 update)',
    ],
    cons: [
      'Stricter qualification than FHA — DTI and credit scrutinized more tightly',
      'Investor purchases require 20–25% down',
      'Higher LLPAs (rate hits) if credit score is under 700',
    ],
    whoItsFor: 'Best for buyers with good credit (680+) who want the lowest long-term cost. Owner-occupants can put as little as 5% down on a 2-4 unit.',
    notEligible: [],
    borderlineWarnings: {
      credit: 'Credit scores between 620–659 will face significant rate add-ons (LLPAs) that can add 0.5–1.5% to your rate. FHA may actually be cheaper in this range.',
      dti: 'DTI between 43–45% may require compensating factors (reserves, high credit score) to get approved.',
    },
  },

  [LOAN_TYPES.FHA]: {
    name: 'FHA Loan',
    shortName: 'FHA',
    category: 'Owner-Occupied Only',
    icon: '🏠',
    tagline: 'The most accessible path to owner-occupied multifamily investing',
    minCredit: 580,
    borderlineCredit: 620,
    downPaymentOO: { '2unit': 3.5, '3unit': 3.5, '4unit': 3.5 },
    downPaymentInv: null, // Not available for non-OO investment
    maxDTI: 57,
    loanLimits2026: { standard: { '1unit':524225,'2unit':671200,'3unit':811150,'4unit':1008300 }, highCost: { '2unit':1548975 } },
    mi: 'Upfront MIP 1.75% + Annual MIP 0.55–0.85% — does NOT cancel for most borrowers',
    rate: 'Slightly above conventional (0–0.25%)',
    ratePremium: 0.15,
    renovation: false,
    assumable: true,
    selfEmployedFriendly: 'standard',
    pros: [
      '3.5% down payment — lowest entry point for owner-occupied 2-4 unit',
      'Accepts credit scores down to 580 (with 3.5% down)',
      'More flexible DTI — up to 57% with strong compensating factors',
      'Assumable loan — significant advantage if you sell when rates are high',
      'Rental income from other units can offset your mortgage payment for qualification',
    ],
    cons: [
      'Mortgage insurance (MIP) is permanent for most FHA loans — adds $150–$400/mo',
      'Lower loan limits than conventional — may not cover higher-priced markets',
      'Owner-occupied only — you must live in one unit',
      'Property must meet FHA minimum property standards — some fixer-uppers won\'t qualify',
    ],
    whoItsFor: 'First-time buyers and those with lower credit scores who want to "house hack" — live in one unit and rent the others to offset your mortgage.',
    notEligible: ['investor'],
    borderlineWarnings: {
      credit: 'Credit scores 580–619 require 10% down instead of 3.5%. Scores under 580 are ineligible.',
    },
  },

  [LOAN_TYPES.VA]: {
    name: 'VA Loan',
    shortName: 'VA',
    category: 'Veterans & Active Military (OO)',
    icon: '⭐',
    tagline: 'The best loan most veterans don\'t know they can use for multifamily',
    minCredit: 620,
    borderlineCredit: 640,
    downPaymentOO: { '2unit': 0, '3unit': 0, '4unit': 0 },
    downPaymentInv: null,
    maxDTI: 55,
    loanLimits2026: { standard: { '2unit': 'No limit (full entitlement)' } },
    mi: 'No PMI — ever. VA Funding Fee (1.25–3.3%) applies instead, can be financed',
    rate: 'At or below conventional market rate',
    ratePremium: -0.1,
    renovation: false,
    assumable: true,
    selfEmployedFriendly: 'standard',
    pros: [
      '0% down payment — no other loan offers this on 2-4 unit investment properties',
      'No PMI ever — saves $200–$600/month vs FHA',
      'Rates are typically equal to or below conventional',
      'No loan limits for veterans with full entitlement',
      'Assumable by qualified buyers when you sell',
    ],
    cons: [
      'Must be a veteran, active duty, or eligible surviving spouse — not for everyone',
      'Owner-occupied required — must live in one unit',
      'VA Funding Fee (1.25–3.3%) required unless exempt (disability rating)',
      'Property must meet VA Minimum Property Requirements',
    ],
    whoItsFor: 'Any eligible veteran who wants to house-hack. This is the single best wealth-building loan available — 0% down, no PMI, at-market rates.',
    notEligible: ['investor', 'non-veteran'],
    borderlineWarnings: {},
  },

  [LOAN_TYPES.JUMBO]: {
    name: 'Jumbo Loan',
    shortName: 'Jumbo',
    category: 'Owner-Occupied & Investor',
    icon: '💎',
    tagline: 'For high-value properties that exceed conforming loan limits',
    minCredit: 700,
    borderlineCredit: 720,
    downPaymentOO: { '2unit': 10, '3unit': 15, '4unit': 20 },
    downPaymentInv: { '2unit': 25, '3unit': 30, '4unit': 30 },
    maxDTI: 43,
    loanLimits2026: { standard: { note: 'Above conforming limits — typically $1M+' } },
    mi: 'No PMI typically, but lenders compensate with higher rates',
    rate: 'At or slightly above conventional (varies by lender)',
    ratePremium: 0.25,
    renovation: false,
    assumable: false,
    selfEmployedFriendly: 'flexible',
    pros: [
      'Required when purchase price exceeds conforming limits',
      'Some lenders offer competitive rates on well-qualified borrowers',
      'No loan limit ceiling',
    ],
    cons: [
      'Stricter qualification — 700+ credit score typically required',
      'Larger down payment required (10–30%)',
      'Fewer lenders, less competitive rate shopping',
      'More complex underwriting, more reserves required (12 months typical)',
    ],
    whoItsFor: 'Buyers in high-cost markets where the purchase price exceeds conforming loan limits ($1M+). Required, not optional.',
    notEligible: [],
    borderlineWarnings: {
      credit: 'Most jumbo lenders require 720+ for competitive rates. 700–719 range will see significant rate premiums.',
    },
  },

  [LOAN_TYPES.FHA_203K]: {
    name: 'FHA 203(k) Renovation Loan',
    shortName: 'FHA 203(k)',
    category: 'Owner-Occupied Renovation',
    icon: '🔨',
    tagline: 'Buy AND renovate in one loan — the fixer-upper path for owner-occupants',
    minCredit: 580,
    borderlineCredit: 620,
    downPaymentOO: { '2unit': 3.5, '3unit': 3.5, '4unit': 3.5 },
    downPaymentInv: null,
    maxDTI: 57,
    loanLimits2026: { standard: { '2unit': 671200, note: 'Based on ARV (after-repair value)' } },
    mi: 'Same as FHA — Upfront 1.75% + permanent annual MIP',
    rate: '0.5–1% above standard FHA',
    ratePremium: 0.75,
    renovation: true,
    renovationDetails: 'Standard: $5K–$35K renovation. Limited 203(k): full renovations with HUD consultant required',
    assumable: true,
    selfEmployedFriendly: 'standard',
    pros: [
      'Finance purchase AND renovation in a single loan — no construction loan needed',
      '3.5% down based on the AFTER-repair value',
      'Can finance up to $35K in repairs (Limited) or full gut renovation (Standard)',
      'Great for buying underpriced fixer-uppers and forcing appreciation',
    ],
    cons: [
      'Requires a HUD-approved consultant for Standard 203(k)',
      'Slower closing — 45–60 days vs 30 for standard FHA',
      'More complex process — not all lenders offer it',
      'Property must be owner-occupied',
    ],
    whoItsFor: 'Owner-occupants buying a fixer-upper who want to finance repairs into the mortgage. Pairs especially well with house-hacking a 2-4 unit that needs work.',
    notEligible: ['investor', 'non-renovation'],
    borderlineWarnings: {},
  },

  [LOAN_TYPES.HOMESTYLE]: {
    name: 'HomeStyle Renovation (Fannie Mae)',
    shortName: 'HomeStyle Reno',
    category: 'OO & Investor Renovation',
    icon: '🏗️',
    tagline: 'The conventional alternative to FHA 203(k) — no mortgage insurance permanence',
    minCredit: 620,
    borderlineCredit: 660,
    downPaymentOO: { '2unit': 5, '3unit': 15, '4unit': 15 },
    downPaymentInv: { '2unit': 20, note: '1-unit investment only for investor use' },
    maxDTI: 45,
    loanLimits2026: { standard: { '2unit': 1032650, '3unit': 1248150, '4unit': 1551250, highCost: 2403100 } },
    mi: 'PMI if < 20% down; cancellable based on as-completed value',
    rate: 'At-market + 0.125–0.375% premium',
    ratePremium: 0.25,
    renovation: true,
    renovationDetails: 'Up to 75% of ARV; no minimum/maximum; luxury improvements allowed (pools, etc.)',
    assumable: false,
    selfEmployedFriendly: 'standard',
    pros: [
      'Up to 75% of after-repair value financed — more renovation budget than 203(k)',
      'Luxury improvements allowed (pools, built-ins, outdoor kitchens) unlike FHA 203(k)',
      'PMI cancellable once you reach 80% LTV based on completed value',
      'Can be used for investment property renovation (1-unit)',
    ],
    cons: [
      'Requires a lender with Fannie Mae special approval to deliver pre-completion',
      'More complex than standard conventional loan',
      'Higher rate than standard conventional',
    ],
    whoItsFor: 'Buyers who want renovation financing but prefer conventional terms over FHA. Best when you want higher-end renovations or your credit disqualifies you from FHA.',
    notEligible: ['non-renovation'],
    borderlineWarnings: {
      credit: 'Scores below 660 will face Loan Level Price Adjustments that make this loan significantly more expensive.',
    },
  },

  [LOAN_TYPES.CHOICE_RENO]: {
    name: 'CHOICERenovation (Freddie Mac)',
    shortName: 'CHOICERenovation',
    category: 'OO & Investor Renovation',
    icon: '🔧',
    tagline: 'Freddie Mac\'s renovation loan — same concept as HomeStyle with slight differences',
    minCredit: 620,
    borderlineCredit: 660,
    downPaymentOO: { '2unit': 5, '3unit': 15, '4unit': 15 },
    downPaymentInv: { '2unit': 20 },
    maxDTI: 45,
    loanLimits2026: { standard: { note: 'Same as Freddie Mac conforming limits' } },
    mi: 'PMI if < 20% down; cancellable',
    rate: 'At-market + 0.125–0.375% premium',
    ratePremium: 0.25,
    renovation: true,
    renovationDetails: 'Luxury improvements allowed; disaster repair eligible',
    assumable: false,
    selfEmployedFriendly: 'standard',
    pros: [
      'Luxury renovation financing (pools, spas, outdoor kitchens)',
      'Disaster remediation eligible — unique to CHOICERenovation',
      'PMI cancellable like conventional',
    ],
    cons: [
      'Fewer lenders offer it vs HomeStyle Renovation',
      'Same complexity as HomeStyle — not a quick loan to close',
    ],
    whoItsFor: 'Alternative to HomeStyle when your lender prefers Freddie Mac products. Nearly identical in structure and terms.',
    notEligible: ['non-renovation'],
    borderlineWarnings: {},
  },

  [LOAN_TYPES.HOMEREADY]: {
    name: 'HomeReady / Home Possible',
    shortName: 'HomeReady',
    category: 'Income-Qualified Owner-Occupied',
    icon: '🌱',
    tagline: 'Reduced PMI and better pricing for income-qualified buyers',
    minCredit: 620,
    borderlineCredit: 640,
    downPaymentOO: { '2unit': 5, '3unit': 5, '4unit': 5 },
    downPaymentInv: null,
    maxDTI: 45,
    loanLimits2026: { standard: { note: 'Same as conforming limits; income must be ≤ 80% AMI' } },
    incomeLimit: '≤ 80% Area Median Income (AMI)',
    mi: 'Reduced PMI rate vs standard conventional; cancellable',
    rate: 'At-market with reduced LLPAs for income-eligible borrowers',
    ratePremium: -0.1,
    renovation: false,
    assumable: false,
    selfEmployedFriendly: 'standard',
    pros: [
      'Reduced PMI cost vs standard conventional — saves $50–$150/month',
      'LLPAs waived or reduced — better rate for lower-income buyers',
      'Can use boarder income or rental income from ADUs to qualify',
    ],
    cons: [
      'Income limit: household income must be ≤ 80% AMI — many buyers don\'t qualify',
      'Owner-occupied only',
      'Income limits vary by county — need to verify for your specific market',
    ],
    whoItsFor: 'Moderate-income buyers who qualify under AMI limits. If you qualify, this is always better than standard conventional on pricing.',
    notEligible: ['investor', 'high-income'],
    borderlineWarnings: {},
  },

  [LOAN_TYPES.DSCR]: {
    name: 'DSCR Investment Loan',
    shortName: 'DSCR',
    category: 'Investor Only',
    icon: '📊',
    tagline: 'Qualify on the property\'s income, not yours — the investor\'s loan of choice',
    minCredit: 620,
    borderlineCredit: 680,
    downPaymentOO: null,
    downPaymentInv: { '2unit': 20, '3unit': 25, '4unit': 25 },
    maxDTI: null, // No DTI — qualifies on DSCR ratio
    dscrMin: 1.0,
    dscrPreferred: 1.25,
    loanLimits2026: { standard: { note: 'Varies by lender — typically up to $3M+' } },
    mi: 'None',
    rate: '1–2% above conventional',
    ratePremium: 1.5,
    renovation: false,
    assumable: false,
    selfEmployedFriendly: 'excellent',
    pros: [
      'No personal income verification — qualifies based on rent vs mortgage (DSCR)',
      'No DTI calculation — perfect for self-employed or high net worth investors',
      'Fastest growing loan type for investors (+52% YoY in 2024)',
      'Can close in entity (LLC) — liability protection',
      'No limit on number of properties financed (unlike conventional 10-property cap)',
    ],
    cons: [
      '20–25% down payment required',
      '1–2% rate premium above conventional',
      'Investor only — cannot be used for primary residence',
      'DSCR ratio typically must be ≥ 1.0 (some lenders allow 0.75 with higher down)',
    ],
    whoItsFor: 'Investors who want to qualify based on property cash flow, not personal income. Ideal for self-employed investors, those with many properties, or complex tax returns.',
    notEligible: ['owner-occupied'],
    borderlineWarnings: {
      dscr: 'A DSCR below 1.0 means the property doesn\'t cash-flow enough to cover the mortgage. Some lenders allow this with 30%+ down, but rates will be significantly higher.',
      credit: 'DSCR loans at 620–659 credit score will carry significant rate premiums. 700+ is strongly recommended.',
    },
  },

  [LOAN_TYPES.BANK_STMT]: {
    name: 'Bank Statement Loan',
    shortName: 'Bank Statement',
    category: 'Non-QM Investor / Self-Employed',
    icon: '🏦',
    tagline: 'Prove your income with bank statements, not tax returns',
    minCredit: 620,
    borderlineCredit: 680,
    downPaymentOO: null,
    downPaymentInv: { '2unit': 20, '3unit': 25, '4unit': 30 },
    maxDTI: null,
    loanLimits2026: { standard: { note: 'Up to $3M+ — varies by lender' } },
    mi: 'None',
    rate: '1.5–3% above conventional',
    ratePremium: 2.0,
    renovation: false,
    assumable: false,
    selfEmployedFriendly: 'excellent',
    pros: [
      'No W-2s or tax returns — income proven via 12–24 months of bank statements',
      'Ideal for self-employed investors who write off most income on taxes',
      'Can close in LLC',
    ],
    cons: [
      '1.5–3% rate premium is significant — costs more over time',
      '20–30% down payment required',
      'Fewer lenders — less rate competition',
      'Underwriting can be inconsistent across lenders',
    ],
    whoItsFor: 'Self-employed investors whose tax returns show low income due to business deductions, but whose bank deposits demonstrate real cash flow.',
    notEligible: ['owner-occupied', 'w2-employee'],
    borderlineWarnings: {
      credit: 'Bank statement loans at 620–679 credit score carry very high rate premiums (3%+). Consider waiting to improve credit first.',
    },
  },

  [LOAN_TYPES.HARD_MONEY]: {
    name: 'Hard Money / Bridge Loan',
    shortName: 'Hard Money',
    category: 'Short-Term Investor',
    icon: '⚡',
    tagline: 'Fast capital for value-add plays — buy, renovate, then refinance to DSCR',
    minCredit: 600,
    borderlineCredit: 640,
    downPaymentOO: null,
    downPaymentInv: { '2unit': 20, '3unit': 25, '4unit': 30 },
    maxDTI: null,
    loanLimits2026: { standard: { note: 'Asset-based — typically 65–75% of ARV' } },
    mi: 'None',
    rate: '8–15% total; interest-only payments',
    ratePremium: 5.0,
    renovation: true,
    renovationDetails: 'Can fund purchase + renovation budget in a single loan based on ARV',
    assumable: false,
    selfEmployedFriendly: 'excellent',
    pros: [
      'Approves primarily on property value (ARV) — easy to qualify',
      'Can close in 5–15 business days vs 30–45 for conventional',
      'Funds renovation budget alongside purchase price',
      'Interest-only payments keep cash flow manageable during renovation',
      'No limit on number of properties',
    ],
    cons: [
      '8–15% interest rate — very expensive; this is short-term capital only',
      'Loan term 6–24 months — must refinance or sell before term ends',
      'Origination fees: 2–5 points upfront',
      'Not a long-term hold strategy on its own',
    ],
    whoItsFor: 'Investors executing a value-add strategy: buy distressed property, renovate, stabilize rents, then refinance into a permanent DSCR loan.',
    notEligible: ['owner-occupied', 'long-term-hold'],
    borderlineWarnings: {},
  },
};

// ─── Recommendation Engine ────────────────────────────────────────────────────
// Scoring: 0 = ineligible, 1–3 = possible with caveats, 4–5 = strong match
// Returns: { recommended: loanType, scores: { loanType: { score, warnings, reasons } } }

export function runRecommendationEngine(answers, deal) {
  const {
    ownerOccupied,    // boolean
    isVeteran,        // boolean
    creditRange,      // '< 580' | '580-619' | '620-659' | '660-699' | '700-739' | '740+'
    downPct,          // number (percentage)
    needsRenovation,  // boolean
    selfEmployed,     // boolean
    purchasePrice,    // number
    numUnits,         // 2 | 3 | 4
    monthlyRent,      // number (total expected rent)
    lowIncome,        // boolean (income ≤ 80% AMI)
  } = answers;

  // Determine credit score midpoint for calculations
  const creditMidpoint = {
    '< 580': 560, '580-619': 599, '620-659': 639,
    '660-699': 679, '700-739': 719, '740+': 760
  }[creditRange] || 680;

  const unitKey = `${numUnits}unit`;

  // 2026 conforming limits for unit count
  const conformingLimits = { '2unit': 1032650, '3unit': 1248150, '4unit': 1551250 };
  const fhaLimits        = { '2unit': 671200, '3unit': 811150, '4unit': 1008300 };
  const isJumbo = purchasePrice > conformingLimits[unitKey];
  const isFHAJumbo = purchasePrice > fhaLimits[unitKey];

  // Estimate DSCR if we have rent data
  // Using approximate PITI at 7.25% 30yr as placeholder
  const loanAmt = purchasePrice * (1 - downPct / 100);
  const monthlyPITI = loanAmt * (0.0725 / 12) / (1 - Math.pow(1 + 0.0725 / 12, -360)) * 1.2; // +20% for taxes/insurance
  const dscrRatio = monthlyRent > 0 ? monthlyRent / (loanAmt * (0.0725/12) / (1 - Math.pow(1+0.0725/12,-360))) : null;

  const scores = {};

  // ─── IMPORTANT: Down payment philosophy ──────────────────────────────────────
  // Down payment is a PREFERENCE, not an immutable constraint (except VA 0% which
  // is a feature). A user saying "5% down" doesn't disqualify them from a 20%-down
  // loan — they could buy a cheaper house, save more, or use gift funds.
  // Hard disqualifiers are ONLY: wrong occupancy type, credit below program floor,
  // veteran status, loan limit exceeded, renovation mismatch.
  // Down payment below program minimum = WARNING + score reduction, never score = 0
  // (except investor loans where < 20% is a genuine program ineligibility).

  // ─── Conventional ────────────────────────────────────────────────────────────
  {
    let score = 5;
    const warnings = [];
    const reasons = [];

    // Hard gates: credit floor, loan limit
    if (creditMidpoint < 620)  { score = 0; reasons.push('Minimum 620 credit score required for conventional loans'); }
    else if (creditMidpoint < 660) { score = Math.min(score, 3); warnings.push(LOAN_CATALOG[LOAN_TYPES.CONVENTIONAL].borderlineWarnings.credit); }

    if (isJumbo) { score = 0; reasons.push('Purchase price exceeds conforming limits — Jumbo required'); }

    if (score > 0) {
      const minDown = ownerOccupied
        ? LOAN_CATALOG[LOAN_TYPES.CONVENTIONAL].downPaymentOO[unitKey]  // 5% OO
        : LOAN_CATALOG[LOAN_TYPES.CONVENTIONAL].downPaymentInv?.[unitKey]; // 20-25% investor

      if (!ownerOccupied && minDown == null) {
        score = 0; reasons.push('Conventional investor loans not available for this unit count');
      } else if (!ownerOccupied && downPct < (minDown || 20)) {
        // Investor: sub-20% is a real program constraint — reduce score significantly
        score = Math.min(score, 2);
        warnings.push(`Investor conventional loans require ${minDown}% down. You indicated ${downPct}% — you could qualify by increasing your down payment or buying at a lower price point.`);
      } else if (ownerOccupied && downPct < (minDown || 5)) {
        // OO: 5% floor, very achievable — light warning only
        score = Math.min(score, 4);
        warnings.push(`Conventional requires ${minDown}% down minimum for owner-occupied 2-4 units. You're close — this may mean adjusting your target price slightly.`);
      }

      // PMI note for OO sub-20%
      if (ownerOccupied && downPct < 20 && downPct >= (minDown || 5) && score > 0) {
        warnings.push(`With ${downPct}% down you'll pay PMI until you reach 20% equity — typically $100–$300/month, but it cancels (unlike FHA's permanent MIP).`);
      }
    }

    scores[LOAN_TYPES.CONVENTIONAL] = { score, warnings, reasons };
  }

  // ─── FHA ─────────────────────────────────────────────────────────────────────
  {
    let score = 5;
    const warnings = [];
    const reasons = [];

    // Hard gates: occupancy, loan limit, credit floor
    if (!ownerOccupied)          { score = 0; reasons.push('FHA requires owner-occupancy'); }
    else if (isFHAJumbo)         { score = 0; reasons.push('Purchase price exceeds FHA loan limits for this area'); }
    else {
      if (creditMidpoint < 580)  { score = 0; reasons.push('FHA requires minimum 580 credit score'); }
      else if (creditMidpoint < 620) {
        score = Math.min(score, 3);
        warnings.push('Credit scores 580–619 require 10% down instead of 3.5%. Scores below 580 are ineligible.');
        if (downPct < 10) {
          score = Math.min(score, 2);
          warnings.push(`With credit in the 580–619 range, FHA requires 10% down. You indicated ${downPct}% — you'd need to increase your down payment or improve your credit to 620+.`);
        }
      }
      if (creditMidpoint >= 620 && creditMidpoint < 660) {
        score = Math.min(score, 4);
        warnings.push(LOAN_CATALOG[LOAN_TYPES.FHA].borderlineWarnings.credit);
      }
      // FHA shines for lower credit buyers
      if (creditMidpoint < 660 && score > 0) {
        score = Math.min(score + 1, 5);
        reasons.push('FHA is often the most accessible option for credit scores below 660');
      }
      // 3.5% floor — just a note
      if (downPct < 3.5 && score > 0) {
        score = Math.min(score, 4);
        warnings.push('FHA requires a minimum of 3.5% down — one of the lowest available down payment thresholds.');
      }
    }

    scores[LOAN_TYPES.FHA] = { score, warnings, reasons };
  }

  // ─── VA ──────────────────────────────────────────────────────────────────────
  {
    let score = 5;
    const warnings = [];
    const reasons = [];

    if (!isVeteran)        { score = 0; reasons.push('VA loan requires veteran or active duty status'); }
    if (!ownerOccupied)    { score = 0; reasons.push('VA loan requires owner-occupancy'); }
    if (creditMidpoint < 620) { score = Math.min(score, 2); warnings.push('VA has no official minimum but most lenders require 620+'); }

    if (score > 0) {
      // VA is exceptional — boost score
      score = 5;
      reasons.push('0% down, no PMI, and at-market rates — the best available loan for eligible veterans');
    }

    scores[LOAN_TYPES.VA] = { score, warnings, reasons };
  }

  // ─── Jumbo ───────────────────────────────────────────────────────────────────
  {
    let score = isJumbo ? 5 : 0;
    const warnings = [];
    const reasons = [];

    if (!isJumbo) {
      reasons.push('Your purchase price is within conforming limits — a conventional loan will give you a better rate');
    } else {
      if (creditMidpoint < 700) { score = Math.min(score, 2); warnings.push(LOAN_CATALOG[LOAN_TYPES.JUMBO].borderlineWarnings.credit); }
      if (creditMidpoint < 680) { score = 0; reasons.push('Jumbo loans typically require 700+ credit score'); }

      const minDown = ownerOccupied
        ? LOAN_CATALOG[LOAN_TYPES.JUMBO].downPaymentOO[unitKey]
        : LOAN_CATALOG[LOAN_TYPES.JUMBO].downPaymentInv?.[unitKey];
      if (downPct < (minDown || 15)) {
        score = Math.min(score, 2);
        warnings.push(`Jumbo loans typically require ${minDown}% down for ${numUnits}-unit properties`);
      }
    }

    scores[LOAN_TYPES.JUMBO] = { score, warnings, reasons };
  }

  // ─── FHA 203(k) ──────────────────────────────────────────────────────────────
  {
    let score = 5;
    const warnings = [];
    const reasons = [];

    if (!ownerOccupied)    { score = 0; reasons.push('FHA 203(k) requires owner-occupancy'); }
    if (!needsRenovation)  { score = 0; reasons.push('FHA 203(k) is designed for properties needing renovation'); }
    if (isFHAJumbo)        { score = 0; reasons.push('Purchase price exceeds FHA loan limits'); }
    if (creditMidpoint < 580) { score = 0; reasons.push('Minimum 580 credit score required'); }
    else if (creditMidpoint < 620) { score = Math.min(score, 3); warnings.push('Credit 580–619 requires 10% down'); }

    scores[LOAN_TYPES.FHA_203K] = { score, warnings, reasons };
  }

  // ─── HomeStyle Renovation ────────────────────────────────────────────────────
  {
    let score = 5;
    const warnings = [];
    const reasons = [];

    if (!needsRenovation)  { score = 0; reasons.push('HomeStyle is designed for renovation financing'); }
    if (!ownerOccupied && numUnits > 2) { score = 0; reasons.push('HomeStyle investor use is limited to 1-unit properties'); }
    if (creditMidpoint < 620) { score = 0; reasons.push('Minimum 620 credit score required'); }
    else if (creditMidpoint < 660) { score = Math.min(score, 3); warnings.push(LOAN_CATALOG[LOAN_TYPES.HOMESTYLE].borderlineWarnings.credit); }
    if (isJumbo) { score = 0; reasons.push('Purchase price exceeds HomeStyle loan limits'); }

    const minDown = ownerOccupied
      ? LOAN_CATALOG[LOAN_TYPES.HOMESTYLE].downPaymentOO[unitKey]
      : LOAN_CATALOG[LOAN_TYPES.HOMESTYLE].downPaymentInv?.['2unit'];
    if (downPct < (minDown || 5)) { score = Math.min(score, 2); warnings.push(`Minimum ${minDown}% down required for ${numUnits}-unit HomeStyle`); }

    scores[LOAN_TYPES.HOMESTYLE] = { score, warnings, reasons };
  }

  // ─── CHOICERenovation ────────────────────────────────────────────────────────
  {
    let score = 4; // Slightly below HomeStyle — fewer lenders
    const warnings = [];
    const reasons = [];

    if (!needsRenovation)  { score = 0; reasons.push('CHOICERenovation is designed for renovation financing'); }
    if (!ownerOccupied && numUnits > 2) { score = 0; reasons.push('Investor use limited to 1-unit properties'); }
    if (creditMidpoint < 620) { score = 0; reasons.push('Minimum 620 credit score required'); }
    if (isJumbo) { score = 0; reasons.push('Purchase price exceeds conforming limits'); }
    reasons.push('Freddie Mac equivalent to HomeStyle — fewer lenders offer it');

    scores[LOAN_TYPES.CHOICE_RENO] = { score, warnings, reasons };
  }

  // ─── HomeReady ───────────────────────────────────────────────────────────────
  {
    let score = 5;
    const warnings = [];
    const reasons = [];

    if (!ownerOccupied) { score = 0; reasons.push('HomeReady requires owner-occupancy'); }
    if (!lowIncome)     { score = 0; reasons.push('HomeReady requires household income ≤ 80% Area Median Income'); }
    if (creditMidpoint < 620) { score = 0; reasons.push('Minimum 620 credit score required'); }
    if (isJumbo) { score = 0; reasons.push('Purchase price exceeds conforming limits'); }

    scores[LOAN_TYPES.HOMEREADY] = { score, warnings, reasons };
  }

  // ─── DSCR ────────────────────────────────────────────────────────────────────
  {
    let score = 5;
    const warnings = [];
    const reasons = [];

    if (ownerOccupied)    { score = 0; reasons.push('DSCR loans are for investors only'); }
    if (creditMidpoint < 620) { score = 0; reasons.push('Minimum 620 credit score required'); }
    else if (creditMidpoint < 680) { score = Math.min(score, 3); warnings.push(LOAN_CATALOG[LOAN_TYPES.DSCR].borderlineWarnings.credit); }

    const minDown = LOAN_CATALOG[LOAN_TYPES.DSCR].downPaymentInv?.[unitKey] || 20;
    if (downPct < minDown) { score = Math.min(score, 2); warnings.push(`DSCR loans require ${minDown}% down for ${numUnits}-unit properties`); }

    if (dscrRatio !== null && dscrRatio < 1.0) {
      score = Math.min(score, 2);
      warnings.push(LOAN_CATALOG[LOAN_TYPES.DSCR].borderlineWarnings.dscr + ` Your estimated DSCR is ${dscrRatio.toFixed(2)}.`);
    }

    if (selfEmployed && score > 0) {
      score = Math.min(score + 1, 5);
      reasons.push('DSCR is ideal for self-employed investors — no income docs required');
    }

    scores[LOAN_TYPES.DSCR] = { score, warnings, reasons };
  }

  // ─── Bank Statement ──────────────────────────────────────────────────────────
  {
    let score = 3; // Lower default — expensive loan
    const warnings = [];
    const reasons = [];

    if (ownerOccupied)     { score = 0; reasons.push('Bank statement loans are for investors only'); }
    if (!selfEmployed)     { score = 1; reasons.push('Bank statement loans are primarily for self-employed borrowers; if you have W-2 income, DSCR is a better option'); }
    if (creditMidpoint < 620) { score = 0; reasons.push('Minimum 620 credit score required'); }
    else if (creditMidpoint < 680) { score = Math.min(score, 2); warnings.push(LOAN_CATALOG[LOAN_TYPES.BANK_STMT].borderlineWarnings.credit); }

    const minDown = LOAN_CATALOG[LOAN_TYPES.BANK_STMT].downPaymentInv?.[unitKey] || 20;
    if (downPct < minDown) { score = Math.min(score, 1); warnings.push(`Minimum ${minDown}% down required`); }

    scores[LOAN_TYPES.BANK_STMT] = { score, warnings, reasons };
  }

  // ─── Hard Money ──────────────────────────────────────────────────────────────
  {
    let score = needsRenovation && !ownerOccupied ? 4 : 2;
    const warnings = [];
    const reasons = [];

    if (ownerOccupied)     { score = 0; reasons.push('Hard money is for investors only'); }
    if (!needsRenovation)  { score = Math.min(score, 2); reasons.push('Hard money/bridge is primarily used for value-add renovations; if not renovating, DSCR is better'); }
    if (creditMidpoint < 600) { score = Math.min(score, 1); warnings.push('Some hard money lenders have no credit requirement, but 600+ is standard'); }

    const minDown = LOAN_CATALOG[LOAN_TYPES.HARD_MONEY].downPaymentInv?.[unitKey] || 25;
    if (downPct < minDown) { score = Math.min(score, 2); warnings.push(`Most hard money lenders require ${minDown}%+ down (65–70% LTV max)`); }

    if (score > 0) reasons.push('Best for: buy distressed → renovate → refinance into DSCR loan ("BRRRR strategy")');

    scores[LOAN_TYPES.HARD_MONEY] = { score, warnings, reasons };
  }

  // ─── Find recommendation ─────────────────────────────────────────────────────
  const eligible = Object.entries(scores)
    .filter(([, v]) => v.score > 0)
    .sort(([, a], [, b]) => b.score - a.score);

  const recommended = eligible[0]?.[0] || null;

  return { recommended, scores, dscrRatio, isJumbo };
}

// ─── Adaptive question flow ───────────────────────────────────────────────────
// Returns the ordered list of questions to ask given current answers

export function getQuestionFlow(answers, deal) {
  const questions = [];
  const a = answers;

  // Q1: OO vs Investor (always ask — unless deal has ownerOccupied already)
  questions.push('ownerOccupied');

  // Q2: Are you a veteran? (only if OO)
  if (a.ownerOccupied !== false) {
    questions.push('isVeteran');
  }

  // Q3: Credit score range (always)
  questions.push('creditRange');

  // Q4: Down payment (always)
  questions.push('downPct');

  // Q5: Renovation? (always relevant)
  questions.push('needsRenovation');

  // Q6: Self-employed? (if investor or if credit is high and OO — affects DSCR/bank stmt)
  if (a.ownerOccupied === false) {
    questions.push('selfEmployed');
  }

  // Q7: Income limit? (only if OO and credit >= 620 — HomeReady eligibility)
  if (a.ownerOccupied === true && (a.creditRange && a.creditRange !== '< 580')) {
    questions.push('lowIncome');
  }

  return questions;
}

// ─── Question definitions ─────────────────────────────────────────────────────
export const QUESTIONS = {
  ownerOccupied: {
    id: 'ownerOccupied',
    text: 'Will you live in one of the units?',
    subtext: 'This is the most important question — it determines which loan programs you\'re eligible for.',
    type: 'choice',
    options: [
      { value: true,  label: 'Yes — I\'ll live there', icon: '🏠', desc: 'Owner-occupied ("house hacking")' },
      { value: false, label: 'No — pure investment', icon: '📈', desc: 'Investor / non-owner-occupied' },
    ],
  },
  isVeteran: {
    id: 'isVeteran',
    text: 'Are you a veteran or active duty military?',
    subtext: 'VA loans offer the best terms available — 0% down, no PMI, at-market rates.',
    type: 'choice',
    options: [
      { value: true,  label: 'Yes — I\'m eligible for VA', icon: '⭐', desc: 'Veteran, active duty, or eligible surviving spouse' },
      { value: false, label: 'No', icon: '—', desc: 'Not applicable' },
    ],
  },
  creditRange: {
    id: 'creditRange',
    text: 'What\'s your estimated credit score?',
    subtext: 'A rough range is fine. This determines which loan programs you qualify for and at what cost.',
    type: 'choice',
    options: [
      { value: '< 580',   label: 'Below 580',  icon: '⚠️', desc: 'Limited options' },
      { value: '580-619', label: '580–619',     icon: '🟡', desc: 'FHA eligible (10% down)' },
      { value: '620-659', label: '620–659',     icon: '🟡', desc: 'Most loans available with rate hits' },
      { value: '660-699', label: '660–699',     icon: '🟢', desc: 'Good — standard qualification' },
      { value: '700-739', label: '700–739',     icon: '🟢', desc: 'Very good — better rates' },
      { value: '740+',    label: '740 and above', icon: '⭐', desc: 'Excellent — best available rates' },
    ],
  },
  downPct: {
    id: 'downPct',
    text: 'What is the most you could put down?',
    subtext: "Think of this as your maximum available — not what you have to use. Some loans require minimums, and we'll flag if you're below them.",
    type: 'slider',
    min: 0,
    max: 40,
    step: 1,
    unit: '%',
    default: 20,
  },
  needsRenovation: {
    id: 'needsRenovation',
    text: 'Does the property need significant renovation?',
    subtext: 'Significant = $10,000+ in repairs or upgrades. This opens renovation loan options.',
    type: 'choice',
    options: [
      { value: true,  label: 'Yes — fixer-upper', icon: '🔨', desc: 'Property needs substantial work' },
      { value: false, label: 'No — move-in ready', icon: '✅', desc: 'Minor cosmetic work only or turnkey' },
    ],
  },
  selfEmployed: {
    id: 'selfEmployed',
    text: 'Are you self-employed or have non-traditional income?',
    subtext: 'This affects which Non-QM loan options (DSCR, bank statement) are most relevant to you.',
    type: 'choice',
    options: [
      { value: true,  label: 'Yes — self-employed', icon: '💼', desc: 'Business owner, freelancer, or 1099 income' },
      { value: false, label: 'No — W-2 employee', icon: '👔', desc: 'Traditional employment income' },
    ],
  },
  lowIncome: {
    id: 'lowIncome',
    text: 'Is your household income below 80% of your area\'s median income?',
    subtext: 'If yes, you may qualify for HomeReady or Home Possible — reduced PMI and better rates.',
    type: 'choice',
    options: [
      { value: true,  label: 'Yes — income-qualified', icon: '🌱', desc: 'Unlocks HomeReady / Home Possible pricing' },
      { value: false, label: 'No — above 80% AMI', icon: '—', desc: 'Standard conventional pricing applies' },
      { value: null,  label: 'Not sure', icon: '❓', desc: 'I\'ll check with a lender' },
    ],
  },
};
