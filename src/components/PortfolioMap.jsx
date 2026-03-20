import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { FMT_PCT, FMT_USD, GMAPS_KEY, STATUS_COLORS } from '../lib/constants';
import { calcDeal } from '../lib/calc';


function PortfolioMap({deals, onSelect}) {
  const mapRef = useRef(null);
  const mapObjRef = useRef(null);
  const markersRef = useRef([]);
  const infoRef = useRef(null);
  const [mapReady, setMapReady] = useState(!!window.google?.maps);
  const [collapsed, setCollapsed] = useState(false);
  const addressedDeals = deals.filter(d => d.address && d.address.trim().length > 3);

  // Load Maps JS API once
  useEffect(() => {
    if (window.google?.maps) { setMapReady(true); return; }
    if (document.getElementById('gmaps-script')) return;
    const s = document.createElement('script');
    s.id = 'gmaps-script';
    s.src = `https://maps.googleapis.com/maps/api/js?key=${GMAPS_KEY}&libraries=places&callback=__gmapsReady`;
    s.async = true;
    window.__gmapsReady = () => { setMapReady(true); delete window.__gmapsReady; };
    document.head.appendChild(s);
  }, []);

  // Init map once API ready and container visible
  useEffect(() => {
    if (!mapReady || !mapRef.current || collapsed) return;
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
  }, [mapReady, collapsed]);

  // Re-sync markers whenever deals change
  useEffect(() => {
    if (!mapObjRef.current) return;
    syncMarkers();
  }, [deals]);

  function syncMarkers() {
    // Clear old markers
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];
    if (!addressedDeals.length) return;

    const geocoder = new window.google.maps.Geocoder();
    const bounds = new window.google.maps.LatLngBounds();
    let resolved = 0;

    addressedDeals.forEach(deal => {
      geocoder.geocode({ address: deal.address }, (results, status) => {
        if (status !== 'OK' || !results[0]) { resolved++; return; }
        const pos = results[0].geometry.location;
        bounds.extend(pos);
        const r = calcDeal(deal);
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
          const content = `
            <div style="font-family:'DM Sans','Segoe UI',sans-serif;min-width:200px;padding:4px 2px">
              <div style="font-weight:800;font-size:14px;color:#1f2328;margin-bottom:6px;line-height:1.3">${deal.address}</div>
              <span style="background:${color}22;color:${color};border-radius:4px;padding:2px 8px;font-size:11px;font-weight:700">${deal.status}</span>
              <div style="margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:6px">
                <div><div style="font-size:10px;color:#656d76;font-weight:700;text-transform:uppercase;letter-spacing:.05em">Price</div><div style="font-size:13px;font-weight:700;color:#1f2328">${FMT_USD(+deal.assumptions.purchasePrice)}</div></div>
                <div><div style="font-size:10px;color:#656d76;font-weight:700;text-transform:uppercase;letter-spacing:.05em">IRR</div><div style="font-size:13px;font-weight:700;color:#0D9488">${FMT_PCT(r.irr)}</div></div>
                <div><div style="font-size:10px;color:#656d76;font-weight:700;text-transform:uppercase;letter-spacing:.05em">CoC Yr1</div><div style="font-size:13px;font-weight:700;color:#0D9488">${FMT_PCT(r.cocReturn)}</div></div>
                <div><div style="font-size:10px;color:#656d76;font-weight:700;text-transform:uppercase;letter-spacing:.05em">NOI Yr1</div><div style="font-size:13px;font-weight:700;color:#1f2328">${FMT_USD(r.noi)}</div></div>
              </div>
              <button onclick="window.__openDeal_${deal.id}()" style="margin-top:10px;width:100%;background:#0D9488;color:#fff;border:none;border-radius:8px;padding:7px 0;font-size:12px;font-weight:800;cursor:pointer;font-family:inherit">Open Deal →</button>
            </div>`;
          window[`__openDeal_${deal.id}`] = () => { onSelect(deal.id); infoRef.current.close(); };
          infoRef.current.setContent(content);
          infoRef.current.open(mapObjRef.current, marker);
        });

        markersRef.current.push(marker);
        resolved++;
        if (resolved === addressedDeals.length && markersRef.current.length > 0) {
          if (markersRef.current.length === 1) {
            mapObjRef.current.setCenter(pos);
            mapObjRef.current.setZoom(14);
          } else {
            mapObjRef.current.fitBounds(bounds, 60);
          }
        }
      });
    });
  }

  if (!addressedDeals.length) return null;

  return (
    <div style={{marginBottom:20,border:"1px solid var(--border)",borderRadius:12,overflow:"hidden"}}>
      <div
        onClick={()=>setCollapsed(v=>!v)}
        style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",background:"var(--card)",cursor:"pointer",userSelect:"none"}}
      >
        <span style={{fontSize:12,fontWeight:800,letterSpacing:"0.08em",color:"var(--muted)",textTransform:"uppercase"}}>📍 Portfolio Map — {addressedDeals.length} propert{addressedDeals.length===1?"y":"ies"}</span>
        <span style={{fontSize:12,color:"var(--muted)",fontWeight:700}}>{collapsed?"Show ▾":"Hide ▴"}</span>
      </div>
      {!collapsed && (
        <div ref={mapRef} style={{width:"100%",height:380,display:"block"}}/>
      )}
      {!collapsed && !mapReady && (
        <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",background:"var(--card)",color:"var(--muted)",fontSize:13}}>Loading map…</div>
      )}
    </div>
  );
}

// ─── PORTFOLIO PAGE ────────────────────────────────────────────────────────────

export default PortfolioMap;
