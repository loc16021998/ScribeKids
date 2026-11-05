-- =============================================================================
-- Sửa RLS bảng students, phát hiện khi kiểm thử trên database thật.
-- =============================================================================

-- 1. INSERT ... RETURNING bị từ chối: can_view_student() là hàm STABLE nên đọc theo
--    ảnh chụp từ trước câu lệnh và không thấy dòng vừa chèn. So sánh trực tiếp với
--    cột của dòng trước, chỉ gọi hàm cho trường hợp guardian.
drop policy "students_select_viewable" on public.students;
create policy "students_select_viewable"
  on public.students for select to authenticated
  using (
    owner_id = (select auth.uid())
    or profile_id = (select auth.uid())
    or public.can_view_student(id)
  );

-- 2. Hồ sơ mới không được tự gán tài khoản của người khác vào bé.
drop policy "students_insert_by_adults" on public.students;
create policy "students_insert_by_adults"
  on public.students for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and profile_id is null
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role in ('parent', 'teacher')
    )
  );

-- 3. Người được chia sẻ có quyền sửa tên/tuổi/avatar của bé, nhưng không được chiếm
--    quyền sở hữu (owner_id) hay gán tài khoản đăng nhập cho bé (profile_id):
--    gán profile_id cho phép người gán đọc profile của tài khoản đó.
--    Hai cột này chỉ backend (service_role) hoặc quản trị database được đổi.
create or replace function public.protect_student_links()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.owner_id is distinct from old.owner_id
      or new.profile_id is distinct from old.profile_id)
     and current_user not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception 'Không được phép đổi chủ sở hữu hoặc tài khoản của học sinh';
  end if;
  return new;
end;
$$;

create trigger students_protect_links
  before update on public.students
  for each row execute function public.protect_student_links();
