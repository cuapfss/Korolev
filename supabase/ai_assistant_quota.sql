-- KOROLEV AI assistant quota protection.
-- Run once in Supabase SQL Editor. Limits: 8 requests/minute and 50 requests/day per signed-in user.
create table if not exists public.ai_usage_minute (
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket timestamptz not null,
  request_count integer not null default 0,
  primary key (user_id, bucket)
);
create table if not exists public.ai_usage_daily (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  request_count integer not null default 0,
  primary key (user_id, day)
);
alter table public.ai_usage_minute enable row level security;
alter table public.ai_usage_daily enable row level security;
revoke all on public.ai_usage_minute, public.ai_usage_daily from anon, authenticated;

create or replace function public.consume_ai_quota()
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
  minute_count integer;
  day_count integer;
  current_bucket timestamptz := date_trunc('minute', now());
  current_day date := (now() at time zone 'UTC')::date;
begin
  if uid is null then return false; end if;

  insert into public.ai_usage_minute(user_id, bucket, request_count)
  values (uid, current_bucket, 1)
  on conflict (user_id, bucket)
  do update set request_count = public.ai_usage_minute.request_count + 1
  returning request_count into minute_count;

  if minute_count > 8 then return false; end if;

  insert into public.ai_usage_daily(user_id, day, request_count)
  values (uid, current_day, 1)
  on conflict (user_id, day)
  do update set request_count = public.ai_usage_daily.request_count + 1
  returning request_count into day_count;

  if day_count > 50 then return false; end if;
  return true;
end;
$$;

revoke all on function public.consume_ai_quota() from public, anon;
grant execute on function public.consume_ai_quota() to authenticated;
