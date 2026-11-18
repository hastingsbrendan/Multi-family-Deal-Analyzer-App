/**
 * Cloudflare Pages Function — Rentcast API proxy
 * Route: /api/rentcast?path=/v1/properties&address=...&limit=1
 *        /api/rentcast?path=/v1/avm/rent/long-term&address=...&bedrooms=2
 *        /api/rentcast?path=/v1/markets&zipCode=60601&dataType=All&historyMonths=12
 *
 * Keeps RENTCAST_KEY server-side. Every call costs Rentcast quota, so (2026-11, M6):
 *   - the caller must be signed in, on a trial or Pro (checked here, not just in the UI)
 *   - each user gets RENTCAST_DAILY_LIMIT calls per day (≈20 property lookups)
 *   - only the exact endpoints and query parameters the app uses are forwarded
 *     (a prefix check let "/v1/properties/../anything" through)
 *   - responses are CORS-enabled for our own origins only
 *
 * Env (Cloudflare Pages secrets): RENTCAST_KEY, SUPABASE_URL, SUPABASE_ANON_KEY.
 * Optional: RENTCAST_PAUSED = "true" to switch all lookups off.
 */
import { preflight, json, corsHeaders, verifyUser, tierOf, useDailyAllowance } from '../../server/proxyAuth.js';

const RENTCAST_BASE = 'https://api.rentcast.io';
export const RENTCAST_DAILY_LIMIT = 60; // calls; a property lookup uses 2–3

// Endpoint → query parameters it may receive
export const ALLOWED = {
  '/v1/properties':         ['address', 'limit'],
  '/v1/avm/rent/long-term': ['address', 'bedrooms', 'bathrooms', 'propertyType', 'squareFootage'],
  '/v1/markets':            ['zipCode', 'dataType', 'historyMonths'],
};

export async function onRequest({ request, env }, fetchImpl = fetch) {
  if (request.method === 'OPTIONS') return preflight(request);
  if (request.method !== 'GET') return json(request, { error: 'Method not allowed' }, 405);

  if (env.RENTCAST_PAUSED === 'true') {
    return json(request, { error: 'Property data is temporarily unavailable.', paused: true }, 503);
  }

  const auth = await verifyUser(request, env, fetchImpl);
  if (auth.error) return json(request, { error: auth.error }, auth.status);
  if (tierOf(auth.user) === 'locked') {
    return json(request, { error: 'Property and market data are part of RentHack Pro.', upgrade: true }, 403);
  }

  if (!env.RENTCAST_KEY) return json(request, { error: 'Server misconfigured' }, 500);

  const inUrl = new URL(request.url);
  const apiPath = inUrl.searchParams.get('path') || '';
  const allowedParams = Object.prototype.hasOwnProperty.call(ALLOWED, apiPath) ? ALLOWED[apiPath] : null;
  if (!allowedParams) return json(request, { error: 'Unsupported endpoint' }, 400);

  const upstreamUrl = new URL(RENTCAST_BASE + apiPath);
  for (const k of allowedParams) {
    const v = inUrl.searchParams.get(k);
    if (v != null && v !== '') upstreamUrl.searchParams.set(k, v.slice(0, 200));
  }
  if (upstreamUrl.searchParams.has('limit')) {
    upstreamUrl.searchParams.set('limit', String(Math.min(5, Math.max(1, parseInt(upstreamUrl.searchParams.get('limit'), 10) || 1))));
  }

  const allowance = await useDailyAllowance(env, auth.token, 'rentcast', RENTCAST_DAILY_LIMIT, fetchImpl);
  if (!allowance.ok) {
    return json(request, { error: 'Daily lookup limit reached. It resets at midnight UTC.', limit: true }, 429);
  }

  try {
    const upstream = await fetchImpl(upstreamUrl.toString(), {
      headers: { 'X-Api-Key': env.RENTCAST_KEY, Accept: 'application/json' },
      cf: { cacheTtl: 300 },
    });
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { ...corsHeaders(request), 'Cache-Control': 'private, max-age=300' },
    });
  } catch {
    return json(request, { error: 'Property data service unavailable' }, 502);
  }
}
