-- =============================================================================
-- Giới hạn 5 bài nộp mỗi ngày (giờ Việt Nam) cho mỗi bé. Admin và backend được miễn.
-- =============================================================================

-- Mốc 0 giờ hôm nay theo giờ Việt Nam.
create or replace function public.vn_today_start()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh';
$$;

-- Số bài còn được nộp hôm nay; NULL = không giới hạn (admin); 0 nếu không có quyền xem bé.
create or replace function public.submissions_left_today(sid uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.is_admin() then
    return null;
  end if;
  if not public.can_view_student(sid) then
    return 0;
  end if;
  return greatest(0, 5 - (
    select count(*)::integer from public.submissions s
    where s.student_id = sid and s.created_at >= public.vn_today_start()
  ));
end;
$$;

revoke execute on function public.submissions_left_today(uuid) from public, anon;
grant  execute on function public.submissions_left_today(uuid) to authenticated;

-- Trigger là lớp chặn thật: khoá theo từng bé để các request đồng thời không lọt qua.
create or replace function public.enforce_daily_submission_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or public.is_admin() then
    return new;
  end if;

  -- Không cho tự khai ngày nộp để né giới hạn.
  new.created_at := now();

  perform pg_advisory_xact_lock(hashtextextended(new.student_id::text, 0));
  if (
    select count(*) from public.submissions s
    where s.student_id = new.student_id and s.created_at >= public.vn_today_start()
  ) >= 5 then
    raise exception 'Hôm nay bé đã nộp đủ 5 bài. Ngày mai mình nộp tiếp nhé!';
  end if;
  return new;
end;
$$;

create trigger submissions_daily_limit
  before insert on public.submissions
  for each row execute function public.enforce_daily_submission_limit();

-- Hết lượt thì cũng không tải thêm ảnh lên được.
drop policy "submissions_storage_insert" on storage.objects;
create policy "submissions_storage_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'submissions'
    and public.can_view_student(public.storage_student_id(name))
    and public.submissions_left_today(public.storage_student_id(name)) > 0
  );
