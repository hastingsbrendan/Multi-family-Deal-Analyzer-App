/**
 * floodZone.js
 * Fetches FEMA National Flood Hazard Layer (NFHL) flood zone designation
 * for a given address by:
 *  1. Geocoding the address via /api/geocode (server-side proxy — keeps GMAPS_KEY off the client)
 *  2. Querying FEMA NFHL ArcGIS REST service (no key required)
 */

// FEMA NFHL ArcGIS REST endpoint — Flood Hazard Areas (layer 28)
const FEMA_URL = 'https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query';

/**
 * Geocode an address via the /api/geocode server-side proxy.
 * @param {string} address
 * @param {string} [token]  — Supabase access_token for proxy auth (optional; unauthenticated = 401)
 * Returns { lat, lng } or null.
 */
export async function geocodeAddress(address, token) {
  if (!address) return null;
  try {
    const headers = { 'Accept': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`/api/geocode?address=${encodeURIComponent(address)}`, { headers });
    if (!res.ok) return null;
    const data = await res.json();
    const loc = data?.results?.[0]?.geometry?.location;
    return loc ? { lat: loc.lat, lng: loc.lng } : null;
  } catch {
    return null;
  }
}

/**
 * Query FEMA NFHL for flood zone at the given lat/lng.
 * Returns zone string like "AE", "X", "VE", or null if unavailable.
 */
export async function fetchFloodZone(lat, lng) {
  if (lat == null || lng == null) return null;
  try {
    const params = new URLSearchParams({
      geometry: `${lng},${lat}`,
      geometryType: 'esriGeometryPoint',
      spatialRel: 'esriSpatialRelIntersects',
      inSR: '4326',
      outSR: '4326',
      outFields: 'FLD_ZONE,ZONE_SUBTY,SFHA_TF',
      returnGeometry: 'false',
      f: 'json',
    });
    const res = await fetch(`${FEMA_URL}?${params}`);
    if (!res.ok) return null;
    const data = await res.json();
    const feature = data?.features?.[0];
    if (!feature) return 'X'; // outside all flood zones = minimal risk
    return feature.attributes?.FLD_ZONE || null;
  } catch {
    return null;
  }
}

/**
 * Full pipeline: address → lat/lng → flood zone.
 * @param {string} address
 * @param {string} [token] — Supabase access_token for geocode proxy auth
 * Returns zone string or null.
 */
export async function getFloodZoneForAddress(address, token) {
  const coords = await geocodeAddress(address, token);
  if (!coords) return null;
  return fetchFloodZone(coords.lat, coords.lng);
}

/**
 * Human-readable flood zone metadata.
 */
export function floodZoneInfo(zone) {
  if (!zone) return null;
  const z = zone.toUpperCase();
  if (z === 'X' || z === 'X500') return {
    risk: 'low', label: `Zone ${zone}`, color: '#10b981', bg: '#10b98115',
    desc: 'Minimal flood risk — outside 500-year floodplain',
    flagSeverity: null,
  };
  if (z.startsWith('V')) return {
    risk: 'critical', label: `Zone ${zone}`, color: '#ef4444', bg: '#ef444415',
    desc: 'Coastal high-risk — mandatory flood insurance likely required',
    flagSeverity: 'critical',
  };
  if (z.startsWith('A')) return {
    risk: 'high', label: `Zone ${zone}`, color: '#f59e0b', bg: '#f59e0b15',
    desc: 'High-risk flood zone — flood insurance typically required by lenders',
    flagSeverity: 'warning',
  };
  if (z === 'D') return {
    risk: 'unknown', label: `Zone ${zone}`, color: '#6366f1', bg: '#6366f115',
    desc: 'Undetermined flood risk — possible but not assessed by FEMA',
    flagSeverity: null,
  };
  return {
    risk: 'moderate', label: `Zone ${zone}`, color: '#f59e0b', bg: '#f59e0b15',
    desc: 'Moderate-to-low flood risk',
    flagSeverity: null,
  };
}
