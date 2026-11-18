/**
 * Cloudflare Pages Function — BLS proxy
 * Route: /api/bls?series_id=LAUCA250250000000000003&startyear=2023&endyear=2025
 *
 * BLS v2 API requires a POST with JSON body (not GET with query params).
 * BLS data is public — no JWT auth required (unlike rentcast/geocode proxies).
 *
 * Required env var in Cloudflare Pages:
 *   BLS_API_KEY=<your key>   (server-side only — never shipped to the browser)
 *
 * Accept GET params:
 *   series_id   — comma-separated BLS series IDs
 *   startyear   — 4-digit year (default: current year - 2)
 *   endyear     — 4-digit year (default: current year)
 */
import { preflight, json, corsHeaders as cors, isFromOurSite } from '../../server/proxyAuth.js';

// Public data, so no sign-in, but only our own site may use our key (2026-11, M6:
// it was an open relay with CORS "*"; BLS allows 500 queries a day per key).
export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') return preflight(request);
  if (request.method !== 'GET') return json(request, { error: 'Method not allowed' }, 405);
  if (!isFromOurSite(request)) return json(request, { error: 'Forbidden' }, 403);

  const apiKey = env.BLS_API_KEY;
  if (!apiKey) return json(request, { error: 'Server misconfigured' }, 500);

  const corsHeaders = { ...cors(request), 'Cache-Control': 'public, max-age=3600' };

  const inUrl = new URL(request.url);
  const seriesRaw = inUrl.searchParams.get('series_id') || '';
  // BLS series IDs are upper-case letters and digits; 50 per request is the API maximum
  const seriesIds = seriesRaw.split(',').map(s => s.trim().toUpperCase()).filter(s => /^[A-Z0-9]{5,40}$/.test(s)).slice(0, 50);
  if (seriesIds.length === 0) return json(request, { error: 'series_id is required' }, 400);

  const currentYear = new Date().getFullYear();
  const year = (v, d) => (/^\d{4}$/.test(v || '') && +v >= 1990 && +v <= currentYear + 1 ? v : String(d));
  const startYear = year(inUrl.searchParams.get('startyear'), currentYear - 2);
  const endYear   = year(inUrl.searchParams.get('endyear'), currentYear);

  const body = JSON.stringify({
    seriesid: seriesIds,
    startyear: startYear,
    endyear: endYear,
    registrationkey: apiKey,
  });

  try {
    const upstream = await fetch('https://api.bls.gov/publicAPI/v2/timeseries/data/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body,
    });
    const responseBody = await upstream.text();
    return new Response(responseBody, { status: upstream.status, headers: corsHeaders });
  } catch {
    return new Response(JSON.stringify({ error: 'Labor data service unavailable' }), { status: 502, headers: corsHeaders });
  }
}
