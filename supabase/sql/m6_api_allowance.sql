-- M6 (2026-11) — per-user daily allowance for paid third-party APIs (Rentcast).
-- The Cloudflare proxy calls use_api_allowance() with the caller's own session, so the
-- count is always for auth.uid(); users can't read or change the table directly.
-- Returns the number of calls used today INCLUDING this one; the proxy refuses the call
-- when that exceeds p_limit (the over-limit attempt isn't counted).

create table if not exists public.api_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind    text not null,
  day     date not null default (now() at time zone 'utc')::date,
  count   integer not null default 0,
  primary key (user_id, kind, day)
);

alter table public.api_usage enable row level security;
revoke all on public.api_usage from public, anon, authenticated;

create or replace function public.use_api_allowance(p_kind text, p_limit integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_used integer;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_kind is null or length(p_kind) > 40 or p_limit is null or p_limit < 1 then
    raise exception 'bad arguments' using errcode = '22023';
  end if;

  insert into public.api_usage as u (user_id, kind, day, count)
  values (v_uid, p_kind, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, kind, day)
  do update set count = u.count + 1
    where u.count < p_limit          -- stop counting once the limit is reached
  returning count into v_used;

  if v_used is null then             -- already at the limit: report over it
    return p_limit + 1;
  end if;
  return v_used;
end
$$;

revoke all on function public.use_api_allowance(text, integer) from public, anon;
grant execute on function public.use_api_allowance(text, integer) to authenticated;
