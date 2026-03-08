// Supabase Edge Function — stores user feedback
// Inserts into a `feedback` table (created below) and optionally emails you.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  try {
    const body = await req.json();
    const { email, name, category, message, url, ts } = body;

    if (!message?.trim()) {
      return new Response(JSON.stringify({ error: 'Message required' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const { error } = await supabase.from('feedback').insert({
      email:    email || 'anonymous',
      name:     name  || '',
      category: category || 'General feedback',
      message:  message.trim(),
      url:      url || '',
      created_at: ts || new Date().toISOString(),
    });

    if (error) throw error;

    console.log(`[submit-feedback] ${category} from ${email}: ${message.slice(0, 80)}`);

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[submit-feedback] Error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
