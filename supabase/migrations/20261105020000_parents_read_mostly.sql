-- =============================================================================
-- Phụ huynh chỉ xem và nộp bài cho con; mọi quản lý thuộc về admin (admin_all_*).
-- Phụ huynh còn: SELECT trên phạm vi của mình, INSERT bài nộp + ảnh bài nộp.
-- =============================================================================

-- Hồ sơ bé: chỉ admin thêm/sửa/xoá.
drop policy "students_insert_by_adults"   on public.students;
drop policy "students_update_by_managers" on public.students;
drop policy "students_delete_by_owner"    on public.students;

-- Chia sẻ bé: chỉ admin.
drop policy "guardians_insert_by_owner"         on public.student_guardians;
drop policy "guardians_delete_by_owner_or_self" on public.student_guardians;

-- Bài nộp và ảnh bài nộp: phụ huynh không xoá được.
drop policy "submissions_delete_by_managers" on public.submissions;
drop policy "submissions_storage_delete"     on storage.objects;

-- Hồ sơ tài khoản: admin đổi tên giúp.
drop policy "profiles_update_own" on public.profiles;

-- Bucket avatars công khai: giao diện không dùng, không để phụ huynh tải file lên.
drop policy "avatars_storage_insert_own" on storage.objects;
drop policy "avatars_storage_update_own" on storage.objects;
drop policy "avatars_storage_delete_own" on storage.objects;
