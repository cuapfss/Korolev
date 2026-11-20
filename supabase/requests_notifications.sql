-- KOROLEV client requests and in-app notifications.
-- Run once in Supabase SQL Editor as a NEW query. Does not modify existing tables destructively.

create table if not exists public.project_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  name text not null check (char_length(name) between 2 and 120),
  email text not null check (char_length(email) <= 254),
  contact_method text not null default 'Telegram' check (contact_method in ('Telegram','Email','Телефон','Phone')),
  project_type text not null check (char_length(project_type) between 2 and 160),
  area text,
  location text,
  services text,
  budget text,
  description text,
  references_url text,
  status text not null default 'new' check (status in ('new','reviewing','accepted','declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keep existing installations compatible with the public request form.
alter table public.project_requests add column if not exists contact_value text;
alter table public.project_requests alter column email drop not null;

create index if not exists project_requests_created_idx
  on public.project_requests(created_at desc);
create index if not exists project_requests_user_idx
  on public.project_requests(user_id);

alter table public.project_requests enable row level security;

drop policy if exists "Anyone can submit a project request" on public.project_requests;
create policy "Anyone can submit a project request"
on public.project_requests for insert to anon, authenticated
with check (user_id is null or user_id = auth.uid());

drop policy if exists "Staff can read project requests" on public.project_requests;
create policy "Staff can read project requests"
on public.project_requests for select to authenticated
using (public.is_staff_or_admin());

drop policy if exists "Staff can update project requests" on public.project_requests;
create policy "Staff can update project requests"
on public.project_requests for update to authenticated
using (public.is_staff_or_admin())
with check (public.is_staff_or_admin());

grant insert on public.project_requests to anon, authenticated;
grant select, update on public.project_requests to authenticated;

-- Notify administrators when a new request arrives.
create or replace function public.notify_admins_new_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare admin_record record;
begin
  for admin_record in
    select id from public.profiles where role = 'admin'
  loop
    insert into public.notifications(user_id, channel, title, body)
    values (
      admin_record.id,
      'in_app',
      'Новая заявка KOROLEV',
      'Заявка от ' || new.name || ' (' || new.email || '). Откройте панель управления.'
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists on_project_request_created on public.project_requests;
create trigger on_project_request_created
after insert on public.project_requests
for each row execute procedure public.notify_admins_new_request();

-- Notify a registered client when the studio changes the request status.
create or replace function public.notify_client_request_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare status_label text;
begin
  if new.status is distinct from old.status and new.user_id is not null then
    status_label := case new.status
      when 'reviewing' then 'Заявка взята в работу'
      when 'accepted' then 'Заявка принята'
      when 'declined' then 'По заявке требуется уточнение'
      else 'Статус заявки обновлён'
    end;
    insert into public.notifications(user_id, channel, title, body)
    values (new.user_id, 'in_app', status_label, 'Заявка KOROLEV: ' || new.project_type);
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists on_project_request_status_changed on public.project_requests;
create trigger on_project_request_status_changed
before update on public.project_requests
for each row execute procedure public.notify_client_request_status();
