-- =============================================================================
-- ScribeKids — Khởi tạo schema: profiles, students, submissions + RLS + Storage
-- =============================================================================
-- Mô hình phân quyền:
--   * profiles      : 1-1 với auth.users. Vai trò: parent | teacher | student.
--   * students      : hồ sơ bé (5–8 tuổi). Người tạo (owner) là phụ huynh/giáo viên.
--                     Nếu bé có tài khoản riêng, students.profile_id trỏ tới profile đó.
--   * student_guardians : bảng nối cho phép nhiều người lớn (bố, mẹ, cô giáo…)
--                     cùng theo dõi một bé.
--   * submissions   : bài viết tay đã nộp. Điểm & nhận xét AI được ghi bởi
--                     backend dùng service_role (bỏ qua RLS).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Kiểu dữ liệu & tiện ích
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('parent', 'teacher', 'student');
create type public.guardian_role as enum ('parent', 'teacher');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  role        public.user_role not null default 'parent',
  full_name   text check (char_length(full_name) <= 100),
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is 'Người dùng: phụ huynh, giáo viên hoặc học sinh (1-1 với auth.users).';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Tự tạo profile khi đăng ký. Vai trò lấy từ metadata lúc sign up,
-- chỉ chấp nhận parent/teacher; tài khoản student do người lớn cấp qua backend.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_role text := new.raw_user_meta_data ->> 'role';
begin
  insert into public.profiles (id, role, full_name, avatar_url)
  values (
    new.id,
    case when requested_role in ('parent', 'teacher')
         then requested_role::public.user_role
         else 'parent'::public.user_role end,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Chặn người dùng tự đổi vai trò của mình (chỉ service_role mới được đổi).
create or replace function public.prevent_role_change()
returns trigger
language plpgsql
as $$
begin
  if new.role is distinct from old.role
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Không được phép thay đổi vai trò người dùng';
  end if;
  return new;
end;
$$;

create trigger profiles_prevent_role_change
  before update on public.profiles
  for each row execute function public.prevent_role_change();

-- ---------------------------------------------------------------------------
-- 2. students
-- ---------------------------------------------------------------------------
create table public.students (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(trim(name)) between 1 and 60),
  age         smallint not null check (age between 5 and 8),
  avatar      text,                                   -- URL ảnh hoặc mã avatar dựng sẵn
  owner_id    uuid not null default auth.uid()
              references public.profiles (id) on delete cascade,
  profile_id  uuid unique references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.students is 'Hồ sơ học sinh 5–8 tuổi.';
comment on column public.students.profile_id is 'Tài khoản đăng nhập riêng của bé (nếu có).';

create index students_owner_id_idx on public.students (owner_id);

create trigger students_set_updated_at
  before update on public.students
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. student_guardians (người lớn được chia sẻ quyền theo dõi bé)
-- ---------------------------------------------------------------------------
create table public.student_guardians (
  student_id  uuid not null references public.students (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  role        public.guardian_role not null,
  created_at  timestamptz not null default now(),
  primary key (student_id, profile_id)
);

create index student_guardians_profile_id_idx on public.student_guardians (profile_id);

-- ---------------------------------------------------------------------------
-- 4. submissions
-- ---------------------------------------------------------------------------
create table public.submissions (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references public.students (id) on delete cascade,
  image_url      text not null,                       -- đường dẫn trong bucket "submissions"
  score          numeric(5, 2) check (score between 0 and 100),  -- null = đang chấm
  feedback_json  jsonb,
  submitted_by   uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now()
);

comment on table public.submissions is 'Bài viết tay đã nộp; score/feedback_json do AI chấm (service_role).';

create index submissions_student_created_idx
  on public.submissions (student_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 5. Hàm phân quyền (security definer để tránh đệ quy RLS)
-- ---------------------------------------------------------------------------
-- Người dùng hiện tại có QUẢN LÝ được bé không? (chủ sở hữu hoặc guardian)
create or replace function public.can_manage_student(sid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.students s
    where s.id = sid and s.owner_id = (select auth.uid())
  ) or exists (
    select 1 from public.student_guardians g
    where g.student_id = sid and g.profile_id = (select auth.uid())
  );
$$;

-- Người dùng hiện tại có XEM được bé không? (người quản lý hoặc chính bé)
create or replace function public.can_view_student(sid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_manage_student(sid) or exists (
    select 1 from public.students s
    where s.id = sid and s.profile_id = (select auth.uid())
  );
$$;

revoke execute on function public.can_manage_student(uuid) from public, anon;
revoke execute on function public.can_view_student(uuid)   from public, anon;
grant  execute on function public.can_manage_student(uuid) to authenticated;
grant  execute on function public.can_view_student(uuid)   to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.students          enable row level security;
alter table public.student_guardians enable row level security;
alter table public.submissions       enable row level security;

-- profiles: xem/sửa hồ sơ của chính mình; người lớn xem được profile tài khoản bé mình quản lý.
create policy "profiles_select_own_or_managed_student"
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1 from public.students s
      where s.profile_id = profiles.id and public.can_manage_student(s.id)
    )
  );

create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- students
create policy "students_select_viewable"
  on public.students for select to authenticated
  using (public.can_view_student(id));

create policy "students_insert_by_adults"
  on public.students for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role in ('parent', 'teacher')
    )
  );

