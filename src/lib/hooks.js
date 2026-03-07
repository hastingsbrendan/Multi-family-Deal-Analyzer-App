// ─── Custom React hooks ──────────────────────────────────────────────────────
import { useState, useEffect } from 'react';

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

export { useIsMobile, useOnlineStatus };
