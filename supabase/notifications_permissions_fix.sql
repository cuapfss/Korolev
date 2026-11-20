-- KOROLEV: fix notification table privileges without opening access to other users' rows.
-- Run once in Supabase SQL Editor as a new query.

alter table public.notifications enable row level security;

-- The portal only reads notifications belonging to the signed-in account.
drop policy if exists "notifications read own" on public.notifications;
create policy "notifications read own"
on public.notifications
for select
to authenticated
using (user_id = (select auth.uid()));

-- The portal can only mark its own notifications as read.
drop policy if exists "notifications update own" on public.notifications;
create policy "notifications update own"
on public.notifications
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

grant usage on schema public to authenticated;
grant select on table public.notifications to authenticated;
grant update (read_at) on table public.notifications to authenticated;

-- No INSERT, DELETE, anon, or service-role privileges are granted here.
-- Notification creation remains handled by the existing SECURITY DEFINER triggers.
