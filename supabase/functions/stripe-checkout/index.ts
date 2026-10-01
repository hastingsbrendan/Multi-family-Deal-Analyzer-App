// Supabase Edge Function — creates a Stripe Checkout session for RentHack Pro.
//
// Deployed with verify_jwt = false (see supabase/config.toml) so the older client,
// which sends no session token, keeps working until the new one is on main. When a
// token is sent (sbClient.functions.invoke), the buyer is identified from it.

import Stripe from 'https://esm.sh/stripe@14';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-04-10' });
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

// The webhook grants Pro for sessions created here, so only the Pro price may be
// used — never an arbitrary price id from the client.
const ALLOWED_PRICES = new Set(['price_1T8j9ARWpp7uVQEX1qENULX6']);

// Redirects after checkout may only return to RentHack.
const DEFAULT_ORIGIN = 'https://renthack.io';
function safeRedirect(raw: unknown, fallback: string) {
  try {
    const url = new URL(String(raw));
    const host = url.hostname;
    const ok = (url.protocol === 'https:' && (host === 'renthack.io' || host === 'www.renthack.io'
               || host === 'multi-family-deal-analyzer-app.pages.dev'
               || host.endsWith('.multi-family-deal-analyzer-app.pages.dev')))
            || (url.protocol === 'http:' && host === 'localhost');
    return ok ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  try {
    const body = await req.json();
    if (!ALLOWED_PRICES.has(body.price_id)) return json({ error: 'Unknown price' }, 400);

    // Identify the buyer from their session token when one is sent. The body email
    // is a fallback for the app version still on main; remove it once the
    // functions.invoke client is deployed.
    let userId: string | null = null;
    let email: string | null = null;
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (token) {
      const { data } = await supabase.auth.getUser(token);
      if (data?.user) { userId = data.user.id; email = data.user.email ?? null; }
    }
    if (!email) email = typeof body.email === 'string' ? body.email : null;
    if (!email) return json({ error: 'Missing email' }, 400);

    const params: Stripe.Checkout.SessionCreateParams = {
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [{ price: body.price_id, quantity: 1 }],
      success_url: safeRedirect(body.success_url, DEFAULT_ORIGIN + '/?upgraded=true'),
      cancel_url:  safeRedirect(body.cancel_url,  DEFAULT_ORIGIN + '/'),
      metadata: { source: 'renthack' },
      subscription_data: { metadata: { source: 'renthack' } },
    };
    if (userId) {
      params.client_reference_id = userId;
      params.metadata!.user_id = userId;
      params.subscription_data!.metadata!.user_id = userId;
    }

    const session = await stripe.checkout.sessions.create(params);
    return json({ url: session.url }, 200);
  } catch (err) {
    console.error('[stripe-checkout] Error:', err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
