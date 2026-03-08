import { useState, useEffect, useRef, useCallback } from 'react';
import { loadLocal, saveLocal, sbRead, sbWrite } from './constants';

export function useCloudSync(user, isOnline) {
  const [deals, setDeals] = useState(null);
  const [syncStatus, setSyncStatus] = useState("idle");
  const [syncError, setSyncError] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const syncTimer = useRef(null);
  const lastCloudUpdate = useRef(null);

  // Debounced write to cloud when deals change
  useEffect(() => {
    if (deals === null || !user) return;
    saveLocal(deals, user?.id);
    if (!isOnline) { setSyncStatus("offline"); return; }
    clearTimeout(syncTimer.current);
    setSyncStatus("saving");
    syncTimer.current = setTimeout(async () => {
      try {
        await sbWrite(deals);
        setSyncStatus("saved");
        setSyncError("");
        setLastSyncedAt(new Date());
        setTimeout(() => setSyncStatus("idle"), 2000);
      } catch(e) { setSyncStatus("error"); setSyncError(e.message); }
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
    forceRefresh, setLastCloudUpdate
  };
}
