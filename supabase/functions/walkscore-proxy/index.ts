// Supabase Edge Function — Walk Score API proxy
// Keeps WALKSCORE_API_KEY server-side, handles CORS
// Deploy: supabase functions deploy walkscore-proxy

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  try {
    const { address, lat, lon } = await req.json();
    if (!address || lat == null || lon == null) {
      return new Response(JSON.stringify({ error: 'Missing address, lat, or lon' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('WALKSCORE_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Walk Score API key not configured' }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const url = `https://api.walkscore.com/score?format=json&address=${encodeURIComponent(address)}&lat=${lat}&lon=${lon}&transit=1&bike=1&wsapikey=${apiKey}`;
    const wsRes = await fetch(url);

    if (!wsRes.ok) {
      return new Response(JSON.stringify({ error: `Walk Score error: ${wsRes.status}` }), {
        status: wsRes.status, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const data = await wsRes.json();
    return new Response(JSON.stringify(data), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
