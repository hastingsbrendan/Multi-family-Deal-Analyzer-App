-- BACK-109d — who can read which profiles. Runs in one transaction and always raises at the end.
do $$
declare
  owner uuid := gen_random_uuid(); member uuid := gen_random_uuid(); invitee uuid := gen_random_uuid();
  leaver uuid := gen_random_uuid(); stranger uuid := gen_random_uuid(); g uuid; n int; u uuid;
  passed int := 0; nfail int := 0; failed text := '';
begin
  foreach u in array array[owner, member, invitee, leaver, stranger] loop
    insert into auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
    values (u, 'authenticated', 'authenticated', 'p-' || u || '@example.invalid', '{}', '{"provider":"email"}', now(), now());
  end loop;
  insert into public.groups (name, description, created_by) values ('BACK109d test', '', owner) returning id into g;
  insert into public.group_members (group_id, user_id, role, status, invited_by) values
    (g, owner, 'Owner', 'active', owner), (g, member, 'Viewer', 'active', owner), (g, invitee, 'Viewer', 'pending', owner);
  -- leaver commented, then left the group
  insert into public.group_comments (group_id, deal_id, user_id, body) values (g, gen_random_uuid(), leaver, 'hi');

  -- owner (active): self, member, pending invitee, former commenter — not the stranger
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.profiles where id in (owner, member, invitee, leaver);
  if n = 4 then passed := passed + 1; else nfail := nfail + 1; failed := failed || 'owner sees ' || n || '/4 group profiles; '; end if;
  select count(*) into n from public.profiles where id = stranger;
  if n = 0 then passed := passed + 1; else nfail := nfail + 1; failed := failed || 'owner sees stranger; '; end if;
  -- the member-list join the Groups page runs
  select count(*) into n from public.group_members gm join public.profiles p on p.id = gm.user_id where gm.group_id = g;
  if n = 3 then passed := passed + 1; else nfail := nfail + 1; failed := failed || 'member list join returns ' || n || '/3; '; end if;
  reset role;

  -- stranger: only their own profile, nothing else in the table
  perform set_config('request.jwt.claims', json_build_object('sub', stranger, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.profiles;
  if n = 1 then passed := passed + 1; else nfail := nfail + 1; failed := failed || 'stranger sees ' || n || ' profiles; '; end if;
  reset role;

  -- pending invitee isn't in the group yet: own profile only
  perform set_config('request.jwt.claims', json_build_object('sub', invitee, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.profiles where id in (owner, member, leaver);
  if n = 0 then passed := passed + 1; else nfail := nfail + 1; failed := failed || 'pending invitee sees ' || n || ' members; '; end if;
  select count(*) into n from public.profiles where id = invitee;
  if n = 1 then passed := passed + 1; else nfail := nfail + 1; failed := failed || 'invitee cannot see self; '; end if;
  reset role;

  -- anon: nothing (BACK-109 revoked the table grant, so this is refused before RLS runs)
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  begin
    select count(*) into n from public.profiles;
  exception when insufficient_privilege then n := 0;
  end;
  if n = 0 then passed := passed + 1; else nfail := nfail + 1; failed := failed || 'anon sees ' || n || ' profiles; '; end if;
  reset role;

  raise exception 'BACK109d RESULT: % passed, % failed | %', passed, nfail, coalesce(nullif(failed, ''), 'none');
end $$;
