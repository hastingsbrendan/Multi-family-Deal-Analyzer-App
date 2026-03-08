import React, { createContext, useContext, useState, useEffect } from 'react';
import { sbClient } from '../lib/constants';

// ─── Trial config ─────────────────────────────────────────────────────────────
const TRIAL_DAYS = 14;

// ─── Plan definitions ─────────────────────────────────────────────────────────
// 'locked' = post-trial, no active subscription. Everything gated.
// 'trial'  = within 14-day window. Full access like pro.
// 'pro'    = paid subscriber. Full access.
export const PLANS = {
  locked: {
    label: 'Free',
    pdfExport: false,
    rentComps: false,
    sensitivity: false,
    sharing: false,
  },
  trial: {
    label: 'Trial',
    pdfExport: true,
    rentComps: true,
    sensitivity: true,
    sharing: true,
  },
  pro: {
    label: 'Pro',
    pdfExport: true,
    rentComps: true,
    sensitivity: true,
    sharing: true,
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function computeTier(user) {
  if (!user) return 'locked';
  if (user.user_metadata?.plan === 'pro') return 'pro';
  const trialStart = user.user_metadata?.trial_started_at || user.created_at;
  if (trialStart) {
    const elapsedDays = (Date.now() - new Date(trialStart).getTime()) / (1000 * 60 * 60 * 24);
    if (elapsedDays < TRIAL_DAYS) return 'trial';
  }
  return 'locked';
}

function computeDaysLeft(user) {
  if (!user) return 0;
  if (user.user_metadata?.plan === 'pro') return null;
  const trialStart = user.user_metadata?.trial_started_at || user.created_at;
  if (!trialStart) return 0;
  const elapsedDays = (Date.now() - new Date(trialStart).getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(0, Math.ceil(TRIAL_DAYS - elapsedDays));
}

// ─── Context ──────────────────────────────────────────────────────────────────
const SubscriptionContext = createContext({
  tier: 'locked',
  plan: PLANS.locked,
  limits: PLANS.locked,
  daysLeft: 0,
  loading: true,
});

// ─── Provider ─────────────────────────────────────────────────────────────────
export function SubscriptionProvider({ children }) {
  const [tier, setTier]         = useState('locked');
  const [daysLeft, setDaysLeft] = useState(0);
  const [loading, setLoading]   = useState(true);

  function applyUser(user) {
    setTier(computeTier(user));
    setDaysLeft(computeDaysLeft(user));
    setLoading(false);
  }

  useEffect(() => {
    sbClient.auth.getUser().then(({ data: { user } }) => applyUser(user));

    const { data: { subscription } } = sbClient.auth.onAuthStateChange((_evt, session) => {
      applyUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const plan = PLANS[tier] || PLANS.locked;

  return (
    <SubscriptionContext.Provider value={{ tier, plan, limits: plan, daysLeft, loading }}>
      {children}
    </SubscriptionContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useSubscription() {
  return useContext(SubscriptionContext);
}
