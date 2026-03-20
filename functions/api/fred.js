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
export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const apiKey = env.FRED_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'FRED_API_KEY not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const inUrl     = new URL(request.url);
  const seriesRaw = inUrl.searchParams.get('series_id') || 'MORTGAGE30US';
  const limit     = Math.min(parseInt(inUrl.searchParams.get('limit') || '60', 10), 200);
  const sortOrder = inUrl.searchParams.get('sort_order') || 'desc';
  const obsStart  = inUrl.searchParams.get('observation_start') || '';

  // Support comma-separated series IDs for batch fetching
  const seriesIds = seriesRaw.split(',').map(s => s.trim()).filter(Boolean).slice(0, 8);

  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=3600',
  };

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
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 502, headers: corsHeaders });
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
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 502, headers: corsHeaders });
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
