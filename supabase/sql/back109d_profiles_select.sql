-- BACK-109d — profiles were readable by every signed-in user, so anyone could list every
-- account's email. The app only ever reads profiles through group joins (member list,
-- comment authors), so visibility now follows the same lines as group_members / group_comments:
--   • your own profile
--   • anyone with a membership row (any status) in a group where you're an active member
--     — matches members_select, so owners still see the names of pending invitees
--   • authors of comments in those groups — keeps names on comments by people who left
-- my_group_ids() is SECURITY DEFINER, so this does not recurse through group_members RLS.

drop policy if exists "Users can view all profiles" on public.profiles;
drop policy if exists profiles_select on public.profiles;

create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1 from public.group_members gm
      where gm.user_id = profiles.id
        and gm.group_id in (select public.my_group_ids(false))
    )
    or exists (
      select 1 from public.group_comments c
      where c.user_id = profiles.id
        and c.group_id in (select public.my_group_ids(false))
    )
  );
