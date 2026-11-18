import { useCallback, useEffect, useRef } from 'react';
import * as Sentry from '@sentry/react';
import { newDeal, createSampleDeal } from './calc';
import { sbDeleteDeal } from './constants';
import { trackDealCreated, trackDealDeleted } from './analytics';

/**
 * Wraps personal-portfolio deal CRUD operations with stable callbacks.
 *
 * @param {object} deps
 * @param {object}   deps.prefs        - current user default prefs
 * @param {Function} deps.setDeals     - setter from useCloudSync
 * @param {Function} deps.forgetDeal   - from useCloudSync, drops a deleted deal's sync state
 * @returns {{ addDeal, addSampleDeal, updateDeal, deleteDeal, reorderDeals }}
 */
// Cloud saves need no flagging here: useCloudSync saves any deal object it hasn't
// seen before (new or edited) and back-fills _deal_id on first insert.
export function useDeals({ prefs, setDeals, forgetDeal }) {
  const addDeal = useCallback((setActiveDealId) => {
    const d = newDeal(prefs);
    setDeals(p => [...p, d]);
    setActiveDealId(d.id);
    trackDealCreated(d.id);
  }, [prefs, setDeals]);

  // Adds a fully-prefilled Chicago duplex sample so first-touch users see a
  // working analysis instead of a blank form.
  const addSampleDeal = useCallback((setActiveDealId) => {
    const d = createSampleDeal(prefs);
    setDeals(p => [...p, d]);
    setActiveDealId(d.id);
    trackDealCreated(d.id);
  }, [prefs, setDeals]);

  const updateDeal = useCallback((updated) => {
    setDeals(p => p.map(d => d.id === updated.id ? updated : d));
  }, [setDeals]);

  // Deletes reach the server only after the Undo toast (5s) has gone. Deleting at once
  // meant Undo restored a deal whose row no longer existed, so the next save reported
  // "deleted on another device" (2026-11 review). Network calls also don't belong
  // inside a setState updater, which React may run twice.
  const pendingDeletes = useRef(new Map()); // local id -> { timer, run }

  const deleteDeal = useCallback((id, dealId) => {
    trackDealDeleted(id);
    setDeals(p => p.filter(d => d.id !== id));
    const run = () => {
      pendingDeletes.current.delete(id);
      forgetDeal(id);
      // Saves never delete rows, so without this the deal reappears on next load.
      if (dealId) sbDeleteDeal(dealId).catch(e => Sentry.captureException(e, { tags: { origin: 'useDeals.delete' } }));
    };
    pendingDeletes.current.set(id, { timer: setTimeout(run, 6000), run });
  }, [setDeals, forgetDeal]);

  // Reorder is also how Undo puts a deleted deal back: any deal present again
  // cancels its pending delete.
  const reorderDeals = useCallback((next) => {
    (next || []).forEach(d => {
      const pending = pendingDeletes.current.get(d.id);
      if (pending) { clearTimeout(pending.timer); pendingDeletes.current.delete(d.id); }
    });
    setDeals(next);
  }, [setDeals]);

  // Leaving the page or signing out shouldn't resurrect a deal the user deleted.
  useEffect(() => {
    const flushAll = () => pendingDeletes.current.forEach(({ timer, run }) => { clearTimeout(timer); run(); });
    window.addEventListener('pagehide', flushAll);
    return () => { window.removeEventListener('pagehide', flushAll); flushAll(); };
  }, []);

  return { addDeal, addSampleDeal, updateDeal, deleteDeal, reorderDeals };
}
