-- Run this in Supabase SQL Editor after the owner account has registered.
-- It grants admin access only to the exact account email below.
update public.profiles
set role = 'admin', updated_at = now()
where lower(email) = lower('ivanankorolev@gmail.com');

-- Confirm that exactly one profile now has the admin role.
select id, display_name, email, role
from public.profiles
where lower(email) = lower('ivanankorolev@gmail.com');