import { useState, useEffect, useRef, useCallback } from 'react';
import * as Sentry from '@sentry/react';
import { loadLocal, saveLocal, sbRead, sbWrite, sbWriteDeal } from './constants';

export function useCloudSync(user, isOnline) {
  const [deals, setDeals] = useState(null);
  const [syncStatus, setSyncStatus] = useState("idle");
  const [syncError, setSyncError] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const syncTimer = useRef(null);
  const lastCloudUpdate = useRef(null);
  // Track which deal IDs have pending changes for granular writes
  const pendingDealIds = useRef(new Set());
  const prevDeals = useRef(null);

  // Granular update: called by App when a single deal is updated
  // Queues just that deal ID for the next sync flush
  const markDealDirty = useCallback((dealId) => {
    pendingDealIds.current.add(dealId);
  }, []);

  // Debounced write to cloud when deals change
  useEffect(() => {
    if (deals === null || !user) return;
    saveLocal(deals, user?.id);
    if (!isOnline) {
      setSyncStatus("offline");
      Sentry.addBreadcrumb({ category: 'sync', message: 'offline — queued', data: { deals: deals.length, online: navigator.onLine }, level: 'warning' });
      return;
    }
    clearTimeout(syncTimer.current);
    setSyncStatus("saving");
    syncTimer.current = setTimeout(async () => {
      try {
        const dirty = pendingDealIds.current;
        if (dirty.size > 0) {
          // Granular path: only write changed deals.
          // Changed condition from `dirty.size < deals.length` to just `dirty.size > 0`
          // so that adding the very first deal (dirty.size === deals.length === 1) still
          // takes the granular path and gets a _deal_id back-filled (see below).
          const changedDeals = deals.filter(d => dirty.has(d.id));
          const results = await Promise.all(changedDeals.map(d => sbWriteDeal(d)));
          Sentry.addBreadcrumb({ category: 'sync', message: 'saved (granular)', data: { changed: dirty.size, total: deals.length }, level: 'info' });
          // Back-fill _deal_id for newly-persisted deals (those that had no UUID yet).
          // sbWriteDeal returns the DB-assigned uuid. Without this, every subsequent
          // granular write of the same new deal would insert another duplicate row.
          // Note: setDeals triggers the sync effect again; we do NOT add these deals
          // to pendingDealIds so the next sync sees dirty.size===0 and skips the write.
          const idUpdates = {};
          changedDeals.forEach((d, i) => { if (!d._deal_id && results[i]) idUpdates[d.id] = results[i]; });
          if (Object.keys(idUpdates).length > 0) {
            setDeals(prev => prev.map(d => idUpdates[d.id] ? { ...d, _deal_id: idUpdates[d.id] } : d));
          }
        } else {
          // Bulk path: initial sync, reorder, or first write
          await sbWrite(deals);
          Sentry.addBreadcrumb({ category: 'sync', message: 'saved (bulk)', data: { deals: deals.length }, level: 'info' });
        }
        pendingDealIds.current = new Set();
        setSyncStatus("saved");
        setSyncError("");
        setLastSyncedAt(new Date());
        setTimeout(() => setSyncStatus("idle"), 2000);
      } catch(e) {
        setSyncStatus("error");
        setSyncError(e.message);
        Sentry.captureException(e, { tags: { origin: 'useCloudSync.sbWrite' }, extra: { dealCount: deals.length } });
      }
    }, 800);
    return () => clearTimeout(syncTimer.current);
  }, [deals, isOnline]);

  // Focus/visibility pull intentionally removed — it raced with the 800ms debounced
  // write and caused edits to be overwritten. Sequence: edit → setDeals → saveLocal
  // → 800ms → sbWrite → pendingDealIds.clear(). If user switched windows during
  // that window, focus-return saw pendingDealIds.size===0 and overwrote with stale
  // cloud data. Bootstrap on login + debounced write is sufficient for sync.

  // Re-attempt sync when coming back online
  useEffect(() => {
    if (isOnline && syncStatus === "offline" && deals !== null) {
      sbWrite(deals)
        .then(() => { setSyncStatus("saved"); setLastSyncedAt(new Date()); setTimeout(() => setSyncStatus("idle"), 2000); })
        .catch(e => {
          setSyncStatus("error");
          setSyncError(e.message);
          Sentry.captureException(e, { tags: { origin: 'useCloudSync.reOnlineSync' } });
        });
    }
  }, [isOnline]);

  const forceRefresh = useCallback(() => {
    setSyncStatus("saving");
    sbRead()
      .then(({ data: cloudDeals, updated_at }) => {
        lastCloudUpdate.current = updated_at;
        setDeals(cloudDeals);
        saveLocal(cloudDeals, user?.id);
        setSyncStatus("saved");
        setLastSyncedAt(new Date());
        setTimeout(() => setSyncStatus("idle"), 2000);
      })
      .catch(e => { setSyncStatus("error"); setSyncError(e.message); });
  }, [user]);

  // Expose ref setter for auth bootstrap to use
  const setLastCloudUpdate = (val) => { lastCloudUpdate.current = val; };

  return {
    deals, setDeals,
    syncStatus, syncError, lastSyncedAt,
    forceRefresh, setLastCloudUpdate,
    markDealDirty,
  };
}
