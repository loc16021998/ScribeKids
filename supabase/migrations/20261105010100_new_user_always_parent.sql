-- =============================================================================
-- Mọi tài khoản mới đều là phụ huynh; chỉ backend (service_role) nâng lên admin.
-- GoTrue ghi app_metadata SAU khi chèn auth.users, nên trigger lúc tạo không đọc được
-- vai trò. Đọc vai trò ở đây là không đáng tin cậy, nên bỏ hẳn.
-- =============================================================================
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
    'parent'::public.user_role,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;
