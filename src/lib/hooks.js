// ─── Custom React hooks ──────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import { isChunkError } from './chunkError';

// ─── lazyWithRetry ────────────────────────────────────────────────────────────
// Drop-in replacement for React.lazy() that auto hard-reloads on stale-chunk
// errors (the "Failed to fetch dynamically imported module" error users see
// after a new Cloudflare deployment invalidates old chunk hashes).
//
// The retry key is scoped to the import function's source string so that two
// different chunks failing in the same session each get one reload attempt,
// rather than the first failure blocking retries for all subsequent chunks.
//
// A sessionStorage flag prevents infinite reload loops: if a reload was already
// attempted for this chunk, we give up and let the ErrorBoundary handle it.
function lazyWithRetry(importFn) {
  const retryKey = 'rh_chunk_retry_' + importFn.toString().slice(-32);
  return React.lazy(() =>
    importFn().catch(err => {
      if (!isChunkError(err)) throw err;

      if (sessionStorage.getItem(retryKey)) {
        // Already reloaded once for this chunk — give up and surface the error
        sessionStorage.removeItem(retryKey);
        throw err;
      }

      sessionStorage.setItem(retryKey, '1');
      window.location.reload();
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
