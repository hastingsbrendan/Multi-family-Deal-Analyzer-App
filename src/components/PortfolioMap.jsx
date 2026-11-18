import React, { useState, useEffect, useRef } from 'react';
import { FMT_PCT, FMT_USD, GMAPS_KEY, STATUS_COLORS } from '../lib/constants';
import { calcDeal } from '../lib/calc';

// Geocoding every deal on every page load (and again after every edit) cost one
// billable lookup per deal each time. Coordinates for an address never change, so
// keep them in this browser and only look up addresses we haven't seen.
const GEO_CACHE_KEY = 'rh_geocode_v1';
function readGeoCache() {
  try { return JSON.parse(localStorage.getItem(GEO_CACHE_KEY)) || {}; } catch { return {}; }
}
function writeGeoCache(cache) {
  try { localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(cache)); } catch { /* storage full or blocked: cache is optional */ }
}
const geoKey = addr => addr.trim().toLowerCase();

// The info window is Google's white popup in both themes, so it uses fixed light-theme
// colours. Built from DOM nodes with textContent: deal addresses come from users
// (including other group members) and must never be parsed as HTML.
function el(tag, style, text) {
  const n = document.createElement(tag);
  if (style) n.style.cssText = style;
  if (text != null) n.textContent = text;
  return n;
}
function infoContent(deal, color, onOpen) {
  const r = calcDeal(deal);
  const root = el('div', "font-family:'DM Sans','Segoe UI',sans-serif;min-width:200px;padding:4px 2px");
  root.appendChild(el('div', 'font-weight:800;font-size:14px;color:#1f2328;margin-bottom:6px;line-height:1.3', deal.address));
  root.appendChild(el('span', `background:${color}22;color:${color};border-radius:4px;padding:2px 8px;font-size:11px;font-weight:700`, deal.status));
  const grid = el('div', 'margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:6px');
  [['Price', FMT_USD(+deal.assumptions.purchasePrice), '#1f2328'],
   ['IRR', FMT_PCT(r.irr), '#0D9488'],
   ['CoC Yr1', FMT_PCT(r.cocReturn), '#0D9488'],
   ['NOI Yr1', FMT_USD(r.noi), '#1f2328']].forEach(([label, value, c]) => {
    const cell = el('div');
    cell.appendChild(el('div', 'font-size:10px;color:#656d76;font-weight:700;text-transform:uppercase;letter-spacing:.05em', label));
    cell.appendChild(el('div', `font-size:13px;font-weight:700;color:${c}`, value));
    grid.appendChild(cell);
  });
  root.appendChild(grid);
  const btn = el('button', 'margin-top:10px;width:100%;background:#0D9488;color:#fff;border:none;border-radius:8px;padding:7px 0;font-size:12px;font-weight:800;cursor:pointer;font-family:inherit', 'Open Deal →');
  btn.type = 'button';
  btn.addEventListener('click', onOpen);
  root.appendChild(btn);
  return root;
}

