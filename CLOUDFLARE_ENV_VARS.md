# Cloudflare Pages — Required Environment Variables

Set these in the Cloudflare Pages dashboard:
**Settings → Environment Variables → Production** (and optionally Preview).

These are server-side only and are never shipped in the browser bundle.

---

## Variables to add

| Variable           | Value                                                          | Used by                          |
|--------------------|----------------------------------------------------------------|----------------------------------|
| `RENTCAST_KEY`     | Your Rentcast API key (from app.rentcast.io/app/api)          | `/api/rentcast` proxy Worker     |
| `GMAPS_KEY`        | Your Google Maps API key (Geocoding API enabled)              | `/api/geocode` proxy Worker      |
| `SUPABASE_URL`     | `https://lxkwvayalxuoryuwxtsq.supabase.co`                    | Both proxy Workers (JWT verify)  |
| `SUPABASE_ANON_KEY`| Your Supabase anon/public key                                 | Both proxy Workers (JWT verify)  |
| `FRED_API_KEY`     | Your FRED API key (from fred.stlouisfed.org/docs/api/api_key) | `/api/fred` proxy Worker         |

---

## Variables to REMOVE from client env (`.env` / Cloudflare client vars)

These should no longer be set as `VITE_` prefixed variables. If they exist, remove them:

- `VITE_RENTCAST_KEY` — now server-side only
- `VITE_GMAPS_KEY` for geocoding — geocoding REST calls now go through `/api/geocode`

> **Note:** `VITE_GMAPS_KEY` is still used by `PortfolioMap.jsx` to load the Google Maps
> JavaScript SDK as a browser `<script>` tag (not a REST call). This type of key cannot be
> proxied. Instead, secure it in **Google Cloud Console → APIs & Services → Credentials** by
> adding an **HTTP referrer restriction** for `renthack.io/*` and `*.renthack.io/*`. This
> prevents the key from being used on any other domain even if someone extracts it from the bundle.

---

## How it works

Each proxy Worker (`/api/rentcast`, `/api/geocode`) verifies the caller's Supabase JWT before
forwarding the request upstream. Unauthenticated requests are rejected with `401`. This means:

1. API keys never appear in the browser bundle or network requests from the client.
2. Only authenticated RentHack users can trigger Rentcast/geocode calls.
3. Abuse from external scripts is blocked at the auth layer.
