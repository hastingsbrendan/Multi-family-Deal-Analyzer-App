-- BACK-109c — applied to production as Supabase migration
-- "back109_convert_email_invites_on_signup". Verify with
-- supabase/tests/back109_invite_signup.sql.
--
-- Invites sent to an email before the person had an account were stored in
-- group_invites_pending, but nothing ever read that table, so they never arrived. On
-- signup, turn them into pending memberships the new user can accept. The profile
-- insert is unchanged; the invite step can never block a signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;

  BEGIN
    INSERT INTO public.group_members (group_id, user_id, role, status, invited_by)
    SELECT gip.group_id, NEW.id, gip.role, 'pending', gip.invited_by
    FROM public.group_invites_pending gip
    WHERE lower(gip.invited_email) = lower(NEW.email)
    ON CONFLICT (group_id, user_id) DO NOTHING;

    DELETE FROM public.group_invites_pending
    WHERE lower(invited_email) = lower(NEW.email);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user: group invite conversion skipped for %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;