function PortfolioMap({deals, onSelect}) {
  const mapRef = useRef(null);
  const mapObjRef = useRef(null);
  const markersRef = useRef([]);
  const infoRef = useRef(null);
  const [mapReady, setMapReady] = useState(!!window.google?.maps);
  // Maps can fail outside our control (billing, key restrictions, ad blockers,
  // offline). Show a quiet note instead of Google's error dialog or a stuck spinner.
  const [failed, setFailed] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const addressedDeals = deals.filter(d => d.address && d.address.trim().length > 3);

  // Load Maps JS API once
  useEffect(() => {
    if (window.google?.maps) { setMapReady(true); return; }
    // Google calls this global on key/billing problems.
    window.gm_authFailure = () => setFailed(true);
    const timeout = setTimeout(() => { if (!window.google?.maps) setFailed(true); }, 15000);
    const existing = document.getElementById('gmaps-script');
    if (existing) {
      existing.addEventListener('load', () => setMapReady(!!window.google?.maps));
      return () => clearTimeout(timeout);
    }
    const s = document.createElement('script');
    s.id = 'gmaps-script';
    s.src = `https://maps.googleapis.com/maps/api/js?key=${GMAPS_KEY}&libraries=places&callback=__gmapsReady`;
    s.async = true;
    s.onerror = () => setFailed(true);
    window.__gmapsReady = () => { setMapReady(true); delete window.__gmapsReady; };
    document.head.appendChild(s);
    return () => clearTimeout(timeout);
  }, []);

  // Init map once API ready and container visible
  useEffect(() => {
    if (!mapReady || failed || !mapRef.current || collapsed) return;
    if (!mapObjRef.current) {
      mapObjRef.current = new window.google.maps.Map(mapRef.current, {
        zoom: 10,
        center: { lat: 41.8781, lng: -87.6298 }, // default: Chicago
        mapTypeId: 'roadmap',
        styles: [{featureType:"poi",stylers:[{visibility:"off"}]},{featureType:"transit",stylers:[{visibility:"off"}]}],
        disableDefaultUI: false,
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true });
      infoRef.current = new window.google.maps.InfoWindow();
    }
    syncMarkers();
  }, [mapReady, collapsed, failed]);

  // Re-sync markers when the set of addresses or their status/numbers change.
  // Geocodes come from the cache, so this no longer costs a lookup per deal.
  useEffect(() => {
    if (!mapObjRef.current || failed) return;
    syncMarkers();
  }, [deals]);

  function placeMarker(deal, pos, bounds) {
    bounds.extend(pos);
    const color = STATUS_COLORS[deal.status] || '#8b949e';
    // Custom pin SVG colored by status
    const pinSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40">
      <path d="M16 0C7.163 0 0 7.163 0 16c0 10 16 24 16 24s16-14 16-24C32 7.163 24.837 0 16 0z" fill="${color}" stroke="white" stroke-width="2"/>
      <circle cx="16" cy="16" r="6" fill="white"/>
    </svg>`;
    const icon = {
      url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(pinSvg),
      scaledSize: new window.google.maps.Size(32, 40),
      anchor: new window.google.maps.Point(16, 40) };
    const marker = new window.google.maps.Marker({ position: pos, map: mapObjRef.current, icon, title: deal.address });
    marker.addListener('click', () => {
      infoRef.current.setContent(infoContent(deal, color, () => { onSelect(deal.id); infoRef.current.close(); }));
      infoRef.current.open(mapObjRef.current, marker);
    });
    markersRef.current.push(marker);
  }

  function fitAll(bounds) {
    const n = markersRef.current.length;
    if (!n) return;
    if (n === 1) { mapObjRef.current.setCenter(markersRef.current[0].getPosition()); mapObjRef.current.setZoom(14); }
    else mapObjRef.current.fitBounds(bounds, 60);
  }

  function syncMarkers() {
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];
    if (!addressedDeals.length) return;

    const cache = readGeoCache();
    const bounds = new window.google.maps.LatLngBounds();
    const missing = [];
    addressedDeals.forEach(deal => {
      const hit = cache[geoKey(deal.address)];
      if (hit) placeMarker(deal, hit, bounds); else missing.push(deal);
    });
    if (!missing.length) { fitAll(bounds); return; }

    const geocoder = new window.google.maps.Geocoder();
    let pending = missing.length;
    missing.forEach(deal => {
      geocoder.geocode({ address: deal.address }, (results, status) => {
        if (status === 'REQUEST_DENIED') setFailed(true);
        if (status === 'OK' && results[0]) {
          const loc = results[0].geometry.location;
          const pos = { lat: loc.lat(), lng: loc.lng() };
          cache[geoKey(deal.address)] = pos;
          placeMarker(deal, pos, bounds);
        }
        if (--pending === 0) { writeGeoCache(cache); fitAll(bounds); }
      });
    });
  }

  if (!addressedDeals.length) return null;

  return (
    <div style={{marginBottom:20,border:"1px solid var(--border)",borderRadius:12,overflow:"hidden",position:"relative"}}>
      <button
        type="button"
        onClick={()=>setCollapsed(v=>!v)}
        aria-expanded={!collapsed}
        style={{display:"flex",width:"100%",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",background:"var(--card)",cursor:"pointer",userSelect:"none",border:"none",fontFamily:"inherit"}}
      >
        <span style={{fontSize:12,fontWeight:800,letterSpacing:"0.08em",color:"var(--muted)",textTransform:"uppercase"}}>📍 Portfolio Map — {addressedDeals.length} propert{addressedDeals.length===1?"y":"ies"}</span>
        <span style={{fontSize:12,color:"var(--muted)",fontWeight:700}}>{collapsed?"Show ▾":"Hide ▴"}</span>
      </button>
      {!collapsed && failed && (
        <div style={{padding:"18px 14px",background:"var(--card)",borderTop:"1px solid var(--border)",color:"var(--muted)",fontSize:13}}>
          Map unavailable right now. Your deals are listed below.
        </div>
      )}
      {!collapsed && !failed && (
        <div style={{position:"relative",height:380}}>
          <div ref={mapRef} style={{width:"100%",height:"100%",display:"block"}}/>
          {!mapReady && (
            <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",background:"var(--card)",color:"var(--muted)",fontSize:13}}>Loading map…</div>
          )}
        </div>
      )}
    </div>
  );
}

export default PortfolioMap;
