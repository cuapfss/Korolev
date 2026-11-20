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
