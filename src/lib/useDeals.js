import { useCallback } from 'react';
import { newDeal } from './calc';
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
  }, [prefs, setDeals]);

  const updateDeal = useCallback((updated) => {
    markDealDirty(updated.id);
    setDeals(p => p.map(d => d.id === updated.id ? updated : d));
  }, [markDealDirty, setDeals]);

  const deleteDeal = useCallback((id) => {
    trackDealDeleted(id);
    setDeals(p => p.filter(d => d.id !== id));
  }, [setDeals]);

  const reorderDeals = useCallback((next) => {
    setDeals(next);
  }, [setDeals]);

  return { addDeal, updateDeal, deleteDeal, reorderDeals };
}
