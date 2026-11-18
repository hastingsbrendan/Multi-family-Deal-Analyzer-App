import { describe, test, expect, vi } from 'vitest';
import { onRequest as rentcast } from '../../../functions/api/rentcast.js';
import { onRequest as fred } from '../../../functions/api/fred.js';
import { isAllowedOrigin, tierOf } from '../../../server/proxyAuth.js';

// M6 (2026-11): Rentcast calls cost money. The proxy must check sign-in, plan and a
// daily allowance, and forward only the endpoints and parameters the app uses.

const ENV = { SUPABASE_URL: 'https://sb.test', SUPABASE_ANON_KEY: 'anon', RENTCAST_KEY: 'rc-key' };
const DAY = 86400000;
const user = (over = {}) => ({ id: 'u1', created_at: new Date(Date.now() - 2 * DAY).toISOString(), app_metadata: {}, ...over });

// Fake upstreams: Supabase auth + allowance RPC, then Rentcast
function fakeFetch({ authOk = true, who = user(), used = 1 } = {}) {
  const calls = [];
  const fn = vi.fn(async (url, init) => {
    calls.push(String(url));
    if (String(url).endsWith('/auth/v1/user')) return new Response(JSON.stringify(who), { status: authOk ? 200 : 401 });
    if (String(url).includes('/rpc/use_api_allowance')) return new Response(JSON.stringify(used), { status: 200 });
    return new Response('{"ok":true}', { status: 200 });
  });
  fn.calls = calls;
  return fn;
}

const req = (path, { token = 'jwt', origin = 'https://renthack.io' } = {}) =>
  new Request(`https://renthack.io/api/rentcast?${path}`, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), Origin: origin } });

describe('rentcast proxy', () => {
  test('rejects requests without a session', async () => {
    const res = await rentcast({ request: req('path=/v1/properties&address=x', { token: '' }), env: ENV }, fakeFetch());
    expect(res.status).toBe(401);
  });

  test('locked (post-trial, unpaid) accounts get 403 and never reach Rentcast', async () => {
    const f = fakeFetch({ who: user({ created_at: new Date(Date.now() - 30 * DAY).toISOString() }) });
    const res = await rentcast({ request: req('path=/v1/properties&address=x'), env: ENV }, f);
    expect(res.status).toBe(403);
    expect(f.calls.some(u => u.includes('rentcast.io'))).toBe(false);
  });

  test('Pro accounts after the trial are allowed', async () => {
    const f = fakeFetch({ who: user({ created_at: '2025-01-01T00:00:00Z', app_metadata: { plan: 'pro' } }) });
    const res = await rentcast({ request: req('path=/v1/properties&address=x'), env: ENV }, f);
    expect(res.status).toBe(200);
  });

  test('only exact endpoints are allowed (no "../" tricks)', async () => {
    for (const p of ['/v1/properties/../avm/value', '/v1/properties/x', '/v1/listings/sale', '%2e%2e']) {
      const res = await rentcast({ request: req(`path=${encodeURIComponent(p)}&address=x`), env: ENV }, fakeFetch());
      expect(res.status).toBe(400);
    }
  });

  test('only known query parameters are forwarded, and limit is capped', async () => {
    const f = fakeFetch();
    await rentcast({ request: req('path=/v1/properties&address=1+Main&limit=500&evil=1'), env: ENV }, f);
    const upstream = new URL(f.calls.find(u => u.includes('rentcast.io')));
    expect(upstream.pathname).toBe('/v1/properties');
    expect(upstream.searchParams.get('address')).toBe('1 Main');
    expect(upstream.searchParams.get('limit')).toBe('5');
    expect(upstream.searchParams.has('evil')).toBe(false);
  });

  test('over the daily allowance → 429 and no Rentcast call', async () => {
    const f = fakeFetch({ used: 61 });
    const res = await rentcast({ request: req('path=/v1/markets&zipCode=60614'), env: ENV }, f);
    expect(res.status).toBe(429);
    expect(f.calls.some(u => u.includes('rentcast.io'))).toBe(false);
  });

  test('CORS answers only our own origins', async () => {
    const ours = await rentcast({ request: req('path=/v1/markets&zipCode=60614'), env: ENV }, fakeFetch());
    expect(ours.headers.get('Access-Control-Allow-Origin')).toBe('https://renthack.io');
    const theirs = await rentcast({ request: req('path=/v1/markets&zipCode=60614', { origin: 'https://evil.example' }), env: ENV }, fakeFetch());
    expect(theirs.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

describe('fred proxy', () => {
  test('refuses other websites and malformed series ids', async () => {
    const env = { FRED_API_KEY: 'k' };
    const other = await fred({ request: new Request('https://renthack.io/api/fred?series_id=DGS10', { headers: { Origin: 'https://evil.example' } }), env });
    expect(other.status).toBe(403);
    const bad = await fred({ request: new Request('https://renthack.io/api/fred?series_id=%3Cscript%3E', { headers: { Origin: 'https://renthack.io' } }), env });
    expect(bad.status).toBe(400);
  });
});

describe('proxy helpers', () => {
  test('allowed origins', () => {
    expect(isAllowedOrigin('https://renthack.io')).toBe(true);
    expect(isAllowedOrigin('https://develop.multi-family-deal-analyzer-app.pages.dev')).toBe(true);
    expect(isAllowedOrigin('http://localhost:3000')).toBe(true);
    expect(isAllowedOrigin('http://renthack.io')).toBe(false);
    expect(isAllowedOrigin('https://renthack.io.evil.example')).toBe(false);
  });

  test('tier reads only app_metadata', () => {
    expect(tierOf(user({ app_metadata: { plan: 'pro' } }))).toBe('pro');
    expect(tierOf(user())).toBe('trial');
    expect(tierOf(user({ created_at: '2020-01-01T00:00:00Z', user_metadata: { plan: 'pro' } }))).toBe('locked');
  });
});
