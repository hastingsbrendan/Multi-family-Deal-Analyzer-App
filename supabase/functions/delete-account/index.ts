import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return new Response(JSON.stringify({ error: 'Missing authorization' }), {
    status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
  });

  const { data: { user: callerUser }, error: authErr } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', '')
  );
  if (authErr || !callerUser) return new Response(JSON.stringify({ error: 'Invalid token' }), {
    status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
  });

  const uid   = callerUser.id;
  const email = callerUser.email!;
  const meta  = callerUser.user_metadata || {};

  console.log('[delete-account] Starting deletion uid=' + uid);

  try {
    // 1. Delete all deals
    const { error: dealsErr } = await supabase.from('deals').delete().eq('user_id', uid);
    if (dealsErr) throw new Error('Failed to delete deals: ' + dealsErr.message);

    // 2. Remove from all groups
    await supabase.from('group_members').delete().eq('user_id', uid);

    // 3. Cancel Stripe subscriptions
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (meta.stripe_customer_id && stripeKey) {
      const listRes = await fetch(
        'https://api.stripe.com/v1/subscriptions?customer=' + meta.stripe_customer_id + '&status=active',
        { headers: { 'Authorization': 'Bearer ' + stripeKey } }
      );
      const listJson = await listRes.json();
      for (const sub of (listJson.data || [])) {
        await fetch('https://api.stripe.com/v1/subscriptions/' + sub.id, {
          method: 'DELETE',
          headers: { 'Authorization': 'Bearer ' + stripeKey },
        });
        console.log('[delete-account] Cancelled Stripe subscription ' + sub.id);
      }
    }

    // 4. Delete auth user (cascades to profiles via trigger)
    const { error: deleteErr } = await supabase.auth.admin.deleteUser(uid);
    if (deleteErr) throw new Error('Failed to delete auth user: ' + deleteErr.message);

    // 5. Send confirmation email via Resend
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (resendKey) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'RentHack <noreply@renthack.io>',
          to: email,
          subject: 'Your RentHack account has been deleted',
          html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:40px 24px">
            <div style="font-size:22px;font-weight:900;margin-bottom:16px">Rent<span style="color:#0d9488">Hack</span></div>
            <h2>Account deleted</h2>
            <p style="color:#555;line-height:1.6">Your RentHack account and all associated data have been permanently deleted as requested.</p>
            <p style="color:#555;line-height:1.6">This includes all your deal analyses, notes, and preferences.</p>
            <p style="color:#555;line-height:1.6">You can always create a new account at <a href="https://renthack.io" style="color:#0d9488">renthack.io</a>.</p>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
            <p style="font-size:12px;color:#999">If you did not request this deletion, contact <a href="mailto:support@renthack.io">support@renthack.io</a> immediately.</p>
          </div>`,
        }),
      }).catch(e => console.warn('[delete-account] email warning:', e));
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[delete-account] Error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
