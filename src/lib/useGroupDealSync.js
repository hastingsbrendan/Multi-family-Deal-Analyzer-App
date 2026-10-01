import { useState, useEffect, useRef, useCallback } from 'react';
import * as Sentry from '@sentry/react';
import { sbSaveSharedDeal } from './groups';
import { createDealSync } from './syncEngine';

/**
 * Saves edits made inside a group view (BACK-121). Same engine as personal sync
 * (useCloudSync): debounced, one save at a time, each on top of the version loaded,
 * and edits made elsewhere in the meantime come back as conflicts for the user to settle.
 * Saves go through save_shared_deal, so group Editors can save deals they don't own.
 *
 * @param {object} p
 * @param {Array}    p.groupDeals    - current group deals state
 * @param {Function} p.setGroupDeals - its setter
 * @param {boolean}  p.canEdit       - false for Viewers (and outside a group): nothing is saved
 * @param {boolean}  p.isOnline
 */
export function useGroupDealSync({ groupDeals, setGroupDeals, canEdit, isOnline }) {
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [conflicts, setConflicts] = useState([]);
  const timer = useRef(null);
  const syncRef = useRef(null);
  if (!syncRef.current) syncRef.current = createDealSync({ save: sbSaveSharedDeal });
  const dealsRef = useRef(groupDeals);

  useEffect(() => { dealsRef.current = groupDeals; }, [groupDeals]);

  const flush = useCallback(async () => {
    const sync = syncRef.current;
    setStatus("saving");
    try {
      const { conflictIds } = await sync.flush(() => dealsRef.current || []);
      setConflicts(sync.listConflicts(dealsRef.current));
      if (conflictIds.length > 0) { setStatus("conflict"); return; }
      setStatus("saved");
      setError("");
      setTimeout(() => setStatus(s => s === "saved" ? "idle" : s), 2000);
    } catch (e) {
      setStatus("error");
      setError(e.message);
      Sentry.captureException(e, { tags: { origin: 'useGroupDealSync.flush' } });
    }
  }, []);

  useEffect(() => {
    if (!canEdit || !groupDeals?.length) return;
    if (!isOnline) { setStatus("offline"); return; }
    if (syncRef.current.changed(groupDeals).length === 0) {
      setStatus(s => s === "offline" ? "idle" : s);
      return;
    }
    clearTimeout(timer.current);
    setStatus("saving");
    timer.current = setTimeout(flush, 800);
    return () => clearTimeout(timer.current);
  }, [groupDeals, canEdit, isOnline]);

  // Put a freshly fetched group into state. Edits still waiting to save from the group
  // being left are saved first.
  const loadGroupDeals = useCallback(async (fetchDeals) => {
    clearTimeout(timer.current);
    try { await syncRef.current.flush(() => dealsRef.current || []); } catch { /* reported by flush on next edit */ }
    const loaded = await fetchDeals();
    const versions = Object.fromEntries(loaded.filter(d => d._deal_id).map(d => [d._deal_id, d._version]));
    syncRef.current.adopt(loaded, versions);
    setConflicts([]);
    setStatus("idle");
    setGroupDeals(loaded);
  }, [setGroupDeals]);

  const keepMine = useCallback((id) => {
    const mine = (dealsRef.current || []).find(d => d.id === id);
    if (!mine) return;
    syncRef.current.keepMine(id, mine);
    setConflicts(c => c.filter(x => x.id !== id));
    flush();
  }, [flush]);

  const loadTheirs = useCallback((id) => {
    const mine = (dealsRef.current || []).find(d => d.id === id);
    if (!mine) return;
    const theirs = syncRef.current.loadTheirs(id, mine);
    setConflicts(c => c.filter(x => x.id !== id));
    setGroupDeals(prev => theirs ? prev.map(d => d.id === id ? theirs : d) : prev.filter(d => d.id !== id));
  }, [setGroupDeals]);

  const forgetDeal = useCallback((id) => {
    syncRef.current.forget(id);
    setConflicts(c => c.filter(x => x.id !== id));
  }, []);

  useEffect(() => {
    if (conflicts.length === 0) setStatus(s => s === "conflict" ? "idle" : s);
  }, [conflicts.length]);

  return { status, error, conflicts, loadGroupDeals, keepMine, loadTheirs, forgetDeal };
}
