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

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

const GMAPS_BASE = 'https://maps.googleapis.com/maps/api/geocode/json';

export async function onRequest(context) {
  const { request, env } = context;

  // ── CORS preflight ───────────────────────────────────────────────────────────
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { ...CORS_HEADERS, 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Allow-Headers': 'Authorization, Content-Type' },
    });
  }

  if (request.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405);
  }

  // ── Auth: verify Supabase JWT ────────────────────────────────────────────────
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return json({ error: 'Missing Authorization header' }, 401);

  const sbUrl     = env.SUPABASE_URL;
  const sbAnonKey = env.SUPABASE_ANON_KEY;
  if (!sbUrl || !sbAnonKey) return json({ error: 'Server misconfigured: missing Supabase env vars' }, 500);

  try {
    const verifyRes = await fetch(`${sbUrl}/auth/v1/user`, {
      headers: { 'apikey': sbAnonKey, 'Authorization': `Bearer ${token}` },
    });
    if (!verifyRes.ok) return json({ error: 'Unauthorized' }, 401);
  } catch {
    return json({ error: 'Auth verification failed' }, 401);
  }

  // ── API key check ────────────────────────────────────────────────────────────
  const gmapsKey = env.GMAPS_KEY;
  if (!gmapsKey) return json({ error: 'GMAPS_KEY not configured on server' }, 500);

  // ── Build upstream URL ───────────────────────────────────────────────────────
  const inUrl  = new URL(request.url);
  const address = inUrl.searchParams.get('address') || '';
  if (!address.trim()) return json({ error: 'address param is required' }, 400);

  const upstreamUrl = new URL(GMAPS_BASE);
  upstreamUrl.searchParams.set('address', address);
  upstreamUrl.searchParams.set('key', gmapsKey);

  try {
    const upstream = await fetch(upstreamUrl.toString(), {
      headers: { 'Accept': 'application/json' },
      cf: { cacheTtl: 86400 }, // geocodes are stable — cache 24h at the edge
    });
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: { ...CORS_HEADERS, 'Cache-Control': 'private, max-age=86400' },
    });
  } catch (err) {
    return json({ error: `Upstream error: ${err.message}` }, 502);
  }
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: CORS_HEADERS });
}
