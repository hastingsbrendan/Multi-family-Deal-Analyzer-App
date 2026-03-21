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

  // Bootstrap: load local deals immediately, then pull cloud state.
  // Called once per sign-in to avoid overwriting unsaved edits on token refreshes.
  const bootstrapUser = useCallback((u, { loadPrefs = false } = {}) => {
    hasBootstrappedRef.current = true;
    Sentry.setUser({ id: u.id, email: u.email });
    identifyUser(u);
    const local = loadLocal(u.id);
    setDeals(local);
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
          } else if (local.length > 0) {
            sbWrite(local).catch(() => {});
          } else {
            // First login with no deals anywhere — create a sample deal so the
            // user lands on a populated portfolio instead of a blank canvas.
            const sample = createSampleDeal(resolvedPrefs);
            const initialDeals = [sample];
            setDeals(initialDeals);
            saveLocal(initialDeals, u.id);
            sbWrite(initialDeals).catch(() => {});
            trackDealCreated(sample.id);
          }
        })
        .catch(() => {});
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
