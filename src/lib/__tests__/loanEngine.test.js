import { describe, test, expect } from 'vitest';
import {
  LOAN_TYPES,
  LOAN_CATALOG,
  runRecommendationEngine,
  getQuestionFlow,
  QUESTIONS,
} from '../loanEngine.js';

const baseAnswers = {
  ownerOccupied: true,
  isVeteran: false,
  creditRange: '700-739',
  downPct: 25,
  needsRenovation: false,
  selfEmployed: false,
  purchasePrice: 400000,
  numUnits: 2,
  monthlyRent: 3000,
};

const baseDeal = { address: '' };

// ─── LOAN_CATALOG integrity ────────────────────────────────────────────────

describe('LOAN_CATALOG integrity', () => {
  test('every LOAN_TYPES value with a catalog entry has required fields', () => {
    for (const type of Object.values(LOAN_TYPES)) {
      if (!LOAN_CATALOG[type]) continue; // HOME_POSSIBLE covered by HOMEREADY entry
      expect(LOAN_CATALOG[type].name).toBeTruthy();
      expect(LOAN_CATALOG[type].shortName).toBeTruthy();
      expect(typeof LOAN_CATALOG[type].minCredit).toBe('number');
      expect(LOAN_CATALOG[type].icon).toBeTruthy();
    }
  });

  test('HOME_POSSIBLE has no separate catalog entry (covered by HOMEREADY)', () => {
    expect(LOAN_CATALOG[LOAN_TYPES.HOMEREADY]).toBeDefined();
    expect(LOAN_CATALOG[LOAN_TYPES.HOME_POSSIBLE]).toBeUndefined();
  });
});

// ─── Owner-occupied + veteran ──────────────────────────────────────────────

describe('runRecommendationEngine — OO + veteran', () => {
  test('VA scores 5 for OO veteran with good credit', () => {
    const r = runRecommendationEngine(
      { ...baseAnswers, isVeteran: true },
      baseDeal,
    );
    expect(r.scores[LOAN_TYPES.VA].score).toBe(5);
    expect(r.scores[LOAN_TYPES.VA].reasons.length).toBeGreaterThan(0);
  });
});

// ─── Owner-occupied + non-vet + excellent credit + 20%+ down ───────────────

describe('runRecommendationEngine — OO conventional', () => {
  test('conventional recommended for OO non-vet with 740+ credit and 25% down', () => {
    const r = runRecommendationEngine(
      { ...baseAnswers, creditRange: '740+' },
      baseDeal,
    );
    expect(r.recommended).toBe(LOAN_TYPES.CONVENTIONAL);
    expect(r.scores[LOAN_TYPES.CONVENTIONAL].score).toBe(5);
  });
});

// ─── OO + low credit → FHA ─────────────────────────────────────────────────

describe('runRecommendationEngine — OO low credit', () => {
  test('FHA recommended for OO with 580-619 credit', () => {
    const r = runRecommendationEngine(
      { ...baseAnswers, creditRange: '580-619', downPct: 10 },
      baseDeal,
    );
    expect(r.scores[LOAN_TYPES.FHA].score).toBeGreaterThan(0);
    expect(r.scores[LOAN_TYPES.FHA].score).toBeGreaterThanOrEqual(
      r.scores[LOAN_TYPES.CONVENTIONAL].score,
    );
  });
});

// ─── Investor + self-employed + good credit → DSCR ─────────────────────────

describe('runRecommendationEngine — investor DSCR', () => {
  test('DSCR scores high for investor, self-employed, good credit, 25% down', () => {
    const r = runRecommendationEngine(
      { ...baseAnswers, ownerOccupied: false, selfEmployed: true },
      baseDeal,
    );
    expect(r.scores[LOAN_TYPES.DSCR].score).toBeGreaterThanOrEqual(4);
    expect(r.scores[LOAN_TYPES.FHA].score).toBe(0);
    expect(r.scores[LOAN_TYPES.VA].score).toBe(0);
  });
});

// ─── Investor + W2 + 25% down → conventional ──────────────────────────────

describe('runRecommendationEngine — investor conventional', () => {
  test('conventional recommended for investor W2 with 25% down and good credit', () => {
    const r = runRecommendationEngine(
      { ...baseAnswers, ownerOccupied: false, selfEmployed: false },
      baseDeal,
    );
    expect(r.recommended).toBe(LOAN_TYPES.CONVENTIONAL);
    expect(r.scores[LOAN_TYPES.CONVENTIONAL].score).toBeGreaterThanOrEqual(4);
  });
});

// ─── Credit < 580 ──────────────────────────────────────────────────────────

