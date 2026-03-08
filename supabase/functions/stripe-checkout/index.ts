// Supabase Edge Function — creates a Stripe Checkout session
// Called by the frontend UpgradeModal to redirect user to Stripe.
// Deploy: supabase functions deploy stripe-checkout

import Stripe from 'https://esm.sh/stripe@14';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-04-10' });

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  try {
    const { email, price_id, success_url, cancel_url } = await req.json();
    if (!email || !price_id) {
      return new Response(JSON.stringify({ error: 'Missing email or price_id' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' }
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [{ price: price_id, quantity: 1 }],
      success_url: success_url || 'https://renthack.io/?upgraded=true',
      cancel_url:  cancel_url  || 'https://renthack.io/',
      metadata: { source: 'renthack' },
    });

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[stripe-checkout] Error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
