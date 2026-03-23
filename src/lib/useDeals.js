import { useCallback } from 'react';
import { newDeal } from './calc';
import { sbDeleteDeal } from './constants';
import { trackDealCreated, trackDealDeleted } from './analytics';

/**
 * Wraps personal-portfolio deal CRUD operations with stable callbacks.
 *
 * @param {object} deps
 * @param {object}   deps.prefs        - current user default prefs
 * @param {Function} deps.setDeals     - setter from useCloudSync
 * @param {Function} deps.markDealDirty - from useCloudSync, flags a deal for cloud sync
 * @returns {{ addDeal, updateDeal, deleteDeal, reorderDeals }}
 */
export function useDeals({ prefs, setDeals, markDealDirty }) {
  const addDeal = useCallback((setActiveDealId) => {
    const d = newDeal(prefs);
    setDeals(p => [...p, d]);
    setActiveDealId(d.id);
    trackDealCreated(d.id);
    // Mark dirty so the debounced sync takes the granular path (sbWriteDeal),
    // which returns the new DB uuid and back-fills _deal_id on the deal.
    // Without this, the bulk sbWrite path runs with _deal_id=undefined, which
    // causes Postgres to INSERT a fresh row on every write (NULLs never conflict).
    markDealDirty(d.id);
  }, [prefs, setDeals, markDealDirty]);

  const updateDeal = useCallback((updated) => {
    markDealDirty(updated.id);
    setDeals(p => p.map(d => d.id === updated.id ? updated : d));
  }, [markDealDirty, setDeals]);

  const deleteDeal = useCallback((id) => {
    trackDealDeleted(id);
    // Use functional form to access current deals so we can read _deal_id.
    // sbDeleteDeal removes the row from Supabase; without this the row survives
    // (sbWrite is upsert-only — it never deletes) and reappears on next page load.
    setDeals(p => {
      const deal = (p || []).find(d => d.id === id);
      if (deal?._deal_id) sbDeleteDeal(deal._deal_id).catch(() => {});
      return p.filter(d => d.id !== id);
    });
  }, [setDeals]);

  const reorderDeals = useCallback((next) => {
    setDeals(next);
  }, [setDeals]);

  return { addDeal, updateDeal, deleteDeal, reorderDeals };
}
