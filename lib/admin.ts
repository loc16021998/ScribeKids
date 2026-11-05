import "server-only";
import { redirect } from "next/navigation";
import { getViewer, listStudentsWithStats, type StudentWithStats } from "./data";
import { createAdminClient, createClient } from "./supabase-server";

/**
 * Cổng vào mọi trang và hành động của khu admin. Vai trò đọc từ bảng profiles qua
 * RLS (không tin JWT cũ), nên phải gọi ở đầu từng trang/Server Action.
 */
export async function requireAdmin() {
  const viewer = await getViewer();
  if (!viewer) redirect("/dang-nhap");
  if (viewer.profile?.role !== "admin") redirect("/");
  return viewer;
}

export type ParentAccount = {
  id: string;
  fullName: string;
  email: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  studentCount: number;
};

/** Danh sách phụ huynh. Email nằm ở auth.users nên cần client quản trị. */
export async function listParents(): Promise<ParentAccount[]> {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: profiles }, { data: students }, emails] = await Promise.all([
    supabase.from("profiles").select("id, full_name, created_at").eq("role", "parent").order("created_at", { ascending: false }),
    supabase.from("students").select("owner_id"),
    listAuthUsers(),
  ]);
  return (profiles ?? []).map((p) => {
    const auth = emails.get(p.id);
    return {
      id: p.id,
      fullName: p.full_name?.trim() || "Chưa đặt tên",
      email: auth?.email ?? null,
      createdAt: p.created_at,
      lastSignInAt: auth?.lastSignInAt ?? null,
      studentCount: (students ?? []).filter((s) => s.owner_id === p.id).length,
    };
  });
}

export async function listAuthUsers() {
  const map = new Map<string, { email: string | null; lastSignInAt: string | null }>();
  const admin = createAdminClient();
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const u of data.users) {
      map.set(u.id, { email: u.email ?? null, lastSignInAt: u.last_sign_in_at ?? null });
    }
    if (data.users.length < 1000) return map;
  }
}

export type AdminStudent = StudentWithStats & { parentName: string };

export async function listAllStudents(): Promise<AdminStudent[]> {
  await requireAdmin();
  const supabase = await createClient();
  const [students, { data: profiles }] = await Promise.all([
    listStudentsWithStats(),
    supabase.from("profiles").select("id, full_name"),
  ]);
  const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name?.trim() || "Chưa đặt tên"]));
  return students.map((s) => ({ ...s, parentName: names.get(s.owner_id) ?? "—" }));
}

export type AdminSubmissionRow = {
  id: string;
  score: number | null;
  created_at: string;
  studentId: string;
  studentName: string;
  studentAvatar: string | null;
};

export const SUBMISSION_PAGE_SIZE = 50;

/** Bài nộp mới nhất của toàn trung tâm. `pendingOnly` lọc bài chưa chấm. */
export async function listAllSubmissions(pendingOnly = false): Promise<AdminSubmissionRow[]> {
  await requireAdmin();
  const supabase = await createClient();
  let query = supabase
    .from("submissions")
    .select("id, score, created_at, student_id")
    .order("created_at", { ascending: false })
    .limit(SUBMISSION_PAGE_SIZE);
  if (pendingOnly) query = query.is("score", null);
  const [{ data: subs }, { data: students }] = await Promise.all([
    query,
    supabase.from("students").select("id, name, avatar"),
  ]);
  const byId = new Map((students ?? []).map((s) => [s.id, s]));
  return (subs ?? []).map((s) => ({
    id: s.id,
    score: s.score == null ? null : Number(s.score),
    created_at: s.created_at,
    studentId: s.student_id,
    studentName: byId.get(s.student_id)?.name ?? "—",
    studentAvatar: byId.get(s.student_id)?.avatar ?? null,
  }));
}

/** Số liệu trang tổng quan. Đếm trực tiếp trên database để không phải tải toàn bộ bài. */
export async function getAdminOverview() {
  await requireAdmin();
  const supabase = await createClient();
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const count = (q: PromiseLike<{ count: number | null }>) => Promise.resolve(q).then((r) => r.count ?? 0);
  const [parents, students, submissions, pending, thisWeek, weekScores] = await Promise.all([
    count(supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "parent")),
    count(supabase.from("students").select("*", { count: "exact", head: true })),
    count(supabase.from("submissions").select("*", { count: "exact", head: true })),
    count(supabase.from("submissions").select("*", { count: "exact", head: true }).is("score", null)),
    count(supabase.from("submissions").select("*", { count: "exact", head: true }).gte("created_at", weekAgo)),
    supabase.from("submissions").select("score").gte("created_at", weekAgo).not("score", "is", null).limit(2000),
  ]);
  const scores = (weekScores.data ?? []).map((r) => Number(r.score));
  return {
    parents,
    students,
    submissions,
    pending,
    thisWeek,
    weekAverage: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
  };
}
