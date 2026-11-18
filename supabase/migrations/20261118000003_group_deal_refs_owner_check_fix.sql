-- Fix for 20261118000002: its INSERT policy read public.deals directly, and the deals
-- SELECT policy for shared deals reads group_deal_refs, so Postgres reported
-- "infinite recursion detected in policy" and every share failed. Ownership is now
-- checked by a SECURITY DEFINER helper that doesn't go through RLS (same pattern as
-- my_group_ids / my_group_role).

create or replace function public.owns_deal(p_deal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.deals d where d.deal_id = p_deal_id and d.user_id = auth.uid())
$$;

revoke all on function public.owns_deal(uuid) from public, anon;
grant execute on function public.owns_deal(uuid) to authenticated;

drop policy if exists refs_insert_deal_owner on public.group_deal_refs;
create policy refs_insert_deal_owner on public.group_deal_refs
  for insert to authenticated
  with check (
    owner_user_id = auth.uid()
    and shared_by = auth.uid()
    and public.owns_deal(deal_id)
    and public.my_group_role(group_id) in ('Owner', 'Editor')
  );
