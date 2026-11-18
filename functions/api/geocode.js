/**
 * Cloudflare Pages Function — Google Maps Geocoding API proxy
 * Route: /api/geocode?address=123+Main+St+Chicago+IL
 *
 * Keeps GMAPS_KEY server-side so it is never shipped in the browser bundle.
 * Verifies the caller's Supabase JWT before forwarding.
 *
 * Required env vars in Cloudflare Pages (server-side only):
 *   GMAPS_KEY         — Google Maps API key (Geocoding API enabled)
 *   SUPABASE_URL      — e.g. https://lxkwvayalxuoryuwxtsq.supabase.co
 *   SUPABASE_ANON_KEY — public anon key (used to verify JWTs)
 */

import { preflight, json, corsHeaders, verifyUser } from '../../server/proxyAuth.js';

const GMAPS_BASE = 'https://maps.googleapis.com/maps/api/geocode/json';

export async function onRequest({ request, env }, fetchImpl = fetch) {
  if (request.method === 'OPTIONS') return preflight(request);
  if (request.method !== 'GET') return json(request, { error: 'Method not allowed' }, 405);

  const auth = await verifyUser(request, env, fetchImpl);
  if (auth.error) return json(request, { error: auth.error }, auth.status);

  if (!env.GMAPS_KEY) return json(request, { error: 'Server misconfigured' }, 500);

  const address = (new URL(request.url).searchParams.get('address') || '').trim().slice(0, 300);
  if (!address) return json(request, { error: 'address param is required' }, 400);

  const upstreamUrl = new URL(GMAPS_BASE);
  upstreamUrl.searchParams.set('address', address);
  upstreamUrl.searchParams.set('key', env.GMAPS_KEY);

  try {
    const upstream = await fetchImpl(upstreamUrl.toString(), {
      headers: { Accept: 'application/json' },
      cf: { cacheTtl: 86400 }, // geocodes are stable — cache 24h at the edge
    });
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { ...corsHeaders(request), 'Cache-Control': 'private, max-age=86400' },
    });
  } catch {
    return json(request, { error: 'Geocoding service unavailable' }, 502);
  }
}
