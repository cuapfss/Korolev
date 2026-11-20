-- KOROLEV backend foundation for Supabase.
-- Apply in Supabase SQL Editor only after creating a project.
-- Never expose the service_role key in browser code.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text,
  role text not null default 'client' check (role in ('client','staff','admin')),
  two_factor_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  project_type text,
  location text,
  area_m2 numeric(10,2),
  status text not null default 'lead' check (status in ('lead','contract','brief','concept','planning','visualization','documentation','completed','archived')),
  progress_percent integer not null default 0 check (progress_percent between 0 and 100),
  currency text not null default 'RUB' check (currency in ('RUB','USD','EUR')),
  total_price numeric(14,2),
  start_date date,
  due_date date,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  access_role text not null default 'client' check (access_role in ('client','project_manager','designer','accountant','viewer')),
  added_at timestamptz not null default now(),
  primary key(project_id,user_id)
);

create table if not exists public.project_stages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'pending' check (status in ('pending','in_progress','review','completed','blocked')),
  progress_percent integer not null default 0 check (progress_percent between 0 and 100),
  sort_order integer not null default 0,
  planned_start date,
  planned_end date,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.project_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  sender_id uuid not null references public.profiles(id),
  body text not null,
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

create table if not exists public.project_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id),
  storage_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  category text not null default 'other' check (category in ('brief','reference','drawing','pdf','contract','invoice','act','proposal','other')),
  created_at timestamptz not null default now()
);

create table if not exists public.project_payments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  amount numeric(14,2) not null check (amount >= 0),
  currency text not null check (currency in ('RUB','USD','EUR')),
  payment_method text,
  payment_type text not null default 'manual' check (payment_type in ('manual','online')),
  provider_reference text,
  status text not null default 'pending' check (status in ('pending','paid','failed','refunded')),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.project_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  document_type text not null check (document_type in ('contract','invoice','act','proposal')),
  title text not null,
  storage_path text,
  version integer not null default 1,
  status text not null default 'draft' check (status in ('draft','sent','confirmed','signed','cancelled')),
  confirmed_by uuid references public.profiles(id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  channel text not null check (channel in ('email','telegram','in_app','web_push')),
  title text not null,
  body text not null,
  read_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.discount_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  percent_off numeric(5,2) check (percent_off > 0 and percent_off <= 100),
  fixed_amount numeric(14,2),
  currency text check (currency in ('RUB','USD','EUR')),
  valid_from timestamptz,
  valid_until timestamptz,
  max_uses integer,
  uses_count integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.personal_discounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  percent_off numeric(5,2) check (percent_off > 0 and percent_off <= 100),
  fixed_amount numeric(14,2),
  currency text check (currency in ('RUB','USD','EUR')),
  note text,
  valid_until timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists project_members_user_idx on public.project_members(user_id);
create index if not exists project_stages_project_idx on public.project_stages(project_id,sort_order);
create index if not exists project_messages_project_idx on public.project_messages(project_id,created_at);
create index if not exists project_files_project_idx on public.project_files(project_id,created_at);
create index if not exists payments_project_idx on public.project_payments(project_id,created_at);
create index if not exists notifications_user_idx on public.notifications(user_id,created_at desc);

-- Create a profile for each new authenticated user. New accounts are always clients;
-- promotion to staff/admin must be performed by a trusted administrator, never by the browser.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles(id,display_name,email,role)
  values(new.id, coalesce(new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'name'),new.email,'client')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.is_staff_or_admin()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists(select 1 from public.profiles p where p.id=auth.uid() and p.role in ('staff','admin'));
$$;

create or replace function public.is_project_member(target_project uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists(select 1 from public.project_members m where m.project_id=target_project and m.user_id=auth.uid());
$$;

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.project_stages enable row level security;
alter table public.project_messages enable row level security;
alter table public.project_files enable row level security;
alter table public.project_payments enable row level security;
alter table public.project_documents enable row level security;
alter table public.notifications enable row level security;
alter table public.discount_codes enable row level security;
alter table public.personal_discounts enable row level security;
alter table public.audit_log enable row level security;

create policy "profile read self or staff" on public.profiles for select
using (id=auth.uid() or public.is_staff_or_admin());
create policy "profile update self basic fields" on public.profiles for update
using (id=auth.uid()) with check (id=auth.uid() and role='client');

create policy "projects read member or staff" on public.projects for select
using (public.is_project_member(id) or public.is_staff_or_admin());
create policy "projects manage staff" on public.projects for all
using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());

create policy "members read self or staff" on public.project_members for select
using (user_id=auth.uid() or public.is_staff_or_admin());
create policy "members manage staff" on public.project_members for all
using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());

create policy "stages read project member" on public.project_stages for select
using (public.is_project_member(project_id) or public.is_staff_or_admin());
create policy "stages manage staff" on public.project_stages for all
using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());

create policy "messages read project member" on public.project_messages for select
using (public.is_project_member(project_id) or public.is_staff_or_admin());
create policy "messages send as self" on public.project_messages for insert
with check (sender_id=auth.uid() and public.is_project_member(project_id));
create policy "messages edit own or staff" on public.project_messages for update
using (sender_id=auth.uid() or public.is_staff_or_admin())
with check (sender_id=auth.uid() or public.is_staff_or_admin());

create policy "files read project member" on public.project_files for select
using (public.is_project_member(project_id) or public.is_staff_or_admin());
create policy "files add as member" on public.project_files for insert
with check (uploaded_by=auth.uid() and public.is_project_member(project_id));

create policy "payments read project member" on public.project_payments for select
using (public.is_project_member(project_id) or public.is_staff_or_admin());
create policy "payments manage staff" on public.project_payments for all
using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());

create policy "documents read project member" on public.project_documents for select
using (public.is_project_member(project_id) or public.is_staff_or_admin());
create policy "documents manage staff" on public.project_documents for all
using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());

create policy "notifications read own" on public.notifications for select using (user_id=auth.uid());
create policy "notifications update own" on public.notifications for update using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "discount codes active read" on public.discount_codes for select using (active=true or public.is_staff_or_admin());
create policy "discount codes manage staff" on public.discount_codes for all using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());
create policy "personal discounts read own or staff" on public.personal_discounts for select using (user_id=auth.uid() or public.is_staff_or_admin());
create policy "personal discounts manage staff" on public.personal_discounts for all using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());
create policy "audit log read admin" on public.audit_log for select using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'));
create policy "audit log insert staff" on public.audit_log for insert with check (actor_id=auth.uid() and public.is_staff_or_admin());

-- IMPORTANT:
-- 1. Configure Auth providers (Email, Google, Telegram via a trusted auth bridge) in Supabase.
-- 2. Create a private Storage bucket and add matching project-membership policies.
-- 3. Keep payment provider secrets and service_role keys server-side only.
-- 4. This schema does not itself implement payment checkout, PDF generation, email, push, bot messages,
--    scheduled backups, legal e-signatures, or the web UI. Those require trusted server functions
--    and external provider configuration. Never store bank-card numbers or CVV in this database.
