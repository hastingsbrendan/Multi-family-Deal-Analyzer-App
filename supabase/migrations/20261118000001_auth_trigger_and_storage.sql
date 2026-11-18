-- Objects outside the public schema that the app relies on (captured 2026-11-18 from
-- production; the baseline dump covers public only, so Supabase's own auth/storage
-- internals aren't duplicated here).

-- New sign-ups get a profile and any pending email invites (public.handle_new_user)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Deal photos: public-read bucket, images only, 10 MB each, one folder per user
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('deal-photos', 'deal-photos', true, 10485760, array['image/*'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can upload own photos" on storage.objects;
create policy "Users can upload own photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'deal-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can read own photos" on storage.objects;
create policy "Users can read own photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'deal-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can delete own photos" on storage.objects;
create policy "Users can delete own photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'deal-photos' and (storage.foldername(name))[1] = auth.uid()::text);
