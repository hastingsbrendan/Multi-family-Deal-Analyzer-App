-- BACK-117 — version checks on deals: the conditional update the app sends only applies
-- on top of the version it read, and the DB sets updated_at regardless of what the client sends.
-- Runs in one transaction and always raises at the end.
do $$
declare
  me uuid := gen_random_uuid(); d uuid; v1 timestamptz; v2 timestamptz; n int;
  passed int := 0; nfail int := 0; failed text := '';
begin
  insert into auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
  values (me, 'authenticated', 'authenticated', 'v-' || me || '@example.invalid', '{}', '{"provider":"email"}', now(), now());
  perform set_config('request.jwt.claims', json_build_object('sub', me, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- a device clock far in the past is ignored
  insert into public.deals (user_id, deal_data, updated_at) values (me, '{"address":"1"}', '2001-01-01')
    returning deal_id, updated_at into d, v1;
  if v1 > now() - interval '1 minute' then passed := passed + 1; else nfail := nfail + 1; failed := failed || 'insert kept client updated_at; '; end if;

  -- device A saves on top of v1
  update public.deals set deal_data = '{"address":"A"}', updated_at = '2001-01-01'
    where deal_id = d and user_id = me and updated_at = v1 returning updated_at into v2;
  get diagnostics n = row_count;
  if n = 1 and v2 > v1 then passed := passed + 1; else nfail := nfail + 1; failed := failed || 'save on current version failed or version did not advance; '; end if;

  -- device B still holds v1: its save must not apply
  update public.deals set deal_data = '{"address":"B"}' where deal_id = d and user_id = me and updated_at = v1;
  get diagnostics n = row_count;
  if n = 0 then passed := passed + 1; else nfail := nfail + 1; failed := failed || 'stale save overwrote; '; end if;
  select count(*) into n from public.deals where deal_id = d and deal_data->>'address' = 'A';
  if n = 1 then passed := passed + 1; else nfail := nfail + 1; failed := failed || 'A''s save lost; '; end if;
  reset role;

  raise exception 'BACK117 RESULT: % passed, % failed | %', passed, nfail, coalesce(nullif(failed, ''), 'none');
end $$;
