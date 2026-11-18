# Deployment

## Branches

- `develop` → Cloudflare Pages preview
- `main` → production (renthack.io)

Both deploy automatically on push. CI (`.github/workflows/ci.yml`) runs the tests, lint, build and a production dependency audit on every push and pull request.

## Cloudflare Pages secrets

Set these under **Pages project → Settings → Variables and Secrets**, as type **Secret**, for Production and Preview. A new value takes effect on the next deployment.

| Variable | Used by |
|---|---|
| `RENTCAST_KEY` | `/api/rentcast` |
| `GMAPS_KEY` | `/api/geocode` (server key, restricted to the Geocoding API) |
| `FRED_API_KEY` | `/api/fred` |
| `BLS_API_KEY` | `/api/bls` |
| `SUPABASE_URL` | proxies, to verify the caller's session (no trailing slash) |
| `SUPABASE_ANON_KEY` | proxies, to verify the caller's session |

Browser variables (`VITE_*`, see `.env.example`) are public by design: the Supabase URL and anon key, and `VITE_GMAPS_KEY` for the Maps JavaScript SDK. Restrict the browser Maps key to your domains under **Google Cloud Console → APIs & Services → Credentials**.

## Supabase

- Edge Functions: `supabase functions deploy <name>`. `verify_jwt` per function is recorded in `supabase/config.toml`; the Stripe webhook must run with it off because Stripe signs its own requests.
- The schema lives in `supabase/migrations/` (a production baseline plus timestamped changes); see `supabase/README.md`. RLS tests are in `supabase/tests/`.
- Stripe secrets (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) are Supabase function secrets.
- A daily GitHub Action pings the database so the free tier doesn't pause (`.github/workflows/supabase-keepalive.yml`).
