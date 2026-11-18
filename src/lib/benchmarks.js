// ─── Benchmarks ───────────────────────────────────────────────────────────────
// One set of "good / borderline / weak" thresholds for every screen and export.
// They used to differ by screen: cap rate 5% on Summary and cards but 6% in Red Flags;
// DSCR good at 1.0, 1.2 or 1.25 depending on the screen (2026-11 review).
// The user's Red Flag settings (Settings → Defaults) drive the floors.
import { DEFAULT_PREFS } from './calc';

export function benchmarks(prefs = DEFAULT_PREFS) {
  const p = { ...DEFAULT_PREFS, ...(prefs || {}) };
  const capFloor = +p.capRateFloor || 0.06;
  const dscrFloor = +p.dscrFloor || 1.2;
  return {
    capRate:      { good: capFloor, ok: capFloor * 0.75,  label: `≥${(capFloor * 100).toFixed(1)}%` },
    dscr:         { good: dscrFloor, ok: 1.0,             label: `≥${dscrFloor.toFixed(2)}x` },
    coc:          { good: 0.06, ok: 0.03,                 label: '≥6%' },
    irr:          { good: 0.12, ok: 0.08,                 label: '≥12%' },
    cashFlow:     { good: 0,    ok: -Infinity,            label: '≥$0' },
    // Lower is better
    expenseRatio: { good: +p.expRatioCeiling || 0.5, ok: (+p.expRatioCeiling || 0.5) * 1.3, label: `≤${Math.round((+p.expRatioCeiling || 0.5) * 100)}%`, lowerIsBetter: true },
  };
}

// 'good' | 'ok' | 'weak' (null when there's no value)
export function rate(metric, value, prefs) {
  if (value == null || !Number.isFinite(+value)) return null;
  const b = benchmarks(prefs)[metric];
  if (!b) return null;
  if (b.lowerIsBetter) return value <= b.good ? 'good' : value <= b.ok ? 'ok' : 'weak';
  return value >= b.good ? 'good' : value >= b.ok ? 'ok' : 'weak';
}

export const RATING_COLOR = { good: 'var(--green)', ok: 'var(--accent2)', weak: 'var(--red)' };

export function ratingColor(metric, value, prefs, fallback = 'var(--text)') {
  const r = rate(metric, value, prefs);
  return r ? RATING_COLOR[r] : fallback;
}
