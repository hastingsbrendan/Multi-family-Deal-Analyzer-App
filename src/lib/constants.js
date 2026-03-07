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
    const key = uid ? STORAGE_KEY + "_" + uid : STORAGE_KEY;
    localStorage.setItem(key, JSON.stringify(d));
  } catch {}
};

// Reads deals for the currently authenticated user (RLS enforces user_id = auth.uid())
async function sbRead() {
  const { data: { user } } = await sbClient.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await sbClient
    .from("deals")
    .select("data, prefs, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Read: ${error.message}`);
  return { data: data?.data || [], prefs: data?.prefs || null, updated_at: data?.updated_at || null };
}

async function sbWritePrefs(prefs) {
  const { data: { user } } = await sbClient.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { error: updateErr } = await sbClient
    .from("deals")
    .update({ prefs, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);
  if (updateErr) {
    const { error: insertErr } = await sbClient
      .from("deals")
      .insert({ user_id: user.id, data: [], prefs, updated_at: new Date().toISOString() });
    if (insertErr) throw new Error(`WritePrefs: ${insertErr.message}`);
  }
}

// Writes deals for the current user — upserts on user_id (one row per user)
async function sbWrite(deals) {
  const { data: { user } } = await sbClient.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  // Try update first (existing user), then insert (new user)
  const { error: updateErr } = await sbClient
    .from("deals")
    .update({ data: deals, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);
  if (updateErr) {
    // Row doesn't exist yet — insert for new user
    const { error: insertErr } = await sbClient
      .from("deals")
      .insert({ user_id: user.id, data: deals, updated_at: new Date().toISOString() });
    if (insertErr) throw new Error(`Write: ${insertErr.message}`);
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
async function sbUploadPhoto(dealId, file) {
  const { data: { user } } = await sbClient.auth.getUser();
  const ext  = file.name.split(".").pop();
  const path = `${user?.id || "anon"}/${dealId}/${Date.now()}.${ext}`;
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

export { STORAGE_KEY, GMAPS_KEY, RENTCAST_KEY, SB_URL, SB_ANON_KEY, SB_BUCKET, sbClient, loadLocal, saveLocal, authSignInWithGoogle, authSignUp, authSignIn, authSignOut, authResetPassword, authUpdatePassword, authUpdateProfile, authGetSession, STATUS_OPTIONS, STATUS_COLORS, FMT_USD, FMT_PCT, FMT_X, mapsUrl };
