-- Security fix (2026-11-18, found by automated review of the baseline schema).
-- An active Owner/Editor of ANY group could add a group_deal_refs row pointing at ANY
-- deal_id, including someone else's. Because shared deals are readable by, and (via
-- save_shared_deal) editable by, the group's members, a person who had once seen a
-- deal's id (e.g. as a Viewer elsewhere) could link it into their own group and edit
-- it. No such rows existed when this was fixed.
--
-- Now: only the deal's owner can link it, into a group where they are an active
-- Owner/Editor, recorded as themselves; and a link can't be re-pointed to another deal,
-- group or owner afterwards (reordering still works).

drop policy if exists "Editors can manage refs" on public.group_deal_refs;
drop policy if exists "Owners and editors can share deals" on public.group_deal_refs;
drop policy if exists refs_insert_deal_owner on public.group_deal_refs;

create policy refs_insert_deal_owner on public.group_deal_refs
  for insert to authenticated
  with check (
    owner_user_id = auth.uid()
    and shared_by = auth.uid()
    and exists (select 1 from public.deals d where d.deal_id = group_deal_refs.deal_id and d.user_id = auth.uid())
    and public.my_group_role(group_id) in ('Owner', 'Editor')
  );

-- The existing UPDATE policy decides WHO may update (used for reordering); this
-- trigger decides WHAT may change.
create or replace function public.group_deal_refs_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.deal_id <> old.deal_id or new.group_id <> old.group_id or new.owner_user_id <> old.owner_user_id then
    raise exception 'a shared deal link cannot be moved to another deal, group or owner' using errcode = '42501';
  end if;
  return new;
end
$$;

drop trigger if exists group_deal_refs_guard on public.group_deal_refs;
create trigger group_deal_refs_guard
  before update on public.group_deal_refs
  for each row execute function public.group_deal_refs_guard();
