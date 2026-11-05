-- =============================================================================
-- Vai trò admin (Trung Tâm THEDU): toàn quyền trên ứng dụng, tạo tài khoản phụ huynh.
-- =============================================================================

-- 1. Đổi tên vai trò. Các policy tham chiếu enum theo OID nên tự theo tên mới.
alter type public.user_role rename value 'teacher' to 'admin';

-- 2. Vai trò chỉ lấy từ raw_app_meta_data — vùng người dùng KHÔNG sửa được qua API.
--    user_metadata do chính người đăng ký gửi lên nên không bao giờ được tin để cấp quyền.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, role, full_name, avatar_url)
  values (
    new.id,
    case when new.raw_app_meta_data ->> 'role' = 'admin'
         then 'admin'::public.user_role
         else 'parent'::public.user_role end,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

-- 3. Hàm kiểm tra admin (security definer để không kích hoạt RLS của profiles).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  );
$$;

revoke execute on function public.is_admin() from public, anon;
grant  execute on function public.is_admin() to authenticated;

-- 4. Toàn quyền trên mọi bảng (policy được OR với các policy sẵn có).
create policy "admin_all_profiles" on public.profiles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin_all_students" on public.students
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin_all_guardians" on public.student_guardians
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin_all_submissions" on public.submissions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin_all_storage" on storage.objects
  for all to authenticated
  using (bucket_id in ('submissions', 'avatars') and public.is_admin())
  with check (bucket_id in ('submissions', 'avatars') and public.is_admin());

-- 5. Admin được đổi phụ huynh quản lý bé.
create or replace function public.protect_student_links()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.owner_id is distinct from old.owner_id
      or new.profile_id is distinct from old.profile_id)
     and current_user not in ('service_role', 'postgres', 'supabase_admin')
     and not public.is_admin() then
    raise exception 'Không được phép đổi chủ sở hữu hoặc tài khoản của học sinh';
  end if;
  return new;
end;
$$;

-- Vai trò vẫn không đổi được từ phía người dùng, kể cả admin (prevent_role_change giữ
-- nguyên): chỉ backend dùng service_role mới đổi được, tránh admin lỡ tự hạ quyền mình.
