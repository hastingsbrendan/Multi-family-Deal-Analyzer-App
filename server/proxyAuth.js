// Shared helpers for the Cloudflare Pages Function proxies in functions/api/.
// Lives outside functions/ so Pages doesn't serve it as a route.

const TRIAL_DAYS = 14; // keep in step with src/contexts/SubscriptionContext.jsx

// Browser origins allowed to call the proxies: production, Cloudflare preview
// deployments, and local development.
export function isAllowedOrigin(origin) {
  if (!origin) return false;
  try {
    const { hostname, protocol } = new URL(origin);
    if (hostname === 'renthack.io' || hostname === 'www.renthack.io') return protocol === 'https:';
    if (hostname.endsWith('.multi-family-deal-analyzer-app.pages.dev') || hostname === 'multi-family-deal-analyzer-app.pages.dev') return protocol === 'https:';
    return hostname === 'localhost' || hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

// CORS headers echo the caller's origin only when it is one of ours (was "*").
export function corsHeaders(request) {
  const origin = request.headers.get('Origin');
  const h = { 'Content-Type': 'application/json', Vary: 'Origin' };
  if (isAllowedOrigin(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

export function preflight(request) {
  return new Response(null, {
    status: 204,
    headers: { ...corsHeaders(request), 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Allow-Headers': 'Authorization, Content-Type' },
  });
}

export function json(request, payload, status = 200, extra = {}) {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders(request), ...extra } });
}

// Same-site check for unauthenticated proxies (FRED, BLS): browsers always send
// Origin on cross-site fetches and Referer otherwise. Not a security boundary on its
// own (scripts can forge headers), but it stops other websites from using our keys.
export function isFromOurSite(request) {
  const origin = request.headers.get('Origin');
  if (origin) return isAllowedOrigin(origin);
  const referer = request.headers.get('Referer');
  if (!referer) return false;
  try { return isAllowedOrigin(new URL(referer).origin); } catch { return false; }
}

// Verifies the Supabase session token. Returns { user, token } or { error, status }.
export async function verifyUser(request, env, fetchImpl = fetch) {
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return { error: 'Missing Authorization header', status: 401 };
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return { error: 'Server misconfigured', status: 500 };
  try {
    const res = await fetchImpl(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { error: 'Unauthorized', status: 401 };
    return { user: await res.json(), token };
  } catch {
    return { error: 'Auth verification failed', status: 401 };
  }
}

// 'pro' | 'trial' | 'locked' — server-side twin of computeTier(). Reads only
// app_metadata, which users cannot edit.
export function tierOf(user, now = Date.now()) {
  const app = user?.app_metadata || {};
  if (app.plan === 'pro') return 'pro';
  const start = Date.parse(app.trial_started_at || user?.created_at || '');
  if (Number.isFinite(start) && now - start < TRIAL_DAYS * 86400000) return 'trial';
  return 'locked';
}

// Counts one call against the user's daily allowance via a Supabase RPC run with the
// user's own token. Returns { ok: true, used } or { ok: false, used }.
// If the RPC isn't installed yet, allows the call (fail open) rather than breaking lookups.
export async function useDailyAllowance(env, token, kind, limit, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(`${env.SUPABASE_URL}/rest/v1/rpc/use_api_allowance`, {
      method: 'POST',
      headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_kind: kind, p_limit: limit }),
    });
    if (!res.ok) return { ok: true, used: null };
    const used = await res.json();
    return { ok: typeof used === 'number' ? used <= limit : true, used };
  } catch {
    return { ok: true, used: null };
  }
}
