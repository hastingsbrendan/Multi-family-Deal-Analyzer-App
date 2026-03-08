// ─── Constants, config & formatting helpers ──────────────────────────────────
import { createClient } from '@supabase/supabase-js';

const STORAGE_KEY = "re_deal_analyzer_v2";
const SB_URL      = import.meta.env.VITE_SB_URL      || "https://lxkwvayalxuoryuwxtsq.supabase.co";
const SB_ANON_KEY = import.meta.env.VITE_SB_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx4a3d2YXlhbHh1b3J5dXd4dHNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyOTAxMTAsImV4cCI6MjA4Nzg2NjExMH0.pcja3-H81ghs9EEoigwAb7HsVBtYsc2tO0DlLX6cAo8";
const SB_BUCKET   = "deal-photos";

// Supabase JS client — handles JWT storage, auto token refresh, session persistence
const sbClient = createClient(SB_URL, SB_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

// Key local cache by user ID so different users on same device never see each other's data
const loadLocal = (uid) => {
  try {
    const key = uid ? STORAGE_KEY + "_" + uid : STORAGE_KEY;
    return JSON.parse(localStorage.getItem(key)) || [];
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
  const deals = (data || []).map(row => ({ ...row.deal_data, _deal_id: row.deal_id }));
  const latestAt = data?.[0]?.updated_at || prefsRow?.updated_at || null;
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
      .insert({ user_id: user.id, data: [], prefs, updated_at: new Date().toISOString() });
    if (insertErr) throw new Error(`WritePrefs: ${insertErr.message}`);
  }
}

// Auth convenience wrappers
const authSignInWithGoogle = () => sbClient.auth.signInWithOAuth({
  provider: "google",
  options: { redirectTo: window.location.origin + window.location.pathname }
});
const authSignUp          = (email, pw)  => sbClient.auth.signUp({ email, password: pw });
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
const FMT_USD = (v) => v == null || isNaN(v) ? "—" : "$" + Math.round(v).toLocaleString();
const FMT_PCT = (v) => v == null || isNaN(v) ? "—" : (v * 100).toFixed(2) + "%";
const FMT_X   = (v) => v == null || isNaN(v) ? "—" : v.toFixed(2) + "x";
const mapsUrl = (addr) => addr ? `https://maps.google.com/?q=${encodeURIComponent(addr)}` : null;

// ─── External API keys ────────────────────────────────────────────────────────
const GMAPS_KEY    = import.meta.env.VITE_GMAPS_KEY    || "AIzaSyAg90J2ZmwbAwPwlRHTeREfAWfiOwR1hiQ";
const RENTCAST_KEY = import.meta.env.VITE_RENTCAST_KEY || "ba391816691449ada9dea5b9151ff4d5";

export { STORAGE_KEY, GMAPS_KEY, RENTCAST_KEY, SB_URL, SB_ANON_KEY, SB_BUCKET, sbClient, loadLocal, saveLocal, sbRead, sbWrite, sbWriteDeal, sbDeleteDeal, sbWritePrefs, sbUploadPhoto, sbDeletePhoto, authSignInWithGoogle, authSignUp, authSignIn, authSignOut, authResetPassword, authUpdatePassword, authUpdateProfile, authGetSession, STATUS_OPTIONS, STATUS_COLORS, FMT_USD, FMT_PCT, FMT_X, mapsUrl };
