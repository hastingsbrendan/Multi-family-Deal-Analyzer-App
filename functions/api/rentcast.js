/**
 * Cloudflare Pages Function — Rentcast API proxy
 * Route: /api/rentcast?path=/v1/properties&address=...&limit=1
 *        /api/rentcast?path=/v1/avm/rent/long-term&address=...&bedrooms=2
 *        /api/rentcast?path=/v1/markets&zipCode=60601&dataType=All
 *
 * Keeps RENTCAST_KEY server-side so it is never shipped in the browser bundle.
 * Verifies the caller's Supabase JWT before forwarding — unauthenticated requests
 * are rejected with 401.
 *
 * Required env vars in Cloudflare Pages (server-side only):
 *   RENTCAST_KEY      — Rentcast API key
 *   SUPABASE_URL      — e.g. https://lxkwvayalxuoryuwxtsq.supabase.co
 *   SUPABASE_ANON_KEY — public anon key (used to verify JWTs)
 */

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

const RENTCAST_BASE = 'https://api.rentcast.io';

// Allowed path prefixes — whitelist to prevent open-proxy abuse
const ALLOWED_PATHS = [
  '/v1/properties',
  '/v1/avm/rent/long-term',
  '/v1/markets',
  '/v1/listings/sale',
  '/v1/listings/rental',
  '/v1/avm/value',
];

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

  // ── Temporary API pause ──────────────────────────────────────────────────────
  // Flip RENTCAST_PAUSED to false to re-enable all Rentcast endpoints.
  const RENTCAST_PAUSED = true;
  if (RENTCAST_PAUSED) {
    return json({ error: 'Rentcast API is temporarily paused. Cached data is shown where available.', paused: true }, 503);
  }

  // ── Auth: verify Supabase JWT ────────────────────────────────────────────────
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return json({ error: 'Missing Authorization header' }, 401);

  const sbUrl      = env.SUPABASE_URL;
  const sbAnonKey  = env.SUPABASE_ANON_KEY;
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
  const rentcastKey = env.RENTCAST_KEY;
  if (!rentcastKey) return json({ error: 'RENTCAST_KEY not configured on server' }, 500);

  // ── Build upstream URL ───────────────────────────────────────────────────────
  const inUrl    = new URL(request.url);
  const apiPath  = inUrl.searchParams.get('path') || '';

  if (!apiPath || !ALLOWED_PATHS.some(p => apiPath.startsWith(p))) {
    return json({ error: `path param is required and must start with one of: ${ALLOWED_PATHS.join(', ')}` }, 400);
  }

  // Forward all query params except 'path' itself
  const upstreamUrl = new URL(`${RENTCAST_BASE}${apiPath}`);
  for (const [k, v] of inUrl.searchParams.entries()) {
    if (k !== 'path') upstreamUrl.searchParams.set(k, v);
  }

  try {
    const upstream = await fetch(upstreamUrl.toString(), {
      headers: { 'X-Api-Key': rentcastKey, 'Accept': 'application/json' },
      cf: { cacheTtl: 300 }, // 5-minute edge cache
    });
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: { ...CORS_HEADERS, 'Cache-Control': 'private, max-age=300' },
    });
  } catch (err) {
    return json({ error: `Upstream error: ${err.message}` }, 502);
  }
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: CORS_HEADERS });
}
