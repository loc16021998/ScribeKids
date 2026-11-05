-- =============================================================================
-- Gamification: chuỗi ngày luyện tập và huy hiệu của từng bé.
-- Chỉ trigger ghi vào hai bảng này (phụ huynh chỉ đọc), nên không tự cấp được.
-- Danh mục hiển thị của huy hiệu nằm ở lib/gamification/badges.ts — id phải khớp.
-- =============================================================================

create table public.streaks (
  student_id         uuid primary key references public.students (id) on delete cascade,
  current_streak     integer not null default 0,   -- độ dài chuỗi kết thúc ở last_practice_date
  longest_streak     integer not null default 0,
  last_practice_date date,                         -- theo giờ Việt Nam
  updated_at         timestamptz not null default now()
);

comment on column public.streaks.current_streak is
  'Chuỗi tính tới last_practice_date. Khi đọc: nếu ngày đó cũ hơn hôm qua thì chuỗi hiện tại là 0.';

create table public.student_badges (
  student_id    uuid not null references public.students (id) on delete cascade,
  badge_id      text not null,
  earned_at     timestamptz not null default now(),
  -- Bài đã mang lại huy hiệu; dùng để hiện đúng phần thưởng của bài đó.
  submission_id uuid references public.submissions (id) on delete set null,
  primary key (student_id, badge_id)
);

create index student_badges_submission_idx on public.student_badges (submission_id);

alter table public.streaks        enable row level security;
alter table public.student_badges enable row level security;

create policy "streaks_select_viewable" on public.streaks
  for select to authenticated using (public.can_view_student(student_id));
create policy "student_badges_select_viewable" on public.student_badges
  for select to authenticated using (public.can_view_student(student_id));
create policy "admin_all_streaks" on public.streaks
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin_all_student_badges" on public.student_badges
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Tính lại từ bài nộp thật (mỗi ngày có bài là một mắt xích), nên xoá bài cũng đúng.
create or replace function public.refresh_student_streak(sid uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  latest_len  integer := 0;
  longest_len integer := 0;
  latest_day  date;
begin
  with days as (
    select distinct (s.created_at at time zone 'Asia/Ho_Chi_Minh')::date as d
    from public.submissions s where s.student_id = sid
  ), grouped as (
    select d, d - (row_number() over (order by d))::integer as grp from days
  ), runs as (
    select max(d) as last_day, count(*)::integer as len from grouped group by grp
  )
  select
    coalesce((select len from runs order by last_day desc limit 1), 0),
    coalesce((select max(len) from runs), 0),
    (select max(last_day) from runs)
  into latest_len, longest_len, latest_day;

  -- SELECT từ students: khi bé đang bị xoá (cascade) thì không tạo lại dòng nào.
  insert into public.streaks (student_id, current_streak, longest_streak, last_practice_date, updated_at)
  select st.id, latest_len, longest_len, latest_day, now()
  from public.students st where st.id = sid
  on conflict (student_id) do update set
    current_streak = excluded.current_streak,
    longest_streak = excluded.longest_streak,
    last_practice_date = excluded.last_practice_date,
    updated_at = now();

  return latest_len;
end;
$$;

create or replace function public.grant_badge(sid uuid, badge text, sub uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.student_badges (student_id, badge_id, submission_id)
  values (sid, badge, sub)
  on conflict (student_id, badge_id) do nothing;
$$;

-- Khi nộp bài / xoá bài: cập nhật chuỗi; khi nộp: xét huy hiệu chăm chỉ.
create or replace function public.on_submission_saved()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  streak_len integer;
  total      integer;
begin
  if tg_op = 'DELETE' then
    perform public.refresh_student_streak(old.student_id);
    return old;
  end if;

  streak_len := public.refresh_student_streak(new.student_id);
  select count(*) into total from public.submissions s where s.student_id = new.student_id;

  perform public.grant_badge(new.student_id, 'first_submission', new.id);
  if streak_len >= 3  then perform public.grant_badge(new.student_id, 'streak_3', new.id);  end if;
  if streak_len >= 5  then perform public.grant_badge(new.student_id, 'streak_5', new.id);  end if;
  if streak_len >= 10 then perform public.grant_badge(new.student_id, 'streak_10', new.id); end if;
  if total >= 10 then perform public.grant_badge(new.student_id, 'submissions_10', new.id); end if;
  if total >= 30 then perform public.grant_badge(new.student_id, 'submissions_30', new.id); end if;
  return new;
end;
$$;

create trigger submissions_after_change
  after insert or delete on public.submissions
  for each row execute function public.on_submission_saved();

-- Khi có điểm (AI chấm hoặc admin sửa tay): xét huy hiệu theo điểm.
create or replace function public.on_submission_scored()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_score numeric;
  golden_count   integer;
begin
  if new.score is null or new.score is not distinct from old.score then
    return new;
  end if;

  if new.score >= 90 then perform public.grant_badge(new.student_id, 'golden_pen', new.id);  end if;
  if new.score >= 98 then perform public.grant_badge(new.student_id, 'diamond_pen', new.id); end if;

  select count(*) into golden_count from public.submissions s
  where s.student_id = new.student_id and s.score >= 90;
  if golden_count >= 3 then perform public.grant_badge(new.student_id, 'golden_trio', new.id); end if;

  -- Tiến bộ: hơn bài đã chấm liền trước ít nhất 10 điểm.
  select s.score into previous_score from public.submissions s
  where s.student_id = new.student_id and s.id <> new.id
    and s.score is not null and s.created_at < new.created_at
  order by s.created_at desc limit 1;
  if previous_score is not null and new.score >= previous_score + 10 then
    perform public.grant_badge(new.student_id, 'big_improver', new.id);
  end if;

  return new;
end;
$$;

create trigger submissions_after_score
  after update of score on public.submissions
  for each row execute function public.on_submission_scored();

-- Chỉ trigger được gọi các hàm này: chặn gọi trực tiếp qua API để tự cấp huy hiệu.
revoke execute on function public.refresh_student_streak(uuid)    from public, anon, authenticated;
revoke execute on function public.grant_badge(uuid, text, uuid)   from public, anon, authenticated;

-- Dữ liệu sẵn có: tính chuỗi cho các bé hiện tại.
select public.refresh_student_streak(id) from public.students;
