-- KOROLEV admin dashboard table privileges.
-- Run in Supabase SQL Editor. Row-level security policies still restrict which rows admins/staff can access.

grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update on public.projects to authenticated;
grant select, insert on public.project_members to authenticated;
