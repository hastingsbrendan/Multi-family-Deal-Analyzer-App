import { useCallback } from 'react';
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

  const deleteDeal = useCallback((id) => {
    trackDealDeleted(id);
    forgetDeal(id);
    // Use functional form to access current deals so we can read _deal_id.
    // sbDeleteDeal removes the row from Supabase; without this the row survives
    // (saves never delete) and reappears on next page load.
    setDeals(p => {
      const deal = (p || []).find(d => d.id === id);
      if (deal?._deal_id) sbDeleteDeal(deal._deal_id).catch(() => {});
      return p.filter(d => d.id !== id);
    });
  }, [setDeals, forgetDeal]);

  const reorderDeals = useCallback((next) => {
    setDeals(next);
  }, [setDeals]);

  return { addDeal, addSampleDeal, updateDeal, deleteDeal, reorderDeals };
}
