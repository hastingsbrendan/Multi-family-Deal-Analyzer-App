-- BACK-121 — group Editors can save shared deals.
-- deals UPDATE is owner-only (RLS), so an Editor's edit to a deal someone else shared was
-- refused and the app swallowed the error. Rather than open UPDATE on deals to group
-- members, edits from group views go through this function, which:
--   • allows the deal's owner, or an active Owner/Editor of a group the deal is shared into
--     (Viewers, pending members and outsiders are refused)
--   • only writes deal_data — never user_id, so ownership can't move
--   • only saves on top of the version the caller loaded (updated_at, as in BACK-117);
--     otherwise returns the current copy as a conflict and writes nothing
-- Returns { status: 'saved', version } | { status: 'conflict', theirs, version }
-- (theirs/version null when the deal no longer exists).

create or replace function public.save_shared_deal(p_deal_id uuid, p_deal_data jsonb, p_expected timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_version timestamptz;
  v_theirs jsonb;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_deal_data is null or jsonb_typeof(p_deal_data) <> 'object' then
    raise exception 'deal_data must be a JSON object' using errcode = '22023';
  end if;

  select d.user_id into v_owner from public.deals d where d.deal_id = p_deal_id;
  if v_owner is null then
    return jsonb_build_object('status', 'conflict', 'theirs', null, 'version', null);
  end if;

  if v_owner <> v_uid and not exists (
    select 1
    from public.group_deal_refs r
    join public.group_members m on m.group_id = r.group_id
    where r.deal_id = p_deal_id
      and m.user_id = v_uid
      and m.status = 'active'
      and m.role in ('Owner', 'Editor')
  ) then
    raise exception 'not allowed to edit this deal' using errcode = '42501';
  end if;

  update public.deals
     set deal_data = p_deal_data, updated_at = clock_timestamp()
   where deal_id = p_deal_id and updated_at = p_expected
  returning updated_at into v_version;
  if found then
    return jsonb_build_object('status', 'saved', 'version', v_version);
  end if;

  select d.deal_data, d.updated_at into v_theirs, v_version from public.deals d where d.deal_id = p_deal_id;
  return jsonb_build_object('status', 'conflict', 'theirs', v_theirs, 'version', v_version);
end
$$;

revoke all on function public.save_shared_deal(uuid, jsonb, timestamptz) from public, anon;
grant execute on function public.save_shared_deal(uuid, jsonb, timestamptz) to authenticated;
