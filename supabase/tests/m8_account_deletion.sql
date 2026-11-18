-- M8 — account-deletion clean-up. Runs in one transaction and always raises at the end.
do $$
declare
  leaver uuid := gen_random_uuid(); early uuid := gen_random_uuid(); late uuid := gen_random_uuid();
  g_shared uuid; g_solo uuid; d uuid; n int; r jsonb; v_role text;
  passed int := 0; nfail int := 0; failed text := '';
begin
  insert into auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
  select u, 'authenticated', 'authenticated', 'm8-' || u || '@example.invalid', '{}', '{"provider":"email"}', now(), now()
  from unnest(array[leaver, early, late]) u;

  -- a group with two other members (early joined first), and a group with only the leaver
  insert into public.groups (name, description, created_by) values ('shared', '', leaver) returning id into g_shared;
  insert into public.groups (name, description, created_by) values ('solo', '', leaver) returning id into g_solo;
  insert into public.group_members (group_id, user_id, role, status, invited_by, created_at) values
    (g_shared, leaver, 'Owner', 'active', leaver, now() - interval '3 days'),
    (g_shared, early,  'Viewer', 'active', leaver, now() - interval '2 days'),
    (g_shared, late,   'Editor', 'active', leaver, now() - interval '1 day'),
    (g_solo,   leaver, 'Owner', 'active', leaver, now());
  insert into public.deals (user_id, deal_data, updated_at) values (leaver, '{"address":"x"}', now()) returning deal_id into d;
  insert into public.group_deal_refs (group_id, deal_id, owner_user_id, shared_by, shared_at, sort_order) values (g_shared, d, leaver, leaver, now(), 1);
  insert into public.feedback (email, name, category, message, url) values (upper('m8-' || leaver || '@example.invalid'), 'x', 'Bug', 'hi', '/');

  -- not callable by a signed-in user
  perform set_config('request.jwt.claims', json_build_object('sub', early, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    r := public.prepare_account_deletion(leaver);
    nfail := nfail + 1; failed := failed || 'authenticated user could call; ';
  exception when insufficient_privilege then passed := passed + 1;
  end;
  reset role;

  -- as the Edge Function calls it: service role, no signed-in user
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  r := public.prepare_account_deletion(leaver);

  select role into v_role from public.group_members where group_id = g_shared and user_id = early;
  if v_role = 'Owner' then passed := passed + 1; else nfail := nfail + 1; failed := failed || 'longest-standing member not Owner (' || coalesce(v_role,'none') || '); '; end if;
  select count(*) into n from public.groups where id = g_shared and created_by = early;
  if n = 1 then passed := passed + 1; else nfail := nfail + 1; failed := failed || 'created_by not handed over; '; end if;
  select count(*) into n from public.groups where id = g_solo;
  if n = 0 then passed := passed + 1; else nfail := nfail + 1; failed := failed || 'solo group kept; '; end if;
  select count(*) into n from public.group_deal_refs where owner_user_id = leaver;
  if n = 0 then passed := passed + 1; else nfail := nfail + 1; failed := failed || 'deal links kept; '; end if;
  select count(*) into n from public.feedback where lower(email) = lower('m8-' || leaver || '@example.invalid');
  if n = 0 then passed := passed + 1; else nfail := nfail + 1; failed := failed || 'feedback kept; '; end if;

  -- then deleting the user cascades the rest
  delete from auth.users where id = leaver;
  select count(*) into n from public.deals where user_id = leaver;
  if n = 0 then passed := passed + 1; else nfail := nfail + 1; failed := failed || 'deals kept; '; end if;
  select count(*) into n from public.group_members where user_id = leaver;
  if n = 0 then passed := passed + 1; else nfail := nfail + 1; failed := failed || 'memberships kept; '; end if;

  raise exception 'M8 RESULT: % passed, % failed | %', passed, nfail, coalesce(nullif(failed, ''), 'none');
end $$;
