-- M8 (2026-11) — clean-up that deleting an auth user doesn't cascade to on its own.
-- Called by the delete-account Edge Function (service role) BEFORE it deletes the user.
-- Deals, comments, memberships, profile and api_usage already cascade from auth.users.
--
--  1. Groups the user owns: ownership passes to the longest-standing active member;
--     a group with nobody else in it is deleted (its refs, comments and invites cascade).
--  2. Group links to the user's own deals are removed (those deals are being deleted).
--  3. Feedback the user sent (stored by email) is deleted.
-- Returns a small summary for the function's log.

create or replace function public.prepare_account_deletion(p_uid uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  g record;
  v_successor uuid;
  v_handed int := 0;
  v_deleted int := 0;
  v_refs int := 0;
  v_feedback int := 0;
begin
  if p_uid is null then
    raise exception 'p_uid is required' using errcode = '22023';
  end if;
  select email into v_email from auth.users where id = p_uid;

  for g in
    select m.group_id from public.group_members m
    where m.user_id = p_uid and m.role = 'Owner' and m.status = 'active'
  loop
    select m.user_id into v_successor
    from public.group_members m
    where m.group_id = g.group_id and m.user_id <> p_uid and m.status = 'active'
    order by m.created_at asc, m.id asc
    limit 1;

    if v_successor is not null then
      update public.group_members set role = 'Owner'
        where group_id = g.group_id and user_id = v_successor;
      update public.groups set created_by = v_successor where id = g.group_id;
      v_handed := v_handed + 1;
    else
      delete from public.groups where id = g.group_id;
      v_deleted := v_deleted + 1;
    end if;
  end loop;

  delete from public.group_deal_refs where owner_user_id = p_uid;
  get diagnostics v_refs = row_count;

  if v_email is not null then
    delete from public.feedback where lower(email) = lower(v_email);
    get diagnostics v_feedback = row_count;
  end if;

  return jsonb_build_object('groups_handed_over', v_handed, 'groups_deleted', v_deleted,
                            'deal_links_removed', v_refs, 'feedback_deleted', v_feedback);
end
$$;

revoke all on function public.prepare_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.prepare_account_deletion(uuid) to service_role;
