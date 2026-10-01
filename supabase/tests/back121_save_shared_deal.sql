-- BACK-121 — who can save a shared deal through save_shared_deal, and the version check.
-- Runs in one transaction and always raises at the end.
do $$
declare
  o uuid := gen_random_uuid();  -- deal owner (group Owner)
  e uuid := gen_random_uuid();  -- active Editor
  v uuid := gen_random_uuid();  -- active Viewer
  p uuid := gen_random_uuid();  -- pending Editor
  x uuid := gen_random_uuid();  -- outsider
  g uuid; d uuid; v0 timestamptz; v1 timestamptz; r jsonb; n int; owner_now uuid;
  passed int := 0; nfail int := 0; failed text := '';
begin
  insert into auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
  select u, 'authenticated', 'authenticated', 'b121-' || u || '@example.invalid', '{}', '{"provider":"email"}', now(), now()
  from unnest(array[o, e, v, p, x]) u;
  insert into public.groups (name, description, created_by) values ('BACK121 test', '', o) returning id into g;
  insert into public.group_members (group_id, user_id, role, status, invited_by) values
    (g, o, 'Owner', 'active', o), (g, e, 'Editor', 'active', o), (g, v, 'Viewer', 'active', o), (g, p, 'Editor', 'pending', o);
  insert into public.deals (user_id, deal_data, updated_at) values (o, '{"address":"start"}', now())
    returning deal_id, updated_at into d, v0;
  insert into public.group_deal_refs (group_id, deal_id, owner_user_id, shared_by, shared_at, sort_order) values (g, d, o, o, now(), 1);

  -- Editor saves on top of the current version
  perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public.save_shared_deal(d, '{"address":"editor"}', v0);
  if r->>'status' = 'saved' then passed := passed + 1; v1 := (r->>'version')::timestamptz;
  else nfail := nfail + 1; failed := failed || 'editor save: ' || r::text || '; '; end if;
  -- a second Editor tab still holding v0 gets a conflict with the saved copy
  r := public.save_shared_deal(d, '{"address":"stale"}', v0);
  if r->>'status' = 'conflict' and r->'theirs'->>'address' = 'editor' and (r->>'version')::timestamptz = v1 then passed := passed + 1;
  else nfail := nfail + 1; failed := failed || 'stale save: ' || r::text || '; '; end if;
  reset role;

  select user_id into owner_now from public.deals where deal_id = d;
  if owner_now = o then passed := passed + 1; else nfail := nfail + 1; failed := failed || 'owner changed; '; end if;
  select count(*) into n from public.deals where deal_id = d and deal_data->>'address' = 'editor';
  if n = 1 then passed := passed + 1; else nfail := nfail + 1; failed := failed || 'editor edit not stored; '; end if;

  -- Owner of the deal can save too
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public.save_shared_deal(d, '{"address":"owner"}', v1);
  if r->>'status' = 'saved' then passed := passed + 1; else nfail := nfail + 1; failed := failed || 'owner save: ' || r::text || '; '; end if;
  reset role;

  -- Viewer, pending Editor and outsider are refused
  foreach owner_now in array array[v, p, x] loop
    perform set_config('request.jwt.claims', json_build_object('sub', owner_now, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin
      r := public.save_shared_deal(d, '{"address":"hijack"}', (select updated_at from public.deals where deal_id = d));
      nfail := nfail + 1; failed := failed || 'refused role saved (' || owner_now || '); ';
    exception when insufficient_privilege then passed := passed + 1;
    end;
    reset role;
  end loop;
  select count(*) into n from public.deals where deal_id = d and deal_data->>'address' = 'owner';
  if n = 1 then passed := passed + 1; else nfail := nfail + 1; failed := failed || 'refused save changed data; '; end if;

  -- deleted deal → conflict with nothing
  delete from public.deals where deal_id = d;
  perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public.save_shared_deal(d, '{"address":"x"}', v1);
  if r->>'status' = 'conflict' and r->'theirs' = 'null'::jsonb then passed := passed + 1;
  else nfail := nfail + 1; failed := failed || 'deleted: ' || r::text || '; '; end if;
  reset role;

  -- not callable without signing in
  set local role anon;
  begin
    r := public.save_shared_deal(d, '{}', now());
    nfail := nfail + 1; failed := failed || 'anon could call; ';
  exception when insufficient_privilege then passed := passed + 1;
  end;
  reset role;

  raise exception 'BACK121 RESULT: % passed, % failed | %', passed, nfail, coalesce(nullif(failed, ''), 'none');
end $$;
