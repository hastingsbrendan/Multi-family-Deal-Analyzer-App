import { useState, useEffect, useRef, useCallback } from 'react';
import * as Sentry from '@sentry/react';
import { saveLocal, sbRead, sbSaveDeal } from './constants';
import { createDealSync } from './syncEngine';

export function useCloudSync(user, isOnline) {
  const [deals, setDeals] = useState(null);
  const [syncStatus, setSyncStatus] = useState("idle");
  const [syncError, setSyncError] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  // Deals another device or tab changed since we loaded them: [{ id, mine, theirs }] (BACK-117)
  const [conflicts, setConflicts] = useState([]);
  const syncTimer = useRef(null);
  const lastCloudUpdate = useRef(null);
  const syncRef = useRef(null);
  if (!syncRef.current) syncRef.current = createDealSync({ save: sbSaveDeal });
  const dealsRef = useRef(deals);

  // Declared before the sync effect so flushes always read the latest committed deals.
  useEffect(() => { dealsRef.current = deals; }, [deals]);

  const markSaved = useCallback(() => {
    setSyncStatus("saved");
    setSyncError("");
    setLastSyncedAt(new Date());
    setTimeout(() => setSyncStatus(s => s === "saved" ? "idle" : s), 2000);
  }, []);

  // Save every deal that changed since it was last saved or loaded. Only those deals
  // are written, each on top of the cloud version it started from.
  const flush = useCallback(async () => {
    const sync = syncRef.current;
    setSyncStatus("saving");
    try {
      const { newIds, conflictIds } = await sync.flush(() => dealsRef.current || []);
      Sentry.addBreadcrumb({ category: 'sync', message: 'saved', data: { newDeals: Object.keys(newIds).length, conflicts: conflictIds.length }, level: 'info' });
      // Back-fill _deal_id on newly created deals so later saves update that row
      // instead of inserting another one.
      if (Object.keys(newIds).length > 0) setDeals(prev => sync.applyNewIds(prev, newIds));
      setConflicts(sync.listConflicts(dealsRef.current));
      if (conflictIds.length > 0) setSyncStatus("conflict");
      else markSaved();
    } catch (e) {
      setSyncStatus("error");
      setSyncError(e.message);
      Sentry.captureException(e, { tags: { origin: 'useCloudSync.flush' }, extra: { dealCount: dealsRef.current?.length } });
    }
  }, [markSaved]);

  // Debounced save when deals change. Also runs when the connection returns, which
  // saves whatever was edited offline — still one deal at a time with version checks.
  useEffect(() => {
    if (deals === null || !user) return;
    saveLocal(deals, user?.id);
    if (!isOnline) {
      setSyncStatus("offline");
      Sentry.addBreadcrumb({ category: 'sync', message: 'offline — queued', data: { deals: deals.length, online: navigator.onLine }, level: 'warning' });
      return;
    }
    // Nothing to write (fresh load from the cloud, a reorder, or only deals awaiting a
    // keep-mine / load-theirs choice).
    if (syncRef.current.changed(deals).length === 0) {
      setSyncStatus(s => s === "offline" ? "idle" : s);
      return;
    }
    clearTimeout(syncTimer.current);
    setSyncStatus("saving");
    syncTimer.current = setTimeout(flush, 800);
    return () => clearTimeout(syncTimer.current);
  }, [deals, isOnline]);

  // Focus/visibility pull intentionally removed — it raced with the 800ms debounced
  // write and caused edits to be overwritten. Bootstrap on login + debounced write is
  // sufficient; edits made elsewhere surface as conflicts when this device saves.

  // Replace local state with a set of deals straight from the cloud (or a local
  // fallback) — nothing is written back until the user edits something.
  const loadDeals = useCallback((loaded, versions = {}) => {
    syncRef.current.adopt(loaded, versions);
    setConflicts([]);
    setDeals(loaded);
  }, []);

  const forceRefresh = useCallback(async () => {
    clearTimeout(syncTimer.current);
    setSyncStatus("saving");
    try {
      // Save pending edits first so "pull latest" doesn't throw them away.
      await syncRef.current.flush(() => dealsRef.current || []);
      const { data: cloudDeals, versions, updated_at } = await sbRead();
      lastCloudUpdate.current = updated_at;
      loadDeals(cloudDeals, versions);
      saveLocal(cloudDeals, user?.id);
      markSaved();
    } catch (e) {
      setSyncStatus("error");
      setSyncError(e.message);
    }
  }, [user, loadDeals, markSaved]);

  // Conflict choices. Keep mine writes this device's copy over the cloud's (re-creating
  // it if it was deleted elsewhere); load theirs swaps the cloud copy into state.
  const keepMine = useCallback((id) => {
    const mine = (dealsRef.current || []).find(d => d.id === id);
    if (!mine) return;
    syncRef.current.keepMine(id, mine);
    setConflicts(c => c.filter(x => x.id !== id));
    Sentry.addBreadcrumb({ category: 'sync', message: 'conflict: keep mine', level: 'info' });
    flush();
  }, [flush]);

  const loadTheirs = useCallback((id) => {
    const mine = (dealsRef.current || []).find(d => d.id === id);
    if (!mine) return;
    const theirs = syncRef.current.loadTheirs(id, mine);
    setConflicts(c => c.filter(x => x.id !== id));
    setDeals(prev => theirs ? prev.map(d => d.id === id ? theirs : d) : prev.filter(d => d.id !== id));
    Sentry.addBreadcrumb({ category: 'sync', message: 'conflict: load theirs', data: { deleted: !theirs }, level: 'info' });
  }, []);

  // A deleted deal shouldn't keep a pending conflict prompt.
  const forgetDeal = useCallback((id) => {
    syncRef.current.forget(id);
    setConflicts(c => c.filter(x => x.id !== id));
  }, []);

  // Clear the "needs review" badge once the last conflict is resolved.
  useEffect(() => {
    if (conflicts.length === 0) setSyncStatus(s => s === "conflict" ? "idle" : s);
  }, [conflicts.length]);

  // Expose ref setter for auth bootstrap to use
  const setLastCloudUpdate = (val) => { lastCloudUpdate.current = val; };

  return {
    deals, setDeals, loadDeals,
    syncStatus, syncError, lastSyncedAt,
    forceRefresh, setLastCloudUpdate,
    conflicts, keepMine, loadTheirs, forgetDeal,
  };
}
