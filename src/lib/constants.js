// ─── Constants, config & formatting helpers ──────────────────────────────────
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/react';

// ─── Environment flag ─────────────────────────────────────────────────────────
// IS_PROD = true on renthack.io (main branch).
// IS_PROD = false on the Cloudflare `develop` preview URL and local dev.
// To enable dev-only features on Cloudflare `develop` branch:
//   Pages → develop branch → Settings → Environment variables → VITE_APP_ENV = development
const IS_PROD = import.meta.env.VITE_APP_ENV === 'production';

const STORAGE_KEY = "re_deal_analyzer_v2";
const SB_URL      = import.meta.env.VITE_SB_URL;
const SB_ANON_KEY = import.meta.env.VITE_SB_ANON_KEY;
if (!SB_URL || !SB_ANON_KEY) console.error("[RentHack] Missing VITE_SB_URL or VITE_SB_ANON_KEY env vars — check your .env file");
const SB_BUCKET   = "deal-photos";

// Supabase JS client — handles JWT storage, auto token refresh, session persistence
const sbClient = createClient(SB_URL, SB_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

// ─── Deal shape validation — logs a Sentry warning for malformed deals ────────
function validateDealShape(deal, source) {
  const issues = [];
  if (!deal?.assumptions)                             issues.push('missing assumptions');
  if (!Array.isArray(deal?.assumptions?.units))       issues.push('assumptions.units not array');
  if (!deal?.assumptions?.numUnits)                   issues.push('missing assumptions.numUnits');
  if (!Array.isArray(deal?.comps))                    issues.push('missing comps array');
  if (!deal?.showing)                                 issues.push('missing showing');
  if (issues.length > 0) {
    const msg = `[RentHack] Malformed deal loaded from ${source}: ${issues.join(', ')}`;
    console.warn(msg, { deal_id: deal?._deal_id || deal?.id });
    Sentry.captureMessage(msg, { level: 'warning', extra: { deal_id: deal?._deal_id || deal?.id, issues } });
  }
  return issues.length === 0;
}

// Key local cache by user ID so different users on same device never see each other's data
const loadLocal = (uid) => {
  try {
    const key = uid ? STORAGE_KEY + "_" + uid : STORAGE_KEY;
    const deals = JSON.parse(localStorage.getItem(key)) || [];
    return deals.map(d => {
      if (!d.numUnits && d.units?.length) d = { ...d, numUnits: d.units.length };
      validateDealShape(d, 'localStorage');
      return d;
    });
  } catch { return []; }
};
const saveLocal = (d, uid) => {
  try {
    if (!Array.isArray(d) || d.length === 0) return; // never overwrite with empty
    const key = uid ? STORAGE_KEY + "_" + uid : STORAGE_KEY;
    localStorage.setItem(key, JSON.stringify(d));
  } catch {}
};

// ─── Individual deal row read/write (A2 schema) ───────────────────────────────

// Reads all individual deal rows for the current user, sorted by updated_at desc
// Returns { deals: [...], prefs, updated_at } where updated_at is the most recent
async function sbRead() {
  const t0 = Date.now();
  const { data: { user } } = await sbClient.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await sbClient
    .from("deals")
    .select("deal_id, deal_data, prefs, updated_at")
    .eq("user_id", user.id)
    .not("deal_data", "is", null)   // only individual deal rows
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`Read: ${error.message}`);
  // Also fetch prefs from the legacy blob row (user_id only, no deal_data)
  const { data: prefsRow } = await sbClient
    .from("deals")
    .select("prefs, updated_at")
    .eq("user_id", user.id)
    .is("deal_data", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const deals = (data || []).map(row => {
    const d = { ...row.deal_data, _deal_id: row.deal_id };
    // Backfill numUnits if missing (guards against recovered/migrated deals)
    if (!d.numUnits && d.units?.length) d.numUnits = d.units.length;
    validateDealShape(d, 'sbRead');
    return d;
  });
  const latestAt = data?.[0]?.updated_at || prefsRow?.updated_at || null;
  const latency = Date.now() - t0;
  Sentry.addBreadcrumb({ category: 'db', message: 'sbRead', data: { deals: deals.length, latency, updated_at: latestAt }, level: 'info' });
  if (deals.length === 0 && data !== null) {
    Sentry.addBreadcrumb({ category: 'db', message: 'sbRead returned 0 deals — may fall through to local', level: 'warning' });
  }
  return { data: deals, prefs: prefsRow?.prefs || null, updated_at: latestAt };
}

// Write ALL deals for user — upserts each deal as an individual row
// Uses deal._deal_id (uuid) as stable key; assigns new uuid on first write
async function sbWrite(deals) {
  const { data: { user } } = await sbClient.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  if (!Array.isArray(deals) || deals.length === 0) return; // never wipe DB with empty array
  // Safety: refuse to write if every deal is missing an address (likely corrupt state)
  const validDeals = deals.filter(d => d && (d.address || d.purchasePrice));
  if (validDeals.length === 0) return;
  const now = new Date().toISOString();
  const rows = deals.map(deal => ({
    user_id: user.id,
    deal_id: deal._deal_id || undefined,  // let DB gen_random_uuid if missing
    deal_data: deal,
    updated_at: now,
  }));
  Sentry.addBreadcrumb({ category: 'db', message: 'sbWrite', data: { deals: rows.length }, level: 'info' });
  const { error } = await sbClient.from("deals")
    .upsert(rows, { onConflict: "deal_id", ignoreDuplicates: false });
  if (error) throw new Error(`Write: ${error.message}`);
}

// Upsert a single deal row — used for granular saves (preferred over full sbWrite)
async function sbWriteDeal(deal) {
  const { data: { user } } = await sbClient.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const now = new Date().toISOString();
  const row = {
    user_id: user.id,
    deal_data: deal,
    updated_at: now,
    ...(deal._deal_id ? { deal_id: deal._deal_id } : {}),
  };
  const { data, error } = await sbClient.from("deals")
    .upsert(row, { onConflict: "deal_id" })
    .select("deal_id")
    .single();
  if (error) throw new Error(`WriteDeal: ${error.message}`);
  return data?.deal_id;  // return the uuid so caller can store it on the deal
}

// Delete a single deal row by deal_id uuid
async function sbDeleteDeal(dealId) {
  const { data: { user } } = await sbClient.auth.getUser();
  if (!user) return;
  await sbClient.from("deals").delete()
    .eq("user_id", user.id)
    .eq("deal_id", dealId);
}

async function sbWritePrefs(prefs) {
  const { data: { user } } = await sbClient.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  // Prefs live on the legacy blob row (deal_data IS NULL)
  const { error: updateErr } = await sbClient
    .from("deals")
    .update({ prefs, updated_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("deal_data", null);
  if (updateErr) {
    const { error: insertErr } = await sbClient
      .from("deals")
      .insert({ user_id: user.id, prefs, updated_at: new Date().toISOString() });
    if (insertErr) throw new Error(`WritePrefs: ${insertErr.message}`);
  }
}

// Auth convenience wrappers
const authSignInWithGoogle = () => sbClient.auth.signInWithOAuth({
  provider: "google",
  options: { redirectTo: window.location.origin + window.location.pathname }
});
const authSignUp          = (email, pw, meta={}) => sbClient.auth.signUp({ email, password: pw, options: { emailRedirectTo: window.location.origin + '/confirm.html', data: meta } });
const authSignIn          = (email, pw)  => sbClient.auth.signInWithPassword({ email, password: pw });
const authSignOut         = ()           => sbClient.auth.signOut();
const authResetPassword   = (email)      => sbClient.auth.resetPasswordForEmail(email, {
  redirectTo: window.location.origin + window.location.pathname
});
const authUpdatePassword  = (newPw)      => sbClient.auth.updateUser({ password: newPw });
const authUpdateProfile   = (meta)       => sbClient.auth.updateUser({ data: meta });
const authGetSession      = ()           => sbClient.auth.getSession();

// Upload photo to Supabase Storage — path scoped to user folder
async function sbUploadPhoto(dealId, file, context) {
  const { data: { user } } = await sbClient.auth.getUser();
  const ext  = file.name.split(".").pop();
  const folder = context ? `${context}/` : "";
  const path = `${user?.id || "anon"}/${dealId}/${folder}${Date.now()}.${ext}`;
  const { data: { session } } = await sbClient.auth.getSession();
  const token = session?.access_token || SB_ANON_KEY;
  const res = await fetch(`${SB_URL}/storage/v1/object/${SB_BUCKET}/${path}`, {
    method: "POST",
    headers: { "apikey": SB_ANON_KEY, "Authorization": "Bearer " + token, "Content-Type": file.type, "x-upsert": "true" },
    body: file });
  if (!res.ok) { const b = await res.text().catch(()=>""); throw new Error(`Upload ${res.status}: ${b}`); }
  return `${SB_URL}/storage/v1/object/public/${SB_BUCKET}/${path}`;
}

async function sbDeletePhoto(url) {
  const path = url.split(`/object/public/${SB_BUCKET}/`)[1];
  if (!path) return;
  const { data: { session } } = await sbClient.auth.getSession();
  const token = session?.access_token || SB_ANON_KEY;
  await fetch(`${SB_URL}/storage/v1/object/${SB_BUCKET}/${path}`, {
    method: "DELETE",
    headers: { "apikey": SB_ANON_KEY, "Authorization": "Bearer " + token } });
}

// ─── CONSTANTS & HELPERS ──────────────────────────────────────────────────────
const STATUS_OPTIONS = ["Analyzing","Under Contract","Owned","Pass"];
const STATUS_COLORS  = { Analyzing:"#f59e0b", "Under Contract":"#3b82f6", Owned:"#10b981", Pass:"#ef4444" };
const FMT_USD = (v) => v == null || isNaN(v) ? "—" : v < 0 ? "($" + Math.round(Math.abs(v)).toLocaleString() + ")" : "$" + Math.round(v).toLocaleString();
const FMT_PCT = (v) => v == null || isNaN(v) ? "—" : (v * 100).toFixed(2) + "%";
const FMT_X   = (v) => v == null || isNaN(v) ? "—" : v.toFixed(2) + "x";
const mapsUrl = (addr) => addr ? `https://maps.google.com/?q=${encodeURIComponent(addr)}` : null;

// ─── External API keys ────────────────────────────────────────────────────────
const GMAPS_KEY    = import.meta.env.VITE_GMAPS_KEY;
const RENTCAST_KEY = import.meta.env.VITE_RENTCAST_KEY;

export { IS_PROD, STORAGE_KEY, GMAPS_KEY, RENTCAST_KEY, SB_URL, SB_ANON_KEY, SB_BUCKET, sbClient, loadLocal, saveLocal, validateDealShape, sbRead, sbWrite, sbWriteDeal, sbDeleteDeal, sbWritePrefs, sbUploadPhoto, sbDeletePhoto, authSignInWithGoogle, authSignUp, authSignIn, authSignOut, authResetPassword, authUpdatePassword, authUpdateProfile, authGetSession, STATUS_OPTIONS, STATUS_COLORS, FMT_USD, FMT_PCT, FMT_X, mapsUrl };
