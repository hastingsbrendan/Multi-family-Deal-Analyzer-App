// Supabase Edge Function — Stripe webhook handler
// Listens for Stripe events and updates user plan in Supabase auth metadata.
// Deploy: supabase functions deploy stripe-webhook

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-04-10' });
const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, // service role — can update any user
);

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

  console.log('[stripe-webhook] Event:', event.type);

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const email   = session.customer_email || session.customer_details?.email;
      if (!email) throw new Error('No email in checkout session');

      // Look up user by email
      const { data: { users }, error } = await supabase.auth.admin.listUsers();
      if (error) throw error;
      const user = users.find(u => u.email === email);
      if (!user) throw new Error(`No user found for email: ${email}`);

      // Upgrade to pro
      await supabase.auth.admin.updateUserById(user.id, {
        user_metadata: {
          ...user.user_metadata,
          plan: 'pro',
          stripe_customer_id: session.customer as string,
          stripe_subscription_id: session.subscription as string,
        },
      });
      console.log(`[stripe-webhook] Upgraded ${email} to pro`);
    }

    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId   = subscription.customer as string;

      // Find user by stripe_customer_id in metadata
      const { data: { users } } = await supabase.auth.admin.listUsers();
      const user = users.find(u => u.user_metadata?.stripe_customer_id === customerId);
      if (!user) {
        console.warn(`[stripe-webhook] No user found for customer: ${customerId}`);
        return new Response('OK', { status: 200 });
      }

      // Downgrade — keep stripe IDs for record
      await supabase.auth.admin.updateUserById(user.id, {
        user_metadata: {
          ...user.user_metadata,
          plan: 'free',
        },
      });
      console.log(`[stripe-webhook] Downgraded ${user.email} to free`);
    }
  } catch (err) {
    console.error('[stripe-webhook] Handler error:', err);
    return new Response('Handler error', { status: 500 });
  }

  return new Response('OK', { status: 200 });
});
