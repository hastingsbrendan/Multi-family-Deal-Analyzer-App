import React from 'react';
import { useSubscription } from '../contexts/SubscriptionContext';
import { BlurGate, UpgradeCard } from './UpgradeModal';

// ─── Imperative hook ──────────────────────────────────────────────────────────
export function useFeatureCheck(feature) {
  const { limits } = useSubscription();
  const val = limits[feature];
  if (val === undefined) return true;
  return val !== false;
}

// ─── Declarative wrapper ──────────────────────────────────────────────────────
// For tab content: wraps children in a blur overlay when locked.
// For buttons: hides and shows upgrade prompt inline.
function FeatureGate({ feature, children, fallback, userEmail, blur = false }) {
  const allowed = useFeatureCheck(feature);

  if (allowed) return children;

  // Blur mode: show content blurred with upgrade card on top
  if (blur) {
    return <BlurGate feature={feature} userEmail={userEmail}>{children}</BlurGate>;
  }

  // Default: show fallback or standard upgrade card
  return fallback !== undefined ? fallback : <UpgradeCard userEmail={userEmail} />;
}

export default FeatureGate;
