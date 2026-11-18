-- Shared-deal links: only the deal's owner can create them; links can't be re-pointed.
-- Runs in one transaction and always raises at the end.
do $$
declare
  owner uuid := gen_random_uuid(); attacker uuid := gen_random_uuid();
  g_victim uuid; g_attacker uuid; d_victim uuid; d_own uuid; n int;
  passed int := 0; nfail int := 0; failed text := '';
begin
  insert into auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
  select u, 'authenticated', 'authenticated', 'm11-' || u || '@example.invalid', '{}', '{"provider":"email"}', now(), now()
  from unnest(array[owner, attacker]) u;
  insert into public.groups (name, description, created_by) values ('victim', '', owner) returning id into g_victim;
  insert into public.groups (name, description, created_by) values ('attacker', '', attacker) returning id into g_attacker;
  insert into public.group_members (group_id, user_id, role, status, invited_by) values
    (g_victim, owner, 'Owner', 'active', owner), (g_victim, attacker, 'Viewer', 'active', owner),
    (g_attacker, attacker, 'Owner', 'active', attacker);
  insert into public.deals (user_id, deal_data, updated_at) values (owner, '{"address":"victim"}', now()) returning deal_id into d_victim;
  insert into public.deals (user_id, deal_data, updated_at) values (attacker, '{"address":"mine"}', now()) returning deal_id into d_own;

  -- the owner shares their deal into their group: allowed
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.group_deal_refs (group_id, deal_id, owner_user_id, shared_by, shared_at, sort_order) values (g_victim, d_victim, owner, owner, now(), 1);
  passed := passed + 1;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', attacker, 'role', 'authenticated')::text, true);
  set local role authenticated;
  -- attacker links the victim's deal into their own group: refused (any owner/shared_by values)
  begin
    insert into public.group_deal_refs (group_id, deal_id, owner_user_id, shared_by, shared_at, sort_order) values (g_attacker, d_victim, owner, attacker, now(), 1);
    nfail := nfail + 1; failed := failed || 'linked victim deal (owner=victim); ';
  exception when insufficient_privilege then passed := passed + 1; end;
  begin
    insert into public.group_deal_refs (group_id, deal_id, owner_user_id, shared_by, shared_at, sort_order) values (g_attacker, d_victim, attacker, attacker, now(), 1);
    nfail := nfail + 1; failed := failed || 'linked victim deal (owner=attacker); ';
  exception when insufficient_privilege then passed := passed + 1; end;
  -- and therefore can't edit it through the shared-deal save
  begin
    perform public.save_shared_deal(d_victim, '{"address":"hijacked"}', (select updated_at from public.deals where deal_id = d_victim));
    nfail := nfail + 1; failed := failed || 'viewer edited victim deal; ';
  exception when insufficient_privilege then passed := passed + 1; end;
  -- attacker shares their own deal into their own group: allowed
  insert into public.group_deal_refs (group_id, deal_id, owner_user_id, shared_by, shared_at, sort_order) values (g_attacker, d_own, attacker, attacker, now(), 1);
  passed := passed + 1;
  -- re-pointing their link at the victim's deal: refused
  begin
    update public.group_deal_refs set deal_id = d_victim, owner_user_id = owner where group_id = g_attacker and deal_id = d_own;
    nfail := nfail + 1; failed := failed || 're-pointed link; ';
  exception when insufficient_privilege then passed := passed + 1; end;
  -- reordering still works
  update public.group_deal_refs set sort_order = 5 where group_id = g_attacker and deal_id = d_own;
  get diagnostics n = row_count;
  if n = 1 then passed := passed + 1; else nfail := nfail + 1; failed := failed || 'reorder blocked; '; end if;
  reset role;

  select count(*) into n from public.deals where deal_id = d_victim and deal_data->>'address' = 'victim';
  if n = 1 then passed := passed + 1; else nfail := nfail + 1; failed := failed || 'victim deal changed; '; end if;

  raise exception 'M11 RESULT: % passed, % failed | %', passed, nfail, coalesce(nullif(failed, ''), 'none');
end $$;
