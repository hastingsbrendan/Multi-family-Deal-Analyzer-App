-- BACK-109 — membership-based access for groups, group_members, group_invites_pending.
-- Applied to production as Supabase migration "back109_group_access_policies".
-- Kept here for review; verify with supabase/tests/back109_group_access.sql.
--
-- Replaces the "authenticated_all" policies (USING true / WITH CHECK true), which let
-- any signed-in user read, join, edit or delete any group — including adding
-- themselves as Owner and then reading every deal shared into it.

-- ── Helpers ──────────────────────────────────────────────────────────────────
-- SECURITY DEFINER so group policies can consult memberships without querying
-- group_members under its own RLS (the recursion the old catch-all policy avoided).
-- Both only ever answer for auth.uid(), unlike get_my_group_ids(uid).
create or replace function public.my_group_ids(include_pending boolean default false)
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select gm.group_id from public.group_members gm
  where gm.user_id = auth.uid() and (include_pending or gm.status = 'active')
$$;

create or replace function public.my_group_role(gid uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select gm.role from public.group_members gm
  where gm.group_id = gid and gm.user_id = auth.uid() and gm.status = 'active'
$$;

create or replace function public.group_member_count(gid uuid)
returns integer
language sql stable security definer set search_path = ''
as $$
  select count(*)::integer from public.group_members gm where gm.group_id = gid
$$;

revoke all on function public.my_group_ids(boolean) from public, anon;
revoke all on function public.my_group_role(uuid)    from public, anon;
revoke all on function public.group_member_count(uuid) from public, anon;
grant execute on function public.my_group_ids(boolean)   to authenticated;
grant execute on function public.my_group_role(uuid)     to authenticated;
grant execute on function public.group_member_count(uuid) to authenticated;

-- Superseded: took any user's id and returned their groups. Unused by app and policies.
drop function if exists public.get_my_group_ids(uuid);

-- ── groups ───────────────────────────────────────────────────────────────────
drop policy if exists "authenticated_all" on public.groups;
-- created_by: sbCreateGroup reads the new row back before the creator is a member.
-- Pending invitees can read the group so the invite can show its name.
create policy "groups_select_members" on public.groups for select to authenticated
  using (created_by = auth.uid() or id in (select public.my_group_ids(true)));
create policy "groups_insert_own" on public.groups for insert to authenticated
  with check (created_by = auth.uid());
create policy "groups_update_owner" on public.groups for update to authenticated
  using (public.my_group_role(id) = 'Owner') with check (public.my_group_role(id) = 'Owner');
create policy "groups_delete_owner" on public.groups for delete to authenticated
  using (public.my_group_role(id) = 'Owner');

-- ── group_members ────────────────────────────────────────────────────────────
drop policy if exists "authenticated_all" on public.group_members;
-- Your own rows (incl. pending invites), plus the member list of groups you're active in
create policy "members_select" on public.group_members for select to authenticated
  using (user_id = auth.uid() or group_id in (select public.my_group_ids(false)));
create policy "members_insert" on public.group_members for insert to authenticated
  with check (
    -- The creator becomes the first Owner of a group they just created
    (user_id = auth.uid() and role = 'Owner' and status = 'active'
      and exists (select 1 from public.groups gr where gr.id = group_id and gr.created_by = auth.uid())
      and public.group_member_count(group_id) = 0)
    or
    -- Owners and Editors invite other people as pending Editors / Viewers
    (user_id <> auth.uid() and status = 'pending' and role in ('Editor', 'Viewer')
      and invited_by = auth.uid()
      and public.my_group_role(group_id) in ('Owner', 'Editor'))
  );
-- Row access for updates; what may change is enforced by group_members_guard below
create policy "members_update" on public.group_members for update to authenticated
  using (user_id = auth.uid() or public.my_group_role(group_id) = 'Owner')
  with check (user_id = auth.uid() or public.my_group_role(group_id) = 'Owner');
-- Leave / decline your own membership, or an Owner removes someone
create policy "members_delete" on public.group_members for delete to authenticated
  using (user_id = auth.uid() or public.my_group_role(group_id) = 'Owner');

-- RLS can't compare old and new values, so a trigger limits non-Owners to accepting
-- their own pending invite: no role changes (e.g. Viewer → Owner), no moving rows.
create or replace function public.group_members_guard()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then return new; end if;  -- service role, migrations, triggers
  if new.group_id <> old.group_id or new.user_id <> old.user_id then
    raise exception 'group membership cannot be moved' using errcode = '42501';
  end if;
  if coalesce(public.my_group_role(old.group_id), '') = 'Owner' then return new; end if;
  if new.role <> old.role
     or new.invited_by is distinct from old.invited_by
     or not (new.status = old.status
             or (old.user_id = auth.uid() and old.status = 'pending' and new.status = 'active')) then
    raise exception 'only a group Owner can change this membership' using errcode = '42501';
  end if;
  return new;
end
$$;
revoke all on function public.group_members_guard() from public, anon, authenticated;
drop trigger if exists group_members_guard on public.group_members;
create trigger group_members_guard before update on public.group_members
  for each row execute function public.group_members_guard();

-- ── group_invites_pending ────────────────────────────────────────────────────
drop policy if exists "authenticated_all" on public.group_invites_pending;
create policy "invites_select" on public.group_invites_pending for select to authenticated
  using (invited_by = auth.uid() or public.my_group_role(group_id) = 'Owner');
create policy "invites_insert" on public.group_invites_pending for insert to authenticated
  with check (invited_by = auth.uid() and public.my_group_role(group_id) in ('Owner', 'Editor'));
create policy "invites_delete" on public.group_invites_pending for delete to authenticated
  using (invited_by = auth.uid() or public.my_group_role(group_id) = 'Owner');
