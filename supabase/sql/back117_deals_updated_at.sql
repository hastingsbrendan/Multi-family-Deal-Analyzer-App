-- BACK-117 — the database stamps deals.updated_at on every insert and update.
-- updated_at is each deal row's version: the app only saves when the row is still at the
-- version it loaded (sbSaveDeal). Stamping it here means versions come from one clock
-- instead of each device's clock. The app keeps sending updated_at too, so saves work
-- with or without this trigger; this just makes the value authoritative.
-- clock_timestamp() (not now()) so rows written in one statement still get distinct values.

create or replace function public.deals_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end
$$;

drop trigger if exists deals_touch_updated_at on public.deals;
create trigger deals_touch_updated_at
  before insert or update on public.deals
  for each row execute function public.deals_touch_updated_at();
