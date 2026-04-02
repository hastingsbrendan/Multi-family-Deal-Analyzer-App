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
 * Reverse-geocode lat/lng to county FIPS and MSA code using the Census Geocoder.
 * Free, no API key, no proxy needed.
 * @param {number} lat
 * @param {number} lng
 * Returns { countyFips, countyName, stateFips, msaCode, msaName } or null.
 */
export async function getCountyAndMsa(lat, lng) {
  if (lat == null || lng == null) return null;
  try {
    const params = new URLSearchParams({
      x: String(lng),
      y: String(lat),
      benchmark: 'Public_AR_Census2020',
      vintage: 'Census2020_Census2020',
      layers: 'Counties,Metropolitan Statistical Areas',
      format: 'json',
    });
    const res = await fetch(
      `https://geocoding.geo.census.gov/geocoder/geographies/coordinates?${params}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const geographies = data?.result?.geographies;
    if (!geographies) return null;

    // County
    const counties = geographies['Counties'] || [];
    const county = counties[0];
    if (!county) return null;
    const stateFips  = county.STATE;
    const countyFips = county.STATE + county.COUNTY;
    const countyName = county.NAME || county.BASENAME || null;

    // MSA — try Metro first, fall back to Micro
    const msaFeatures =
      geographies['Metropolitan Statistical Areas'] ||
      geographies['Micropolitan Statistical Areas'] ||
      [];
    const msa = msaFeatures[0] || null;
    const msaCode = msa ? (msa.CBSA || null) : null;
    const msaName = msa ? (msa.NAME || msa.BASENAME || null) : null;

    return { countyFips, countyName, stateFips, msaCode, msaName };
  } catch {
    return null;
  }
}

/**
 * Convenience pipeline: address → lat/lng → county/MSA.
 * @param {string} address
 * @param {string} [token] — Supabase access_token for geocode proxy auth
 * Returns { countyFips, countyName, stateFips, msaCode, msaName } or null.
 */
export async function getCountyAndMsaForAddress(address, token) {
  const coords = await geocodeAddress(address, token);
  if (!coords) return null;
  return getCountyAndMsa(coords.lat, coords.lng);
}

/**
 * Human-readable flood zone metadata.
 */
export function floodZoneInfo(zone) {
  if (!zone) return null;
  const z = zone.toUpperCase();
  if (z === 'X' || z === 'X500') return {
    risk: 'low', label: `Zone ${zone}`, color: 'var(--green)', bg: 'rgba(16,185,129,0.08)',
    desc: 'Minimal flood risk — outside 500-year floodplain',
    flagSeverity: null,
  };
  if (z.startsWith('V')) return {
    risk: 'critical', label: `Zone ${zone}`, color: 'var(--red)', bg: 'rgba(239,68,68,0.08)',
    desc: 'Coastal high-risk — mandatory flood insurance likely required',
    flagSeverity: 'critical',
  };
  if (z.startsWith('A')) return {
    risk: 'high', label: `Zone ${zone}`, color: 'var(--refi-amber)', bg: 'rgba(245,158,11,0.08)',
    desc: 'High-risk flood zone — flood insurance typically required by lenders',
    flagSeverity: 'warning',
  };
  if (z === 'D') return {
    risk: 'unknown', label: `Zone ${zone}`, color: 'var(--rentcast-indigo)', bg: 'rgba(99,102,241,0.08)',
    desc: 'Undetermined flood risk — possible but not assessed by FEMA',
    flagSeverity: null,
  };
  return {
    risk: 'moderate', label: `Zone ${zone}`, color: 'var(--refi-amber)', bg: 'rgba(245,158,11,0.08)',
    desc: 'Moderate-to-low flood risk',
    flagSeverity: null,
  };
}
