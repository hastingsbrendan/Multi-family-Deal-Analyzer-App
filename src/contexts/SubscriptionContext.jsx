import React, { createContext, useContext, useState, useEffect } from 'react';
import { sbClient } from '../lib/constants';

// ─── Plan definitions ────────────────────────────────────────────────────────
// Each key maps to a boolean (feature toggle) or number (limit).
// Adjust values here when you decide which features to gate.
export const PLANS = {
  free: {
    label: 'Free',
    maxDeals: Infinity,
    pdfExport: true,
    groups: true,
    sensitivity: true,
    redFlags: true,
    rentComps: true,
  },
  pro: {
    label: 'Pro',
    maxDeals: Infinity,
    pdfExport: true,
    groups: true,
    sensitivity: true,
    redFlags: true,
    rentComps: true,
  },
};

// ─── Context ─────────────────────────────────────────────────────────────────
const SubscriptionContext = createContext({
  tier: 'free',
  plan: PLANS.free,
  limits: PLANS.free,
  loading: true,
});

// ─── Provider ────────────────────────────────────────────────────────────────
export function SubscriptionProvider({ children }) {
  const [tier, setTier] = useState('free');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Read initial session
    sbClient.auth.getUser().then(({ data: { user } }) => {
      if (user) setTier(user.user_metadata?.plan || 'free');
      setLoading(false);
    });

    // Stay in sync when auth state changes (login, profile update, etc.)
    const { data: { subscription } } = sbClient.auth.onAuthStateChange((_evt, session) => {
      const u = session?.user;
      setTier(u?.user_metadata?.plan || 'free');
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const plan = PLANS[tier] || PLANS.free;

  return (
    <SubscriptionContext.Provider value={{ tier, plan, limits: plan, loading }}>
      {children}
    </SubscriptionContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────
export function useSubscription() {
  return useContext(SubscriptionContext);
}
