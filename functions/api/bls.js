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
export async function onRequest(context) {
  const { request, env } = context;

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const apiKey = env.BLS_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'BLS_API_KEY not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=3600',
  };

  const inUrl = new URL(request.url);
  const seriesRaw = inUrl.searchParams.get('series_id') || '';
  const seriesIds = seriesRaw.split(',').map(s => s.trim()).filter(Boolean);

  if (seriesIds.length === 0) {
    return new Response(JSON.stringify({ error: 'series_id is required' }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  const currentYear = new Date().getFullYear();
  const startYear = inUrl.searchParams.get('startyear') || String(currentYear - 2);
  const endYear   = inUrl.searchParams.get('endyear')   || String(currentYear);

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
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 502, headers: corsHeaders });
  }
}