describe('runRecommendationEngine — very low credit', () => {
  test('credit < 580: most loans score 0', () => {
    const r = runRecommendationEngine(
      { ...baseAnswers, creditRange: '< 580', ownerOccupied: false, downPct: 25 },
      baseDeal,
    );
    expect(r.scores[LOAN_TYPES.CONVENTIONAL].score).toBe(0);
    expect(r.scores[LOAN_TYPES.FHA].score).toBe(0);
    expect(r.scores[LOAN_TYPES.DSCR].score).toBe(0);
  });
});

// ─── Renovation needed → FHA 203(k) / HomeStyle surfaced ───────────────────

describe('runRecommendationEngine — renovation', () => {
  test('FHA 203(k) scores > 0 for OO + renovation + good credit', () => {
    const r = runRecommendationEngine(
      { ...baseAnswers, needsRenovation: true },
      baseDeal,
    );
    expect(r.scores[LOAN_TYPES.FHA_203K].score).toBeGreaterThan(0);
  });

  test('HomeStyle scores > 0 for OO + renovation + good credit', () => {
    const r = runRecommendationEngine(
      { ...baseAnswers, needsRenovation: true },
      baseDeal,
    );
    expect(r.scores[LOAN_TYPES.HOMESTYLE].score).toBeGreaterThan(0);
  });
});

// ─── Jumbo detection ───────────────────────────────────────────────────────

describe('runRecommendationEngine — jumbo', () => {
  test('high price + low down → isJumbo: true, conventional score 0', () => {
    const r = runRecommendationEngine(
      { ...baseAnswers, purchasePrice: 2000000, downPct: 3.5 },
      baseDeal,
    );
    expect(r.isJumbo).toBe(true);
    expect(r.scores[LOAN_TYPES.CONVENTIONAL].score).toBe(0);
    expect(r.scores[LOAN_TYPES.JUMBO].score).toBeGreaterThan(0);
  });

  test('high price + high down stays within conforming → isJumbo: false', () => {
    const r = runRecommendationEngine(
      { ...baseAnswers, purchasePrice: 1100000, downPct: 25 },
      baseDeal,
    );
    expect(r.isJumbo).toBe(false);
  });
});

// ─── No eligible loans ─────────────────────────────────────────────────────

describe('runRecommendationEngine — no eligible', () => {
  test('extreme scenario → recommended: null when all score 0', () => {
    const r = runRecommendationEngine(
      {
        ...baseAnswers,
        ownerOccupied: false,
        creditRange: '< 580',
        downPct: 3.5,
        needsRenovation: false,
        selfEmployed: false,
        purchasePrice: 400000,
        numUnits: 2,
        monthlyRent: 0,
      },
      baseDeal,
    );
    const allZero = Object.values(r.scores).every(s => s.score === 0);
    if (allZero) {
      expect(r.recommended).toBeNull();
    } else {
      expect(r.recommended).toBeTruthy();
    }
  });
});

// ─── getQuestionFlow ───────────────────────────────────────────────────────

describe('getQuestionFlow', () => {
  test('always starts with ownerOccupied', () => {
    const flow = getQuestionFlow({}, baseDeal);
    expect(flow[0]).toBe('ownerOccupied');
  });

  test('isVeteran included when ownerOccupied is not false', () => {
    const flow = getQuestionFlow({ ownerOccupied: true }, baseDeal);
    expect(flow).toContain('isVeteran');
  });

  test('isVeteran excluded when ownerOccupied is false', () => {
    const flow = getQuestionFlow({ ownerOccupied: false }, baseDeal);
    expect(flow).not.toContain('isVeteran');
  });

  test('selfEmployed included for investor', () => {
    const flow = getQuestionFlow({ ownerOccupied: false }, baseDeal);
    expect(flow).toContain('selfEmployed');
  });

  test('selfEmployed excluded for OO', () => {
    const flow = getQuestionFlow({ ownerOccupied: true }, baseDeal);
    expect(flow).not.toContain('selfEmployed');
  });
});

// ─── QUESTIONS ─────────────────────────────────────────────────────────────

describe('QUESTIONS', () => {
  test('every question ID in possible flow has a matching definition', () => {
    const allFlow = getQuestionFlow({ ownerOccupied: true }, baseDeal)
      .concat(getQuestionFlow({ ownerOccupied: false }, baseDeal));
    const uniqueIds = [...new Set(allFlow)];
    for (const id of uniqueIds) {
      expect(QUESTIONS[id]).toBeDefined();
      expect(QUESTIONS[id].text).toBeTruthy();
      expect(QUESTIONS[id].type).toBeTruthy();
    }
  });
});
