import "server-only";
import type { CriterionKey } from "./ai/standards";
import type { GradingResult } from "./ai/types";
import type { Profile, Student } from "./database.types";
import { activeStreak, average, dayKey } from "./score";
import { STORAGE_BUCKETS, isSupabaseConfigured } from "./supabase";
import { createClient } from "./supabase-server";

/**
 * Lớp truy cập dữ liệu (DAL). Mọi truy vấn chạy bằng client của NGƯỜI DÙNG nên RLS
 * tự lọc: phụ huynh/giáo viên chỉ thấy các bé mình quản lý.
 * Lưu ý: các hàm này đọc cookie → component gọi chúng phải nằm trong <Suspense>.
 */

export type ScorePoint = { id: string; score: number; created_at: string };

export type StudentWithStats = Student & {
  submissionCount: number;
  latestScore: number | null;
  latestAt: string | null;
  /** TB 3 bài gần nhất trừ TB 3 bài trước đó. */
  trend: number | null;
  streak: number;
  points: ScorePoint[]; // cũ → mới
};

export async function getViewer(): Promise<{ id: string; email: string | null; profile: Profile | null } | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", data.user.id).maybeSingle();
  return { id: data.user.id, email: data.user.email ?? null, profile };
}

export async function listStudentsWithStats(): Promise<StudentWithStats[]> {
  const supabase = await createClient();
  const { data: students } = await supabase
    .from("students")
    .select("*")
    .order("created_at", { ascending: true });
  if (!students?.length) return [];

  const { data: subs } = await supabase
    .from("submissions")
    .select("id, student_id, score, created_at")
    .in(
      "student_id",
      students.map((s) => s.id),
    )
    .order("created_at", { ascending: true })
    .limit(2000);

  const { data: streakRows } = await supabase
    .from("streaks")
    .select("*")
    .in(
      "student_id",
      students.map((s) => s.id),
    );

  return students.map((s) => {
    const mine = (subs ?? []).filter((x) => x.student_id === s.id);
    const points = mine
      .filter((x): x is typeof x & { score: number } => x.score != null)
      .map(({ id, score, created_at }) => ({ id, score: Number(score), created_at }));
    const latest = mine[mine.length - 1];
    return {
      ...s,
      submissionCount: mine.length,
      latestScore: points.length ? points[points.length - 1].score : null,
      latestAt: latest?.created_at ?? null,
      trend: trendOf(points.map((p) => p.score)),
      streak: activeStreak(streakRows?.find((r) => r.student_id === s.id)),
      points,
    };
  });
}

/** Số liệu tổng quan 7 ngày cho bảng tiến bộ. */
export function summarizeRecent(students: StudentWithStats[], now = Date.now()) {
  const weekAgo = now - 7 * 86_400_000;
  const thisWeek = students.flatMap((s) => s.points).filter((p) => Date.parse(p.created_at) >= weekAgo);
  const today = dayKey(new Date(now));
  return {
    weekCount: thisWeek.length,
    weekAverage: average(thisWeek.map((p) => p.score)),
    practicedToday: students.filter((s) => s.latestAt && dayKey(s.latestAt) === today).length,
  };
}

export type HistoryItem = {
  id: string;
  score: number | null;
  created_at: string;
  thumbUrl: string | null;
  feedback: string | null;
};

export type StudentDashboard = {
  student: StudentWithStats;
  history: HistoryItem[]; // mới → cũ
  /** TB từng tiêu chí: 3 bài đầu tiên so với 3 bài gần nhất. */
  criteria: { key: CriterionKey; first: number | null; recent: number | null }[];
  earnedBadges: string[];
  longestStreak: number;
  /** Mốc "bây giờ" (ms) lúc tải dữ liệu — để lọc 7/30 ngày mà không gọi Date.now() khi render. */
  now: number;
};

const HISTORY_LIMIT = 30;
const CRITERIA_KEYS: CriterionKey[] = ["size", "alignment", "slant", "spacing", "letter_form"];

