/**
 * Cloudflare Pages Function — FRED proxy
 * Route: /api/fred?series_id=MORTGAGE30US,DGS10&limit=60&sort_order=desc
 *
 * Supports comma-separated series_id for batch fetching multiple series.
 * FRED's API doesn't send CORS headers, so browser fetch() from renthack.io
 * is blocked. This proxy adds the header and forwards requests server-side.
 *
 * Required env var in Cloudflare Pages:
 *   FRED_API_KEY=<your key>   (server-side only — never shipped to the browser)
 */
import { preflight, json, corsHeaders as cors, isFromOurSite } from '../../server/proxyAuth.js';

// Public economic data, so no sign-in, but only our own site may use our key
// (2026-11, M6: it was an open relay with CORS "*").
export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') return preflight(request);
  if (request.method !== 'GET') return json(request, { error: 'Method not allowed' }, 405);
  if (!isFromOurSite(request)) return json(request, { error: 'Forbidden' }, 403);

  const apiKey = env.FRED_API_KEY;
  if (!apiKey) return json(request, { error: 'Server misconfigured' }, 500);

  const inUrl     = new URL(request.url);
  const seriesRaw = inUrl.searchParams.get('series_id') || 'MORTGAGE30US';
  const limit     = Math.min(Math.max(parseInt(inUrl.searchParams.get('limit') || '60', 10) || 60, 1), 200);
  const sortOrder = inUrl.searchParams.get('sort_order') === 'asc' ? 'asc' : 'desc';
  const obsStartRaw = inUrl.searchParams.get('observation_start') || '';
  const obsStart  = /^\d{4}-\d{2}-\d{2}$/.test(obsStartRaw) ? obsStartRaw : '';

  // Comma-separated FRED series IDs (letters, digits, underscore) for batch fetching
  const seriesIds = seriesRaw.split(',').map(s => s.trim().toUpperCase()).filter(s => /^[A-Z0-9_]{1,40}$/.test(s)).slice(0, 8);
  if (!seriesIds.length) return json(request, { error: 'Invalid series_id' }, 400);

  const corsHeaders = { ...cors(request), 'Cache-Control': 'public, max-age=3600' };

  // Single series — return the raw FRED response (backwards compatible)
  if (seriesIds.length === 1) {
    const fredUrl = buildFredUrl(seriesIds[0], apiKey, limit, sortOrder, obsStart);
    try {
      const upstream = await fetch(fredUrl, {
        headers: { Accept: 'application/json' },
        cf: { cacheTtl: 3600 },
      });
      const body = await upstream.text();
      return new Response(body, { status: upstream.status, headers: corsHeaders });
    } catch {
      return new Response(JSON.stringify({ error: 'Economic data service unavailable' }), { status: 502, headers: corsHeaders });
    }
  }

  // Multiple series — fetch in parallel, return { results: { SERIES_ID: observations[] } }
  try {
    const fetches = seriesIds.map(id =>
      fetch(buildFredUrl(id, apiKey, limit, sortOrder, obsStart), {
        headers: { Accept: 'application/json' },
        cf: { cacheTtl: 3600 },
      }).then(r => r.json()).then(json => [id, json.observations || []])
        .catch(() => [id, []])
    );
    const entries = await Promise.all(fetches);
    const results = Object.fromEntries(entries);
    return new Response(JSON.stringify({ results }), { status: 200, headers: corsHeaders });
  } catch {
    return new Response(JSON.stringify({ error: 'Economic data service unavailable' }), { status: 502, headers: corsHeaders });
  }
}

function buildFredUrl(seriesId, apiKey, limit, sortOrder, obsStart) {
  const url = new URL('https://api.stlouisfed.org/fred/series/observations');
  url.searchParams.set('series_id', seriesId);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('file_type', 'json');
  url.searchParams.set('sort_order', sortOrder);
  url.searchParams.set('limit', String(limit));
  if (obsStart) url.searchParams.set('observation_start', obsStart);
  return url.toString();
}
