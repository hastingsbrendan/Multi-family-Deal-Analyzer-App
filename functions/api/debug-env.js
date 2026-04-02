/**
 * Temporary debug endpoint — reports which env vars are present (not their values).
 * DELETE this file once the env var issue is resolved.
 * Route: /api/debug-env
 */
export async function onRequest(context) {
  const { env } = context;
  const vars = [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'RENTCAST_KEY',
    'GMAPS_KEY',
    'FRED_API_KEY',
    'BLS_API_KEY',
  ];
  const report = {};
  for (const v of vars) {
    report[v] = env[v] ? `✅ present (${env[v].length} chars)` : '❌ MISSING';
  }
  return new Response(JSON.stringify(report, null, 2), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
