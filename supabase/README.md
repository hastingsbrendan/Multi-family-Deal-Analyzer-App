# Database

- `migrations/20261118000000_baseline.sql` — the full `public` schema as it runs in production
  (tables, row-level security policies, functions, triggers), exported with
  `supabase db dump --schema public`.
- `migrations/20261118000001_auth_trigger_and_storage.sql` — the sign-up trigger on
  `auth.users` and the `deal-photos` storage bucket with its policies.
- `sql/` — the individual changes made before the baseline existed (group access, invites,
  profile visibility, version-checked saves, shared-deal saves, API allowance, account
  deletion). They are already part of the baseline; they're kept as a record of why each
  rule exists. New changes go in `migrations/` as timestamped files.
- `tests/*.sql` — row-level security tests. Each runs in one transaction, always rolls
  back, and reports `N passed, M failed`.
- `functions/` — Edge Functions (Stripe checkout and webhook, feedback, account deletion).

Rebuild locally (needs Docker):

```bash
npx supabase start
npx supabase db reset      # applies migrations/
```