create policy "students_update_by_managers"
  on public.students for update to authenticated
  using (public.can_manage_student(id))
  with check (public.can_manage_student(id));

create policy "students_delete_by_owner"
  on public.students for delete to authenticated
  using (owner_id = (select auth.uid()));

-- student_guardians: chủ sở hữu bé thêm/xoá người theo dõi; guardian thấy dòng của mình.
create policy "guardians_select"
  on public.student_guardians for select to authenticated
  using (
    profile_id = (select auth.uid())
    or exists (select 1 from public.students s
               where s.id = student_id and s.owner_id = (select auth.uid()))
  );

create policy "guardians_insert_by_owner"
  on public.student_guardians for insert to authenticated
  with check (
    exists (select 1 from public.students s
            where s.id = student_id and s.owner_id = (select auth.uid()))
  );

create policy "guardians_delete_by_owner_or_self"
  on public.student_guardians for delete to authenticated
  using (
    profile_id = (select auth.uid())
    or exists (select 1 from public.students s
               where s.id = student_id and s.owner_id = (select auth.uid()))
  );

-- submissions: ai xem được bé thì xem/nộp bài cho bé.
-- Không có policy UPDATE cho người dùng: điểm & nhận xét chỉ do backend (service_role) ghi.
create policy "submissions_select_viewable"
  on public.submissions for select to authenticated
  using (public.can_view_student(student_id));

create policy "submissions_insert_viewable"
  on public.submissions for insert to authenticated
  with check (
    public.can_view_student(student_id)
    and submitted_by = (select auth.uid())
    and score is null
    and feedback_json is null
  );

create policy "submissions_delete_by_managers"
  on public.submissions for delete to authenticated
  using (public.can_manage_student(student_id));

-- ---------------------------------------------------------------------------
-- 7. Storage
-- ---------------------------------------------------------------------------
-- "submissions": riêng tư, quy ước đường dẫn  {student_id}/{file}.jpg
-- "avatars"    : công khai để hiển thị, quy ước  {auth.uid()}/{file}.png
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('submissions', 'submissions', false, 10485760,
   array['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  ('avatars', 'avatars', true, 2097152,
   array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create or replace function public.storage_student_id(object_name text)
returns uuid
language plpgsql
immutable
as $$
begin
  return (storage.foldername(object_name))[1]::uuid;
exception when others then
  return null;
end;
$$;

create policy "submissions_storage_select"
  on storage.objects for select to authenticated
  using (bucket_id = 'submissions'
         and public.can_view_student(public.storage_student_id(name)));

create policy "submissions_storage_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'submissions'
              and public.can_view_student(public.storage_student_id(name)));

create policy "submissions_storage_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'submissions'
         and public.can_manage_student(public.storage_student_id(name)));

create policy "avatars_storage_insert_own"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars'
              and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatars_storage_update_own"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars'
         and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatars_storage_delete_own"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars'
         and (storage.foldername(name))[1] = (select auth.uid())::text);
