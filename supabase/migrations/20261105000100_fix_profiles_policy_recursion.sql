-- =============================================================================
-- Cắt vòng lặp RLS: students (INSERT) → profiles (SELECT) → students.
-- Postgres báo "infinite recursion detected in policy for relation students".
-- Chính sách của profiles đọc students qua hàm security definer (không kích hoạt
-- RLS của students) thay vì truy vấn con trực tiếp.
-- =============================================================================

create or replace function public.manages_student_account(pid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.students s
    where s.profile_id = pid and public.can_manage_student(s.id)
  );
$$;

revoke execute on function public.manages_student_account(uuid) from public, anon;
grant  execute on function public.manages_student_account(uuid) to authenticated;

drop policy "profiles_select_own_or_managed_student" on public.profiles;
create policy "profiles_select_own_or_managed_student"
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or public.manages_student_account(id)
  );
