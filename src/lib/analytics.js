/**
 * analytics.js — PostHog wrapper for RentHack
 *
 * All product analytics live here. Import `track` and call it anywhere.
 * PostHog is initialized once at app start via `initAnalytics()`.
 *
 * Event taxonomy:
 *   user_*       — auth lifecycle
 *   deal_*       — deal CRUD
 *   tab_viewed   — tab navigation (most important for feature usage)
 *   upgrade_*    — paywall interactions
 *   loan_*       — loan type module
 *   export_*     — PDF / CSV exports
 */

const PH_KEY  = 'phc_HCMLaGNmXT6cri4clmC1zs1WLF9y3F873ZXg1IH2GRJ';
const PH_HOST = 'https://us.i.posthog.com';

// posthog-js is ~300 kB of source and isn't needed to draw the app, so it loads in
// its own chunk after startup instead of in the main bundle every visitor downloads
// (it grew by ~138 kB going 1.360 → 1.435; BACK-119). Calls made before it arrives
// are queued and replayed in order.
let posthog = null;
let loading = null;
const pending = [];

function withPosthog(fn) {
  if (posthog) fn(posthog);
  else pending.push(fn);
}

// ─── Init ─────────────────────────────────────────────────────────────────────

export function initAnalytics() {
  if (loading) return loading;
  loading = import('posthog-js')
    .then(({ default: ph }) => {
      ph.init(PH_KEY, {
        api_host: PH_HOST,
        capture_pageview: true,
        capture_pageleave: true,
        autocapture: false,          // manual only — keeps event stream clean
        persistence: 'localStorage', // survives session without cookies
      });
      posthog = ph;
      pending.splice(0).forEach(fn => fn(ph));
    })
    .catch(err => console.warn('[analytics] PostHog failed to load', err));
  return loading;
}

// ─── Identity ─────────────────────────────────────────────────────────────────

export function identifyUser(user) {
  if (!user) return;
  withPosthog(ph => ph.identify(user.id, {
    email: user.email,
    plan: user.app_metadata?.plan || 'free',
    created_at: user.created_at,
  }));
}

export function resetAnalyticsUser() {
  withPosthog(ph => ph.reset());
}

// ─── Generic event helper ─────────────────────────────────────────────────────

export function track(event, props = {}) {
  withPosthog(ph => ph.capture(event, props));
}

// ─── Convenience wrappers (named events) ──────────────────────────────────────

/** Auth */
export const trackSignUp       = (method = 'email') => track('user_signed_up',   { method });
export const trackSignIn       = (method = 'email') => track('user_signed_in',   { method });
export const trackSignOut      = ()                  => track('user_signed_out');

/** Deal lifecycle */
export const trackDealCreated  = (dealId)            => track('deal_created',    { deal_id: dealId });
export const trackDealDeleted  = (dealId)            => track('deal_deleted',    { deal_id: dealId });
export const trackDealOpened   = (dealId, address)   => track('deal_opened',     { deal_id: dealId, address });

/** Tab navigation — core feature usage signal */
const TAB_NAMES = [
  'Deal Summary', 'Assumptions', 'Cash Flow', 'Rent Comps',
  'Market', 'Showing', 'Red Flags', 'Sensitivity', 'Loan Type',
];
export const trackTabViewed = (tabIndex, dealId) =>
  track('tab_viewed', {
    tab_index: tabIndex,
    tab_name: TAB_NAMES[tabIndex] ?? `Tab ${tabIndex}`,
    deal_id: dealId,
  });

/** Paywall / upgrade gate */
export const trackUpgradeGateHit = (feature, dealId) =>
  track('upgrade_gate_hit', { feature, deal_id: dealId });
export const trackUpgradeClicked = (feature)          =>
  track('upgrade_clicked',   { feature });

/** Premium feature usage — fired when a pro user actively accesses a gated feature */
export const trackFeatureUsed = (feature, dealId) =>
  track('feature_used', { feature, deal_id: dealId });

/** Exports */
export const trackPDFExported = (dealId)  => track('export_pdf',  { deal_id: dealId });
export const trackCSVExported = (dealId)  => track('export_csv',  { deal_id: dealId });

/** Loan type module */
export const trackLoanQuizStarted    = (dealId)              => track('loan_quiz_started',    { deal_id: dealId });
export const trackLoanQuizCompleted  = (dealId, recommended) => track('loan_quiz_completed',  { deal_id: dealId, recommended_loan: recommended });
export const trackLoanSelected       = (dealId, loanType)    => track('loan_selected',        { deal_id: dealId, loan_type: loanType });
export const trackLoanDetailViewed   = (dealId, loanType)    => track('loan_detail_viewed',   { deal_id: dealId, loan_type: loanType });
