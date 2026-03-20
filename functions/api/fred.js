/**
 * Cloudflare Pages Function — FRED proxy
 * Route: /api/fred?series_id=...&limit=...
 *
 * FRED's API doesn't send CORS headers, so browser fetch() from renthack.io
 * is blocked. This thin proxy adds the header and forwards the request.
 *
 * Required env var in Cloudflare Pages:
 *   FRED_API_KEY=<your key>   (server-side only — never shipped to the browser)
 */
export async function onRequest(context) {
  const { request, env } = context;

  // Only allow GET
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

  // Forward whitelisted query params from the client
  const inUrl  = new URL(request.url);
  const seriesId = inUrl.searchParams.get('series_id') || 'MORTGAGE30US';
  const limit    = Math.min(parseInt(inUrl.searchParams.get('limit') || '60', 10), 200);
  const sortOrder = inUrl.searchParams.get('sort_order') || 'desc';
  const obsStart  = inUrl.searchParams.get('observation_start') || '';

  const fredUrl = new URL('https://api.stlouisfed.org/fred/series/observations');
  fredUrl.searchParams.set('series_id', seriesId);
  fredUrl.searchParams.set('api_key', apiKey);
  fredUrl.searchParams.set('file_type', 'json');
  fredUrl.searchParams.set('sort_order', sortOrder);
  fredUrl.searchParams.set('limit', String(limit));
  if (obsStart) fredUrl.searchParams.set('observation_start', obsStart);

  try {
    const upstream = await fetch(fredUrl.toString(), {
      headers: { 'Accept': 'application/json' },
      cf: { cacheTtl: 3600 }, // Cache at Cloudflare edge for 1 hour
    });

    const body = await upstream.text();

    return new Response(body, {
      status: upstream.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}
