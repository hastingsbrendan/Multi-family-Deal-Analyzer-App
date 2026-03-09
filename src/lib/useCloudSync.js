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
        if (dirty.size > 0 && dirty.size < deals.length) {
          // Granular path: only write changed deals
          const changedDeals = deals.filter(d => dirty.has(d.id));
          await Promise.all(changedDeals.map(d => sbWriteDeal(d)));
          Sentry.addBreadcrumb({ category: 'sync', message: 'saved (granular)', data: { changed: dirty.size, total: deals.length }, level: 'info' });
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
        Sentry.addBreadcrumb({ category: 'sync', message: 'save error', data: { error: e.message, deals: deals.length }, level: 'error' });
      }
    }, 800);
  }, [deals, isOnline]);

  // Re-pull from cloud when tab regains visibility or window is focused
  useEffect(() => {
    const pull = () => {
      if (!user || !isOnline || syncStatus === "saving") return;
      sbRead()
        .then(({ data: cloudDeals, updated_at }) => {
          if (updated_at && updated_at === lastCloudUpdate.current) return;
          lastCloudUpdate.current = updated_at;
          setDeals(cloudDeals);
          saveLocal(cloudDeals, user?.id);
          setSyncStatus("saved");
          setLastSyncedAt(new Date());
          setTimeout(() => setSyncStatus("idle"), 2000);
        })
        .catch(() => {});
    };
    const onVisible = () => { if (document.visibilityState === "visible") pull(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", pull);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", pull);
    };
  }, [user, isOnline, syncStatus]);

  // Re-attempt sync when coming back online
  useEffect(() => {
    if (isOnline && syncStatus === "offline" && deals !== null) {
      sbWrite(deals)
        .then(() => { setSyncStatus("saved"); setLastSyncedAt(new Date()); setTimeout(() => setSyncStatus("idle"), 2000); })
        .catch(e => { setSyncStatus("error"); setSyncError(e.message); });
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
