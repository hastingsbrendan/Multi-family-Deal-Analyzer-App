-- BACK-109 — role-by-role access checks for the group tables.
--
-- Creates throwaway users (owner, editor, viewer, pending invitee, outsider), a group
-- and a shared deal, performs every operation src/lib/groups.js uses as each person,
-- and compares the outcome with what should be allowed. Runs in one transaction and
-- ALWAYS raises at the end, so nothing it creates is kept. Read the result from the
-- error message: "BACK109 RESULT: N passed, M failed | <failures>".
--
-- Run with the Supabase SQL editor or execute_sql (needs the postgres role).
do $$
declare
  o uuid := gen_random_uuid();  -- owner
  e uuid := gen_random_uuid();  -- editor
  v uuid := gen_random_uuid();  -- viewer
  p uuid := gen_random_uuid();  -- invited, not yet accepted
  x uuid := gen_random_uuid();  -- outsider
  g uuid; d uuid; n int; passed int := 0; failed text := ''; nfail int := 0;
begin
  insert into auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
  select u, 'authenticated', 'authenticated', 'back109-' || u || '@example.invalid', '{}', '{"provider":"email"}', now(), now()
  from unnest(array[o, e, v, p, x]) as u;

  -- ── Owner creates the group (sbCreateGroup) and invites people (sbInviteMember) ──
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.groups (name, description, created_by) values ('BACK109 test', '', o) returning id into g;
  insert into public.group_members (group_id, user_id, role, status, invited_by) values (g, o, 'Owner', 'active', o);
  insert into public.group_members (group_id, user_id, role, status, invited_by) values
    (g, e, 'Editor', 'pending', o), (g, v, 'Viewer', 'pending', o), (g, p, 'Viewer', 'pending', o);
  insert into public.deals (user_id, deal_data, updated_at) values (o, '{"assumptions":{}}'::jsonb, now()) returning deal_id into d;
  insert into public.group_deal_refs (group_id, deal_id, owner_user_id, shared_by, shared_at, sort_order)
    values (g, d, o, o, now(), 1);
  reset role;

  -- ── Invitees accept (sbRespondToInvite) ─────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.group_members set status = 'active' where group_id = g and user_id = e;
  get diagnostics n = row_count;
  if n = 1 then passed := passed + 1; else nfail := nfail + 1; failed := failed || 'editor cannot accept invite; '; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.group_members set status = 'active' where group_id = g and user_id = v;
  reset role;

  -- ── Outsider: sees nothing, can join nothing ──────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.groups where id = g;
  if n = 0 then passed := passed + 1; else nfail := nfail + 1; failed := failed || 'outsider sees group; '; end if;
  select count(*) into n from public.group_members where group_id = g;
  if n = 0 then passed := passed + 1; else nfail := nfail + 1; failed := failed || 'outsider sees members; '; end if;
  begin
    insert into public.group_members (group_id, user_id, role, status, invited_by) values (g, x, 'Owner', 'active', x);
    nfail := nfail + 1; failed := failed || 'outsider joined as Owner; ';
  exception when others then passed := passed + 1; end;
  begin
    insert into public.group_members (group_id, user_id, role, status, invited_by) values (g, x, 'Viewer', 'active', x);
    nfail := nfail + 1; failed := failed || 'outsider joined as Viewer; ';
  exception when others then passed := passed + 1; end;
  select count(*) into n from public.deals where deal_id = d;
  if n = 0 then passed := passed + 1; else nfail := nfail + 1; failed := failed || 'outsider reads shared deal; '; end if;
  update public.group_members set role = 'Viewer' where group_id = g;
  get diagnostics n = row_count;
  if n = 0 then passed := passed + 1; else nfail := nfail + 1; failed := failed || 'outsider changed roles; '; end if;
  begin
    insert into public.group_invites_pending (group_id, invited_email, role, invited_by) values (g, 'x-invite@example.invalid', 'Viewer', x);
    nfail := nfail + 1; failed := failed || 'outsider created invite; ';
  exception when others then passed := passed + 1; end;
  reset role;

  -- ── Pending invitee: sees the group name and their own row only ───────────────
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.groups where id = g;
  if n = 1 then passed := passed + 1; else nfail := nfail + 1; failed := failed || 'pending invitee cannot see group name; '; end if;
  select count(*) into n from public.group_members where group_id = g;
  if n = 1 then passed := passed + 1; else nfail := nfail + 1; failed := failed || 'pending invitee sees ' || n || ' member rows (expected 1); '; end if;
  select count(*) into n from public.deals where deal_id = d;
  if n = 0 then passed := passed + 1; else nfail := nfail + 1; failed := failed || 'pending invitee reads shared deal; '; end if;
  reset role;

  -- ── Viewer: reads members and deals, cannot manage anything ───────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.group_members where group_id = g;
  if n = 4 then passed := passed + 1; else nfail := nfail + 1; failed := failed || 'viewer sees ' || n || ' members (expected 4); '; end if;
  select count(*) into n from public.deals where deal_id = d;
  if n = 1 then passed := passed + 1; else nfail := nfail + 1; failed := failed || 'viewer cannot read shared deal; '; end if;
  begin
    insert into public.group_members (group_id, user_id, role, status, invited_by) values (g, x, 'Viewer', 'pending', v);
    nfail := nfail + 1; failed := failed || 'viewer invited someone; ';
  exception when others then passed := passed + 1; end;
  begin
    update public.group_members set role = 'Owner' where group_id = g and user_id = v;
    get diagnostics n = row_count;
    if n = 0 then passed := passed + 1; else nfail := nfail + 1; failed := failed || 'viewer promoted self to Owner; '; end if;
  exception when others then passed := passed + 1; end;
  update public.group_members set role = 'Viewer' where group_id = g and user_id = e;
  get diagnostics n = row_count;
  if n = 0 then passed := passed + 1; else nfail := nfail + 1; failed := failed || 'viewer changed editor role; '; end if;
  delete from public.group_members where group_id = g and user_id = e;
  get diagnostics n = row_count;
  if n = 0 then passed := passed + 1; else nfail := nfail + 1; failed := failed || 'viewer removed editor; '; end if;
  reset role;

  -- ── Editor: invites, cannot manage roles or promote self ──────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into public.group_members (group_id, user_id, role, status, invited_by) values (g, x, 'Owner', 'pending', e);
    nfail := nfail + 1; failed := failed || 'editor invited someone as Owner; ';
  exception when others then passed := passed + 1; end;
  begin
    insert into public.group_members (group_id, user_id, role, status, invited_by) values (g, x, 'Viewer', 'pending', e);
    passed := passed + 1;
  exception when others then nfail := nfail + 1; failed := failed || 'editor cannot invite (' || sqlerrm || '); '; end;
  begin
    insert into public.group_invites_pending (group_id, invited_email, role, invited_by) values (g, 'e-invite@example.invalid', 'Viewer', e);
    passed := passed + 1;
  exception when others then nfail := nfail + 1; failed := failed || 'editor cannot create email invite (' || sqlerrm || '); '; end;
  update public.group_members set role = 'Editor' where group_id = g and user_id = v;
  get diagnostics n = row_count;
  if n = 0 then passed := passed + 1; else nfail := nfail + 1; failed := failed || 'editor changed viewer role; '; end if;
  begin
    update public.group_members set role = 'Owner' where group_id = g and user_id = e;
    get diagnostics n = row_count;
    if n = 0 then passed := passed + 1; else nfail := nfail + 1; failed := failed || 'editor promoted self to Owner; '; end if;
  exception when others then passed := passed + 1; end;
  reset role;

  -- ── Owner: manages roles and members, sees invites ────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.group_members set role = 'Editor' where group_id = g and user_id = v;
  get diagnostics n = row_count;
  if n = 1 then passed := passed + 1; else nfail := nfail + 1; failed := failed || 'owner cannot change role; '; end if;
  delete from public.group_members where group_id = g and user_id = p;
  get diagnostics n = row_count;
  if n = 1 then passed := passed + 1; else nfail := nfail + 1; failed := failed || 'owner cannot remove member; '; end if;
  select count(*) into n from public.group_invites_pending where group_id = g;
  if n >= 1 then passed := passed + 1; else nfail := nfail + 1; failed := failed || 'owner cannot see email invites; '; end if;
  reset role;

  -- ── Member leaves (sbLeaveGroup) ─────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  set local role authenticated;
  delete from public.group_members where group_id = g and user_id = v;
  get diagnostics n = row_count;
  if n = 1 then passed := passed + 1; else nfail := nfail + 1; failed := failed || 'member cannot leave; '; end if;
  reset role;

  -- ── Not logged in ─────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  begin
    select count(*) into n from public.group_members;
    if n = 0 then passed := passed + 1; else nfail := nfail + 1; failed := failed || 'anon sees members; '; end if;
  exception when insufficient_privilege then passed := passed + 1; end;
  reset role;

  raise exception 'BACK109 RESULT: % passed, % failed | %', passed, nfail, coalesce(nullif(failed, ''), 'none');
end $$;
