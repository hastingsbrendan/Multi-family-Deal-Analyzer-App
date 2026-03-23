// ─── Custom React hooks ──────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';

// ─── lazyWithRetry ────────────────────────────────────────────────────────────
// Drop-in replacement for React.lazy() that auto hard-reloads on stale-chunk
// errors (the "Failed to fetch dynamically imported module" error users see
// after a new Cloudflare deployment invalidates old chunk hashes).
//
// A sessionStorage flag prevents infinite reload loops: if a reload was already
// attempted for this error, we give up and let the ErrorBoundary handle it.
function lazyWithRetry(importFn) {
  return React.lazy(() =>
    importFn().catch(err => {
      const msg = err?.message || '';
      const isChunk =
        msg.includes('Failed to fetch dynamically imported module') ||
        msg.includes('Loading chunk') ||
        msg.includes('ChunkLoadError') ||
        msg.includes('dynamically imported module');

      if (!isChunk) throw err;

      const retryKey = 'rh_chunk_reload_attempted';
      if (sessionStorage.getItem(retryKey)) {
        // Already reloaded once — give up and surface the error
        sessionStorage.removeItem(retryKey);
        throw err;
      }

      sessionStorage.setItem(retryKey, '1');
      window.location.href = window.location.href; // eslint-disable-line no-self-assign
      // Return a never-resolving promise — the reload fires before this matters
      return new Promise(() => {});
    })
  );
}

function useIsMobile() {
  const [m, setM] = useState(window.innerWidth < 768);
  useEffect(() => { const fn = () => setM(window.innerWidth < 768); window.addEventListener('resize',fn); return ()=>window.removeEventListener('resize',fn); }, []);
  return m;
}

function useOnlineStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online',on); window.removeEventListener('offline',off); };
  }, []);
  return online;
}

export { useIsMobile, useOnlineStatus, lazyWithRetry };
