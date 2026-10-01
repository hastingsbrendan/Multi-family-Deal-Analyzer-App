// Supabase Edge Function — Stripe webhook handler
// Listens for Stripe events and updates the user's plan in Supabase auth.
//
// Deployed with verify_jwt = false (see supabase/config.toml): Stripe sends only a
// stripe-signature header, which is verified below. With the gateway JWT check on,
// every Stripe event was rejected with 401.
//
// Plan data lives in app_metadata, which only the service role can write.
// user_metadata is editable by users (auth.updateUser), so it must never decide
// entitlements.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-04-10' });
const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

// listUsers() returns one page (50 users by default) — scan every page.
async function findUser(match: (u: any) => boolean) {
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const hit = data.users.find(match);
    if (hit) return hit;
    if (data.users.length < 1000) return null;
  }
}

async function getUserById(id?: string | null) {
  if (!id) return null;
  const { data, error } = await supabase.auth.admin.getUserById(id);
  return error ? null : data.user;
}

async function setPlan(user: any, fields: Record<string, unknown>) {
  const { error } = await supabase.auth.admin.updateUserById(user.id, {
    app_metadata: { ...user.app_metadata, ...fields },
    // Transitional mirror for the app version still on main, which reads
    // user_metadata.plan. Not trusted by the app once the app_metadata client ships;
    // remove after that.
    user_metadata: { ...user.user_metadata, plan: fields.plan },
  });
  if (error) throw error;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const body      = await req.text();
  const signature = req.headers.get('stripe-signature');

  // Verify webhook signature — rejects tampered or fake events
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature!, webhookSecret);
  } catch (err) {
    console.error('[stripe-webhook] Signature verification failed:', err);
    return new Response('Invalid signature', { status: 400 });
  }

  console.log('[stripe-webhook] Event:', event.type, event.id);

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;

      // Only sessions created by our stripe-checkout function (which enforces the
      // Pro price) grant Pro — not payment links or other products on the account.
      if (session.metadata?.source !== 'renthack' || session.mode !== 'subscription') {
        console.log('[stripe-webhook] Ignoring non-RentHack session', session.id);
        return new Response('OK', { status: 200 });
      }

      // Prefer the user id stamped at checkout; fall back to email for sessions
      // created by the older client, which sent no session token.
      let user = await getUserById(session.client_reference_id || session.metadata?.user_id);
      if (!user) {
        const email = (session.customer_details?.email || session.customer_email || '').toLowerCase();
        if (email) user = await findUser(u => (u.email || '').toLowerCase() === email);
      }
      // Throwing returns 500, so Stripe retries rather than the payment being lost.
      if (!user) throw new Error('No user found for checkout session ' + session.id);

      await setPlan(user, {
        plan: 'pro',
        stripe_customer_id: session.customer as string,
        stripe_subscription_id: session.subscription as string,
      });
      console.log('[stripe-webhook] Upgraded user ' + user.id + ' to pro');
    }

    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as Stripe.Subscription;

      let user = await getUserById(subscription.metadata?.user_id);
      if (!user) user = await findUser(u => u.app_metadata?.stripe_customer_id === subscription.customer);
      if (!user) {
        console.warn('[stripe-webhook] No user found for customer: ' + subscription.customer);
        return new Response('OK', { status: 200 });
      }

      // A user who cancelled and resubscribed has a newer subscription on record —
      // don't downgrade them because the old one ended.
      const current = user.app_metadata?.stripe_subscription_id;
      if (current && current !== subscription.id) {
        console.log('[stripe-webhook] Ignoring end of superseded subscription ' + subscription.id);
        return new Response('OK', { status: 200 });
      }

      await setPlan(user, { plan: 'free' });
      console.log('[stripe-webhook] Downgraded user ' + user.id + ' to free');
    }
  } catch (err) {
    console.error('[stripe-webhook] Handler error:', err);
    return new Response('Handler error', { status: 500 });
  }

  return new Response('OK', { status: 200 });
});
