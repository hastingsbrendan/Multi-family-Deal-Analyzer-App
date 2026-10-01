-- BACK-109c — invites sent to an email before that person has an account must become
-- a pending membership when they sign up. Nothing read group_invites_pending, so these
-- invites never reached anyone. Runs in one transaction and always raises at the end.
do $$
declare
  owner uuid := gen_random_uuid(); newbie uuid := gen_random_uuid(); plain uuid := gen_random_uuid(); g uuid; n int;
  email text := 'Invitee-' || gen_random_uuid() || '@Example.invalid';
  passed int := 0; nfail int := 0; failed text := '';
begin
  insert into auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
  values (owner, 'authenticated', 'authenticated', 'owner-' || owner || '@example.invalid', '{}', '{"provider":"email"}', now(), now());
  insert into public.groups (name, description, created_by) values ('BACK109c test', '', owner) returning id into g;
  insert into public.group_members (group_id, user_id, role, status, invited_by) values (g, owner, 'Owner', 'active', owner);
  -- invite typed with different capitalisation than the eventual sign-up
  insert into public.group_invites_pending (group_id, invited_email, role, invited_by) values (g, email, 'Editor', owner);

  -- the invitee signs up
  insert into auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
  values (newbie, 'authenticated', 'authenticated', lower(email), '{"display_name":"New Person"}', '{"provider":"email"}', now(), now());

  select count(*) into n from public.profiles where id = newbie and display_name = 'New Person';
  if n = 1 then passed := passed + 1; else nfail := nfail + 1; failed := failed || 'profile not created; '; end if;
  select count(*) into n from public.group_members where group_id = g and user_id = newbie and status = 'pending' and role = 'Editor';
  if n = 1 then passed := passed + 1; else nfail := nfail + 1; failed := failed || 'no pending Editor membership after signup; '; end if;
  select count(*) into n from public.group_invites_pending where group_id = g;
  if n = 0 then passed := passed + 1; else nfail := nfail + 1; failed := failed || 'email invite left behind; '; end if;

  -- they can then accept it like any other invite
  perform set_config('request.jwt.claims', json_build_object('sub', newbie, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.group_members set status = 'active' where group_id = g and user_id = newbie;
  get diagnostics n = row_count;
  if n = 1 then passed := passed + 1; else nfail := nfail + 1; failed := failed || 'cannot accept converted invite; '; end if;
  reset role;

  -- a normal signup with no invites still just creates the profile
  insert into auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
  values (plain, 'authenticated', 'authenticated', 'plain-' || plain || '@example.invalid', '{}', '{"provider":"email"}', now(), now());
  select count(*) into n from public.profiles where id = plain;
  if n = 1 then passed := passed + 1; else nfail := nfail + 1; failed := failed || 'plain signup has no profile; '; end if;
  select count(*) into n from public.group_members where user_id = plain;
  if n = 0 then passed := passed + 1; else nfail := nfail + 1; failed := failed || 'plain signup got memberships; '; end if;

  raise exception 'BACK109c RESULT: % passed, % failed | %', passed, nfail, coalesce(nullif(failed, ''), 'none');
end $$;
