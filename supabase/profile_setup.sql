-- KOROLEV profile settings: run once in Supabase SQL Editor.
-- This adds profile avatar support. The bucket is public so avatar URLs can be displayed;
-- only the signed-in owner can upload, replace or delete files in their own folder.
alter table public.profiles add column if not exists avatar_url text;

-- Browser users may edit only their own safe profile fields. Role changes stay server-side.
drop policy if exists "profile update self basic fields" on public.profiles;
create policy "profile update own profile" on public.profiles for update to authenticated
using (id=auth.uid()) with check (id=auth.uid());
revoke update on public.profiles from authenticated;
grant update(display_name,avatar_url,updated_at) on public.profiles to authenticated;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('avatars','avatars',true,3145728,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=true,file_size_limit=3145728,allowed_mime_types=array['image/jpeg','image/png','image/webp'];

drop policy if exists "Avatar images are publicly readable" on storage.objects;
create policy "Avatar images are publicly readable" on storage.objects
for select using (bucket_id='avatars');

drop policy if exists "Users upload own avatar" on storage.objects;
create policy "Users upload own avatar" on storage.objects
for insert to authenticated
with check (bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text);

drop policy if exists "Users update own avatar" on storage.objects;
create policy "Users update own avatar" on storage.objects
for update to authenticated
using (bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text)
with check (bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text);

drop policy if exists "Users delete own avatar" on storage.objects;
create policy "Users delete own avatar" on storage.objects
for delete to authenticated
using (bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text);