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

import { PLANS, computeTier, computeDaysLeft } from '../../contexts/SubscriptionContext';

// ─── Entitlements come from app_metadata only ───────────────────────────────
// user_metadata is editable by the signed-in user (supabase.auth.updateUser), so
// reading plan / trial_started_at from it let anyone grant themselves Pro or an
// endless trial. app_metadata can only be written with the service role.
const daysAgo = (d) => new Date(Date.now() - d * 864e5).toISOString();

describe('computeTier', () => {
  it('null user → locked', () => {
    expect(computeTier(null)).toBe('locked');
  });

  it('app_metadata.plan = pro → pro', () => {
    expect(computeTier({ created_at: daysAgo(90), app_metadata: { plan: 'pro' } })).toBe('pro');
  });

  it('ignores user_metadata.plan = pro (user-editable)', () => {
    expect(computeTier({ created_at: daysAgo(90), user_metadata: { plan: 'pro' } })).toBe('locked');
  });

  it('ignores a user_metadata.trial_started_at set in the future', () => {
    const user = { created_at: daysAgo(90), user_metadata: { trial_started_at: daysAgo(-365) } };
    expect(computeTier(user)).toBe('locked');
  });

  it('honours an app_metadata.trial_started_at', () => {
    expect(computeTier({ created_at: daysAgo(90), app_metadata: { trial_started_at: daysAgo(2) } })).toBe('trial');
  });

  it('account younger than 14 days → trial', () => {
    expect(computeTier({ created_at: daysAgo(3) })).toBe('trial');
  });

  it('account older than 14 days → locked', () => {
    expect(computeTier({ created_at: daysAgo(15) })).toBe('locked');
  });
});

describe('computeDaysLeft', () => {
  it('pro (app_metadata) → null', () => {
    expect(computeDaysLeft({ created_at: daysAgo(90), app_metadata: { plan: 'pro' } })).toBeNull();
  });

  it('user_metadata.plan does not make days-left null', () => {
    expect(computeDaysLeft({ created_at: daysAgo(4), user_metadata: { plan: 'pro' } })).toBe(10);
  });

  it('expired trial → 0', () => {
    expect(computeDaysLeft({ created_at: daysAgo(30) })).toBe(0);
  });
});

// ─── PLANS config tests ─────────────────────────────────────────────────────

describe('PLANS config', () => {
  it('defines locked, trial, and pro tiers', () => {
    expect(PLANS.locked).toBeDefined();
    expect(PLANS.trial).toBeDefined();
    expect(PLANS.pro).toBeDefined();
  });

  it('locked tier has label Free', () => {
    expect(PLANS.locked.label).toBe('Free');
  });

  it('trial tier has label Trial', () => {
    expect(PLANS.trial.label).toBe('Trial');
  });

  it('pro tier has label Pro', () => {
    expect(PLANS.pro.label).toBe('Pro');
  });

  it('all tiers define the same feature keys', () => {
    const lockedKeys = Object.keys(PLANS.locked).sort();
    const trialKeys  = Object.keys(PLANS.trial).sort();
    const proKeys    = Object.keys(PLANS.pro).sort();
    expect(trialKeys).toEqual(lockedKeys);
    expect(proKeys).toEqual(lockedKeys);
  });

  it('all feature values are booleans', () => {
    for (const tier of Object.values(PLANS)) {
      for (const [key, val] of Object.entries(tier)) {
        if (key === 'label') continue;
        expect(typeof val).toBe('boolean');
      }
    }
  });

  it('trial and pro tiers are fully permissive', () => {
    const gatedFeatures = ['pdfExport', 'rentComps', 'sensitivity', 'sharing'];
    for (const feature of gatedFeatures) {
      expect(PLANS.trial[feature]).toBe(true);
      expect(PLANS.pro[feature]).toBe(true);
    }
  });

  it('locked tier blocks all gated features', () => {
    const gatedFeatures = ['pdfExport', 'rentComps', 'sensitivity', 'sharing'];
    for (const feature of gatedFeatures) {
      expect(PLANS.locked[feature]).toBe(false);
    }
  });
});

// ─── Feature check logic tests ──────────────────────────────────────────────
// Test the logic that FeatureGate and useFeatureCheck rely on,
// without needing a full React render context.

describe('feature check logic', () => {
  function checkFeature(limits, feature) {
    if (!limits) return false;
    const val = limits[feature];
    if (val === undefined) return true;
    if (typeof val === 'boolean') return val;
    if (typeof val === 'number') return val > 0;
    return true;
  }

  it('returns true for boolean true features', () => {
    expect(checkFeature(PLANS.trial, 'pdfExport')).toBe(true);
    expect(checkFeature(PLANS.pro, 'pdfExport')).toBe(true);
  });

  it('returns false for boolean false features on locked tier', () => {
    expect(checkFeature(PLANS.locked, 'pdfExport')).toBe(false);
    expect(checkFeature(PLANS.locked, 'rentComps')).toBe(false);
  });

  it('returns true for unknown feature keys (default allow)', () => {
    expect(checkFeature(PLANS.locked, 'someNewFeature')).toBe(true);
    expect(checkFeature(PLANS.pro, 'someNewFeature')).toBe(true);
  });

  it('returns false for null/undefined limits', () => {
    expect(checkFeature(null, 'pdfExport')).toBe(false);
    expect(checkFeature(undefined, 'pdfExport')).toBe(false);
  });
});