export async function getStudentDashboard(studentId: string): Promise<StudentDashboard | null> {
  const supabase = await createClient();
  const { data: student } = await supabase.from("students").select("*").eq("id", studentId).maybeSingle();
  if (!student) return null;

  const { data: subs } = await supabase
    .from("submissions")
    .select("id, score, created_at, image_url, criteria:feedback_json->criteria, feedback:feedback_json->>encouraging_feedback")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false })
    .limit(400);

  const [{ data: streakRow }, { data: badgeRows }] = await Promise.all([
    supabase.from("streaks").select("*").eq("student_id", studentId).maybeSingle(),
    supabase.from("student_badges").select("badge_id").eq("student_id", studentId),
  ]);

  const rows = (subs ?? []) as unknown as {
    id: string;
    score: number | null;
    created_at: string;
    image_url: string;
    criteria: GradingResult["criteria"] | null;
    feedback: string | null;
  }[];

  const recentRows = rows.slice(0, HISTORY_LIMIT);
  const urls = await signPaths(recentRows.map((r) => r.image_url));

  const asc = [...rows].reverse();
  const points = asc
    .filter((r) => r.score != null)
    .map((r) => ({ id: r.id, score: Number(r.score), created_at: r.created_at }));

  const graded = asc.filter((r) => r.criteria);
  const first = graded.slice(0, 3);
  const recent = graded.slice(-3);
  const criteria = CRITERIA_KEYS.map((key) => {
    const pick = (list: typeof graded) =>
      average(list.map((r) => r.criteria![key]?.score).filter((v): v is number => typeof v === "number" && v >= 0));
    return { key, first: graded.length >= 4 ? pick(first) : null, recent: pick(recent) };
  });

  return {
    student: {
      ...student,
      submissionCount: rows.length,
      latestScore: points.length ? points[points.length - 1].score : null,
      latestAt: rows[0]?.created_at ?? null,
      trend: trendOf(points.map((p) => p.score)),
      streak: activeStreak(streakRow),
      points,
    },
    history: recentRows.map((r, i) => ({
      id: r.id,
      score: r.score == null ? null : Number(r.score),
      created_at: r.created_at,
      thumbUrl: urls[i],
      feedback: r.feedback,
    })),
    criteria,
    earnedBadges: (badgeRows ?? []).map((b) => b.badge_id),
    longestStreak: streakRow?.longest_streak ?? 0,
    now: Date.now(),
  };
}

export type SubmissionDetail = {
  id: string;
  created_at: string;
  score: number | null;
  result: GradingResult | null;
  imageUrl: string | null;
  originalUrl: string | null;
  student: Student;
  /** Huy hiệu mà chính bài này mang lại. */
  rewardBadges: string[];
  streak: number;
  /** Bài trước & sau của cùng bé, để lướt qua lại. */
  prevId: string | null;
  nextId: string | null;
};

export async function getSubmissionDetail(id: string): Promise<SubmissionDetail | null> {
  const supabase = await createClient();
  const { data: sub } = await supabase.from("submissions").select("*").eq("id", id).maybeSingle();
  if (!sub) return null;

  const [{ data: student }, { data: prev }, { data: next }, urls, { data: badgeRows }, { data: streakRow }] = await Promise.all([
    supabase.from("students").select("*").eq("id", sub.student_id).single(),
    supabase
      .from("submissions")
      .select("id")
      .eq("student_id", sub.student_id)
      .lt("created_at", sub.created_at)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("submissions")
      .select("id")
      .eq("student_id", sub.student_id)
      .gt("created_at", sub.created_at)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    signPaths([sub.image_url, sub.image_url.replace(/\.jpg$/i, "-original.jpg")]),
    supabase.from("student_badges").select("badge_id").eq("submission_id", sub.id),
    supabase.from("streaks").select("*").eq("student_id", sub.student_id).maybeSingle(),
  ]);
  if (!student) return null;

  return {
    id: sub.id,
    created_at: sub.created_at,
    score: sub.score == null ? null : Number(sub.score),
    result: (sub.feedback_json as unknown as GradingResult | null) ?? null,
    imageUrl: urls[0],
    originalUrl: urls[1],
    student,
    rewardBadges: (badgeRows ?? []).map((b) => b.badge_id),
    streak: activeStreak(streakRow),
    prevId: prev?.id ?? null,
    nextId: next?.id ?? null,
  };
}

/** Ký URL tạm (1 giờ) cho ảnh trong bucket riêng tư; RLS storage kiểm tra quyền xem. */
async function signPaths(paths: string[]): Promise<(string | null)[]> {
  if (!paths.length) return [];
  const supabase = await createClient();
  const { data } = await supabase.storage.from(STORAGE_BUCKETS.submissions).createSignedUrls(paths, 3600);
  return paths.map((p) => data?.find((d) => d.path === p && !d.error)?.signedUrl ?? null);
}

function trendOf(scores: number[]) {
  if (scores.length < 2) return null;
  const n = Math.min(3, Math.floor(scores.length / 2));
  const recent = average(scores.slice(-n))!;
  const before = average(scores.slice(-2 * n, -n))!;
  return Math.round(recent - before);
}
