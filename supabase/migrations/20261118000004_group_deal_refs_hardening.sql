-- Follow-up hardening for shared-deal links (automated review of 000002/000003).
-- 1. Updates may change sort_order (reordering) and shared_at (the owner re-sharing) only. The previous guard let shared_by be rewritten,
--    and "Sharer or owner can remove deal from group" trusts shared_by, so an Editor
--    could claim someone else's link and remove it.
-- 2. Links are deleted with their deal (they used to be left pointing at nothing).

create or replace function public.group_deal_refs_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) - 'sort_order' - 'shared_at') is distinct from (to_jsonb(old) - 'sort_order' - 'shared_at') then
    raise exception 'only the order of shared deals can be changed' using errcode = '42501';
  end if;
  return new;
end
$$;

delete from public.group_deal_refs r
where not exists (select 1 from public.deals d where d.deal_id = r.deal_id);

alter table public.group_deal_refs drop constraint if exists group_deal_refs_deal_id_fkey;
alter table public.group_deal_refs
  add constraint group_deal_refs_deal_id_fkey
  foreign key (deal_id) references public.deals(deal_id) on delete cascade;
