import React from 'react';
import { useSubscription } from '../contexts/SubscriptionContext';

// ─── Imperative hook ─────────────────────────────────────────────────────────
// Returns true if the current plan allows the given feature.
// Usage: const canExportPDF = useFeatureCheck('pdfExport');
export function useFeatureCheck(feature) {
  const { limits } = useSubscription();
  const val = limits[feature];
  if (val === undefined) return true; // unknown feature key → allow by default
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val > 0;
  return true;
}

// ─── Default upgrade prompt ──────────────────────────────────────────────────
function DefaultFallback() {
  return (
    <div style={{
      background: 'var(--card)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      padding: 24,
      textAlign: 'center',
      margin: '16px 0',
    }}>
      <div style={{ fontSize: 24, marginBottom: 8 }}>🔒</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
        Upgrade to Pro
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
        This feature is available on the Pro plan.
      </div>
    </div>
  );
}

// ─── Declarative wrapper ─────────────────────────────────────────────────────
// Usage:
//   <FeatureGate feature="pdfExport">
//     <button onClick={onExportPDF}>⬇ PDF</button>
//   </FeatureGate>
//
// With custom fallback:
//   <FeatureGate feature="groups" fallback={<span>Pro only</span>}>
//     <ShareButton />
//   </FeatureGate>
function FeatureGate({ feature, children, fallback }) {
  const allowed = useFeatureCheck(feature);
  if (allowed) return children;
  return fallback !== undefined ? fallback : <DefaultFallback />;
}

export default FeatureGate;
