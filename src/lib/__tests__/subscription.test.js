import { describe, it, expect, vi } from 'vitest';
import React from 'react';

// Mock Supabase client before importing modules
vi.mock('../constants', () => ({
  sbClient: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
  },
}));

import { PLANS } from '../../contexts/SubscriptionContext';

// ─── PLANS config tests ─────────────────────────────────────────────────────

describe('PLANS config', () => {
  it('defines free and pro tiers', () => {
    expect(PLANS.free).toBeDefined();
    expect(PLANS.pro).toBeDefined();
  });

  it('free tier has a label', () => {
    expect(PLANS.free.label).toBe('Free');
  });

  it('pro tier has a label', () => {
    expect(PLANS.pro.label).toBe('Pro');
  });

  it('both tiers define the same feature keys', () => {
    const freeKeys = Object.keys(PLANS.free).sort();
    const proKeys = Object.keys(PLANS.pro).sort();
    expect(freeKeys).toEqual(proKeys);
  });

  it('all feature values are booleans or numbers', () => {
    for (const tier of Object.values(PLANS)) {
      for (const [key, val] of Object.entries(tier)) {
        if (key === 'label') continue;
        expect(typeof val === 'boolean' || typeof val === 'number').toBe(true);
      }
    }
  });

  it('pro tier is at least as permissive as free tier', () => {
    for (const [key, freeVal] of Object.entries(PLANS.free)) {
      if (key === 'label') continue;
      const proVal = PLANS.pro[key];
      if (typeof freeVal === 'boolean') {
        // If free has it, pro must have it too
        if (freeVal) expect(proVal).toBe(true);
      }
      if (typeof freeVal === 'number') {
        expect(proVal).toBeGreaterThanOrEqual(freeVal);
      }
    }
  });
});

// ─── Feature check logic tests ──────────────────────────────────────────────
// Test the logic that FeatureGate and useFeatureCheck rely on,
// without needing a full React render context.

describe('feature check logic', () => {
  function checkFeature(limits, feature) {
    const val = limits[feature];
    if (val === undefined) return true;
    if (typeof val === 'boolean') return val;
    if (typeof val === 'number') return val > 0;
    return true;
  }

  it('returns true for boolean true features', () => {
    expect(checkFeature(PLANS.free, 'pdfExport')).toBe(true);
    expect(checkFeature(PLANS.pro, 'pdfExport')).toBe(true);
  });

  it('returns false for boolean false features', () => {
    const testPlan = { ...PLANS.free, pdfExport: false };
    expect(checkFeature(testPlan, 'pdfExport')).toBe(false);
  });

  it('returns true for numeric limits > 0', () => {
    expect(checkFeature(PLANS.free, 'maxDeals')).toBe(true);
    expect(checkFeature({ maxDeals: 3 }, 'maxDeals')).toBe(true);
  });

  it('returns false for numeric limit of 0', () => {
    expect(checkFeature({ maxDeals: 0 }, 'maxDeals')).toBe(false);
  });

  it('returns true for unknown feature keys (default allow)', () => {
    expect(checkFeature(PLANS.free, 'someNewFeature')).toBe(true);
  });
});
