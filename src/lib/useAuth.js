import { useEffect, useCallback, useRef } from 'react';
import * as Sentry from '@sentry/react';
import { sbClient, loadLocal, saveLocal, sbRead, sbWrite, authGetSession, authSignOut } from './constants';
import { createSampleDeal, DEFAULT_PREFS } from './calc';
import {
  identifyUser, resetAnalyticsUser,
  trackSignIn, trackSignOut, trackDealCreated,
} from './analytics';

/**
 * Manages Supabase auth side-effects: session bootstrap, auth state changes,
 * and sign-out. User state itself lives in App.jsx to avoid a circular
 * dependency with useCloudSync.
 *
 * @param {object} deps
 * @param {Function} deps.setUser            - App.jsx user state setter
 * @param {Function} deps.setAuthLoading     - App.jsx authLoading setter
 * @param {Function} deps.setDeals           - from useCloudSync
 * @param {Function} deps.setLastCloudUpdate - from useCloudSync
 * @param {Function} deps.setPrefs           - App.jsx prefs setter
 * @returns {{ handleSignOut }}
 */
export function useAuth({ setUser, setAuthLoading, setDeals, setLastCloudUpdate, setPrefs }) {
  const hasBootstrappedRef = useRef(false);

  // Bootstrap: pull authoritative cloud state, fall back to localStorage on failure.
  // Called once per sign-in to avoid overwriting unsaved edits on token refreshes.
  //
  // IMPORTANT: do NOT call setDeals(local) before sbRead returns. Doing so triggers
  // the 800ms debounced sbWrite with stale localStorage data — which upserts every
  // deal by its stored _deal_id UUID. If any of those UUIDs point to rows that were
  // deleted or never existed in the DB, upsert INSERTs them as new rows (a specific
  // non-NULL deal_id that finds no conflict is always treated as an INSERT). This was
  // the root cause of persistent deal duplication even after DB cleanup.
  const bootstrapUser = useCallback((u, { loadPrefs = false } = {}) => {
    hasBootstrappedRef.current = true;
    Sentry.setUser({ id: u.id, email: u.email });
    identifyUser(u);
    setTimeout(() => {
      sbRead()
        .then(({ data: cloudDeals, prefs: cloudPrefs, updated_at }) => {
          setLastCloudUpdate(updated_at);
          const resolvedPrefs = (loadPrefs && cloudPrefs)
            ? { ...DEFAULT_PREFS, ...cloudPrefs }
            : undefined;
          if (loadPrefs && cloudPrefs) {
            setPrefs({ ...DEFAULT_PREFS, ...cloudPrefs });
          }
          if (cloudDeals.length > 0) {
            setDeals(cloudDeals);
            saveLocal(cloudDeals, u.id);
          } else {
            // DB has no deals — check localStorage, then fall back to a sample deal
            const local = loadLocal(u.id);
            if (local.length > 0) {
              setDeals(local);
              sbWrite(local).catch(e => Sentry.captureException(e, { tags: { origin: 'useAuth.sbWrite.bootstrap' } }));
            } else {
              // First login with no deals anywhere — create a sample deal so the
              // user lands on a populated portfolio instead of a blank canvas.
              const sample = createSampleDeal(resolvedPrefs);
              const initialDeals = [sample];
              setDeals(initialDeals);
              saveLocal(initialDeals, u.id);
              sbWrite(initialDeals).catch(e => Sentry.captureException(e, { tags: { origin: 'useAuth.sbWrite.sample' } }));
              trackDealCreated(sample.id);
            }
          }
        })
        .catch(e => {
          // sbRead failed — fall back to localStorage so the app isn't stuck on the
          // loading screen. Deals may be stale but are better than nothing.
          const local = loadLocal(u.id);
          setDeals(local.length > 0 ? local : []);
          Sentry.captureException(e, { tags: { origin: 'useAuth.sbRead' } });
        });
    }, 300);
  }, [setDeals, setLastCloudUpdate, setPrefs]);

  useEffect(() => {
    authGetSession().then(({ data: { session } }) => {
      const u = session?.user || false;
      setUser(u);
      setAuthLoading(false);
      if (u) bootstrapUser(u, { loadPrefs: true });
    });

    const { data: { subscription } } = sbClient.auth.onAuthStateChange((evt, session) => {
      const u = session?.user || false;
      setUser(u);
      if (u) Sentry.setUser({ id: u.id, email: u.email });
      else Sentry.setUser(null);

      if (u && (evt === 'SIGNED_IN' || evt === 'USER_UPDATED')) {
        identifyUser(u);
        if (evt === 'SIGNED_IN') trackSignIn();
        if (window.location.hash.includes('access_token')) {
          window.history.replaceState(null, '', window.location.pathname);
        }
        // Supabase fires SIGNED_IN on every token refresh (~hourly) and on
        // tab-visibility restore. Skip re-bootstrapping if deals are already
        // loaded — otherwise it clobbers unsaved edits the user is making.
        if (evt === 'SIGNED_IN' && hasBootstrappedRef.current) return;
        bootstrapUser(u);
      }

      if (!u) {
        setDeals([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSignOut = useCallback(async () => {
    trackSignOut();
    resetAnalyticsUser();
    await authSignOut();
    Sentry.setUser(null);
    setPrefs(DEFAULT_PREFS);
    saveLocal([]);
    // setUser(false) fires automatically via onAuthStateChange above
  }, [setPrefs]);

  return { handleSignOut };
}
