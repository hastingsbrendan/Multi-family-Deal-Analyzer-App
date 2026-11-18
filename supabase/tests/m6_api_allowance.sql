-- M6 — daily API allowance. Runs in one transaction and always raises at the end.
do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); n int; i int;
  passed int := 0; nfail int := 0; failed text := '';
begin
  insert into auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
  select u, 'authenticated', 'authenticated', 'm6-' || u || '@example.invalid', '{}', '{"provider":"email"}', now(), now()
  from unnest(array[a, b]) u;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  for i in 1..3 loop n := public.use_api_allowance('rentcast', 3); end loop;
  if n = 3 then passed := passed + 1; else nfail := nfail + 1; failed := failed || 'third call used ' || n || '; '; end if;
  n := public.use_api_allowance('rentcast', 3);
  if n = 4 then passed := passed + 1; else nfail := nfail + 1; failed := failed || 'over-limit call returned ' || n || '; '; end if;
  -- direct table access is refused
  begin
    select count(*) into n from public.api_usage;
    nfail := nfail + 1; failed := failed || 'user can read api_usage; ';
  exception when insufficient_privilege then passed := passed + 1;
  end;
  reset role;

  -- the over-limit attempt was not counted
  select count into n from public.api_usage where user_id = a and kind = 'rentcast';
  if n = 3 then passed := passed + 1; else nfail := nfail + 1; failed := failed || 'stored count ' || n || '; '; end if;

  -- another user has their own allowance
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  n := public.use_api_allowance('rentcast', 3);
  if n = 1 then passed := passed + 1; else nfail := nfail + 1; failed := failed || 'second user starts at ' || n || '; '; end if;
  reset role;

  -- not callable signed out
  set local role anon;
  begin
    n := public.use_api_allowance('rentcast', 3);
    nfail := nfail + 1; failed := failed || 'anon could call; ';
  exception when insufficient_privilege then passed := passed + 1;
  end;
  reset role;

  raise exception 'M6 RESULT: % passed, % failed | %', passed, nfail, coalesce(nullif(failed, ''), 'none');
end $$;
