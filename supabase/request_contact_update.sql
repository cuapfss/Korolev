-- KOROLEV contact method update for project requests.
-- Run once in Supabase SQL Editor. Existing request records remain intact.

alter table public.project_requests
  add column if not exists contact_value text;

alter table public.project_requests
  alter column email drop not null;

create or replace function public.notify_admins_new_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare admin_record record;
declare contact_details text;
begin
  contact_details := coalesce(new.contact_value, new.email, 'контакт не указан');
  for admin_record in
    select id from public.profiles where role = 'admin'
  loop
    insert into public.notifications(user_id, channel, title, body)
    values (
      admin_record.id,
      'in_app',
      'Новая заявка KOROLEV',
      'Заявка от ' || new.name || '. Связь: ' ||
      coalesce(new.contact_method, 'Контакт') || ' — ' || contact_details ||
      '. Откройте личный кабинет → Мои заявки.'
    );
  end loop;
  return new;
end;
$$;
