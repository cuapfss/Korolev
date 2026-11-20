-- KOROLEV portal storage and staff messaging permissions.
-- Run once in Supabase SQL Editor after requests_notifications.sql.

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values (
  'project-files','project-files',false,26214400,
  array['application/pdf','image/jpeg','image/png','image/webp','application/zip','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
on conflict (id) do update
set public=false,file_size_limit=26214400,allowed_mime_types=excluded.allowed_mime_types;

create or replace function public.can_access_project_file(file_path text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, storage
as $$
declare folder_name text;
begin
  folder_name := (storage.foldername(file_path))[1];
  if folder_name is null or folder_name !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return public.is_staff_or_admin()
    or public.is_project_member(folder_name::uuid);
end;
$$;

drop policy if exists "Project members read project files storage" on storage.objects;
create policy "Project members read project files storage"
on storage.objects for select to authenticated
using (bucket_id='project-files' and public.can_access_project_file(name));

drop policy if exists "Project members upload project files storage" on storage.objects;
create policy "Project members upload project files storage"
on storage.objects for insert to authenticated
with check (bucket_id='project-files' and public.can_access_project_file(name));

drop policy if exists "Project members update project files storage" on storage.objects;
create policy "Project members update project files storage"
on storage.objects for update to authenticated
using (bucket_id='project-files' and public.can_access_project_file(name))
with check (bucket_id='project-files' and public.can_access_project_file(name));

drop policy if exists "Project members delete project files storage" on storage.objects;
create policy "Project members delete project files storage"
on storage.objects for delete to authenticated
using (bucket_id='project-files' and public.can_access_project_file(name));

drop policy if exists "files add as member" on public.project_files;
create policy "files add as member or staff"
on public.project_files for insert to authenticated
with check (uploaded_by=auth.uid() and (public.is_project_member(project_id) or public.is_staff_or_admin()));

drop policy if exists "messages send as self" on public.project_messages;
create policy "messages send as self or staff"
on public.project_messages for insert to authenticated
with check (sender_id=auth.uid() and (public.is_project_member(project_id) or public.is_staff_or_admin()));

grant usage on schema public to authenticated;
grant select, insert on public.project_messages to authenticated;
grant select, insert on public.project_files to authenticated;
grant select on public.project_stages, public.project_documents, public.project_payments, public.notifications to authenticated;
grant update(read_at) on public.notifications to authenticated;

grant select, insert, update on public.projects to authenticated;
grant select, insert, update on public.project_stages to authenticated;
grant select, insert, update on public.project_documents to authenticated;
grant select, insert, update on public.project_payments to authenticated;

-- In-app notifications for project activity.
create or replace function public.notify_project_message()
returns trigger language plpgsql security definer set search_path = public
as $$
declare recipient record;
begin
  if public.is_staff_or_admin() then
    for recipient in
      select user_id from public.project_members
      where project_id=new.project_id and user_id<>new.sender_id
    loop
      insert into public.notifications(user_id,channel,title,body)
      values(recipient.user_id,'in_app','Новое сообщение по проекту',left(new.body,180));
    end loop;
  else
    for recipient in
      select id from public.profiles where role in ('admin','staff')
    loop
      insert into public.notifications(user_id,channel,title,body)
      values(recipient.id,'in_app','Сообщение от клиента','В проекте появилось новое сообщение.');
    end loop;
  end if;
  return new;
end;
$$;
drop trigger if exists on_project_message_notify on public.project_messages;
create trigger on_project_message_notify after insert on public.project_messages
for each row execute procedure public.notify_project_message();

create or replace function public.notify_project_update()
returns trigger language plpgsql security definer set search_path = public
as $$
declare recipient record; notification_title text; notification_body text;
begin
  notification_title := case tg_table_name
    when 'project_stages' then 'Обновлён этап проекта'
    when 'project_files' then 'Добавлен файл проекта'
    when 'project_documents' then 'Добавлен документ'
    when 'project_payments' then 'Обновлена информация об оплате'
    else 'Обновление проекта'
  end;
  notification_body := case tg_table_name
    when 'project_stages' then coalesce(new.title,'Этап проекта')
    when 'project_files' then coalesce(new.file_name,'Новый файл')
    when 'project_documents' then coalesce(new.title,'Новый документ')
    when 'project_payments' then 'Платёж: ' || coalesce(new.amount::text,'') || ' ' || coalesce(new.currency,'')
    else 'В проекте есть обновление.'
  end;
  for recipient in
    select user_id from public.project_members
    where project_id=new.project_id and user_id<>auth.uid()
  loop
    insert into public.notifications(user_id,channel,title,body)
    values(recipient.user_id,'in_app',notification_title,notification_body);
  end loop;
  return new;
end;
$$;
drop trigger if exists on_project_stage_notify on public.project_stages;
create trigger on_project_stage_notify after insert or update on public.project_stages
for each row execute procedure public.notify_project_update();
drop trigger if exists on_project_file_notify on public.project_files;
create trigger on_project_file_notify after insert on public.project_files
for each row execute procedure public.notify_project_update();
drop trigger if exists on_project_document_notify on public.project_documents;
create trigger on_project_document_notify after insert on public.project_documents
for each row execute procedure public.notify_project_update();
drop trigger if exists on_project_payment_notify on public.project_payments;
create trigger on_project_payment_notify after insert on public.project_payments
for each row execute procedure public.notify_project_update();
