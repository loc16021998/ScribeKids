"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import type { Json } from "@/lib/database.types";
import { AVATARS } from "@/lib/score";
import { STORAGE_BUCKETS } from "@/lib/supabase";
import { createAdminClient, createClient } from "@/lib/supabase-server";

export type ActionState = { error?: string; ok?: string } | undefined;

/** Thông tin đăng nhập chỉ trả về đúng một lần, ngay sau khi tạo hoặc đặt lại. */
export type CredentialState =
  | { error?: string; credentials?: { name: string; email: string; password: string }; parentId?: string }
  | undefined;

/** Mật khẩu dễ đọc qua điện thoại: không có ký tự dễ nhầm (0/O, 1/l/I). */
function generatePassword() {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 10 }, () => alphabet[randomInt(alphabet.length)]).join("");
}

export async function adminSignOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/dang-nhap");
}

// ---------------------------------------------------------------- Phụ huynh

const ParentInput = z.object({
  full_name: z.string().trim().min(1, "Bạn nhập họ tên phụ huynh nhé").max(100, "Tên hơi dài"),
  email: z.email("Email chưa đúng").transform((v) => v.toLowerCase()),
  password: z.union([z.literal(""), z.string().min(6, "Mật khẩu cần ít nhất 6 ký tự").max(72, "Mật khẩu quá dài")]),
});

export async function createParent(_prev: CredentialState, formData: FormData): Promise<CredentialState> {
  await requireAdmin();
  const parsed = ParentInput.safeParse({
    full_name: formData.get("full_name"),
    email: String(formData.get("email") ?? "").trim(),
    password: formData.get("password") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Thông tin chưa hợp lệ" };

  const { full_name, email } = parsed.data;
  const password = parsed.data.password || generatePassword();
  const { data, error } = await createAdminClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: "parent" },
    user_metadata: { full_name },
  });
  if (error || !data.user) {
    return {
      error: /already|registered|exists/i.test(error?.message ?? "")
        ? "Email này đã có tài khoản."
        : "Chưa tạo được tài khoản, bạn thử lại nhé.",
    };
  }
  revalidatePath("/admin", "layout");
  return { credentials: { name: full_name, email, password }, parentId: data.user.id };
}

/** Chỉ thao tác trên tài khoản phụ huynh, không bao giờ chạm tới tài khoản admin. */
async function loadParent(id: string) {
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("id, full_name, role").eq("id", parsed.data).maybeSingle();
  return data?.role === "parent" ? data : null;
}

export async function resetParentPassword(_prev: CredentialState, formData: FormData): Promise<CredentialState> {
  await requireAdmin();
  const parent = await loadParent(String(formData.get("parent_id")));
  if (!parent) return { error: "Không tìm thấy phụ huynh." };
  const admin = createAdminClient();
  const { data: found } = await admin.auth.admin.getUserById(parent.id);
  const password = generatePassword();
  const { error } = await admin.auth.admin.updateUserById(parent.id, { password });
  if (error) return { error: "Chưa đặt lại được mật khẩu, bạn thử lại nhé." };
  return {
    credentials: { name: parent.full_name ?? "Phụ huynh", email: found.user?.email ?? "", password },
    parentId: parent.id,
  };
}

const ParentUpdate = z.object({
  parent_id: z.uuid(),
  full_name: z.string().trim().min(1, "Bạn nhập họ tên nhé").max(100, "Tên hơi dài"),
});

export async function updateParent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = ParentUpdate.safeParse({ parent_id: formData.get("parent_id"), full_name: formData.get("full_name") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Thông tin chưa hợp lệ" };
  const parent = await loadParent(parsed.data.parent_id);
  if (!parent) return { error: "Không tìm thấy phụ huynh." };
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ full_name: parsed.data.full_name }).eq("id", parent.id);
  if (error) return { error: "Chưa lưu được, bạn thử lại nhé." };
  revalidatePath("/admin", "layout");
  return { ok: "Đã lưu" };
}

export async function deleteParent(formData: FormData) {
  await requireAdmin();
  const parent = await loadParent(String(formData.get("parent_id")));
  if (!parent) return;
  const supabase = await createClient();
  const { data: students } = await supabase.from("students").select("id").eq("owner_id", parent.id);
  // Ảnh phải xoá trước: database cascade không dọn được file trong Storage.
  await removeStudentFiles((students ?? []).map((s) => s.id));
  const { error } = await createAdminClient().auth.admin.deleteUser(parent.id);
  if (error) throw new Error("Chưa xoá được tài khoản");
  revalidatePath("/admin", "layout");
  redirect("/admin/phu-huynh");
}

// ---------------------------------------------------------------- Học sinh

const StudentInput = z.object({
  name: z.string().trim().min(1, "Bạn nhập tên bé nhé").max(60, "Tên hơi dài"),
  age: z.coerce.number().int().min(5, "Bé từ 5 đến 8 tuổi").max(8, "Bé từ 5 đến 8 tuổi"),
  avatar: z.enum(AVATARS),
  owner_id: z.uuid("Bạn chọn phụ huynh của bé nhé"),
});

const readStudent = (formData: FormData) =>
  StudentInput.safeParse({
    name: formData.get("name"),
    age: formData.get("age"),
    avatar: formData.get("avatar"),
    owner_id: formData.get("owner_id"),
  });

export async function adminCreateStudent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = readStudent(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Thông tin chưa hợp lệ" };
  if (!(await loadParent(parsed.data.owner_id))) return { error: "Không tìm thấy phụ huynh." };
  const supabase = await createClient();
  const { name, age, avatar, owner_id } = parsed.data;
  const { data, error } = await supabase
    .from("students")
    .insert({ name, age, owner_id, avatar: `emoji:${avatar}` })
    .select("id")
    .single();
  if (error || !data) return { error: "Chưa thêm được bé, bạn thử lại nhé." };
  revalidatePath("/admin", "layout");
  redirect(`/admin/hoc-sinh/${data.id}`);
}

export async function adminUpdateStudent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = z.uuid().safeParse(formData.get("student_id"));
  const parsed = readStudent(formData);
  if (!id.success) return { error: "Không tìm thấy bé." };
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Thông tin chưa hợp lệ" };
  if (!(await loadParent(parsed.data.owner_id))) return { error: "Không tìm thấy phụ huynh." };
  const supabase = await createClient();
  const { name, age, avatar, owner_id } = parsed.data;
  const { error } = await supabase
    .from("students")
    .update({ name, age, owner_id, avatar: `emoji:${avatar}` })
    .eq("id", id.data);
  if (error) return { error: "Chưa lưu được, bạn thử lại nhé." };
  revalidatePath("/admin", "layout");
  return { ok: "Đã lưu" };
}

export async function adminDeleteStudent(formData: FormData) {
  await requireAdmin();
  const id = z.uuid().safeParse(formData.get("student_id"));
  if (!id.success) return;
  await removeStudentFiles([id.data]);
  const supabase = await createClient();
  const { error } = await supabase.from("students").delete().eq("id", id.data);
  if (error) throw new Error("Chưa xoá được hồ sơ bé");
  revalidatePath("/admin", "layout");
  redirect("/admin/hoc-sinh");
}

/** Xoá toàn bộ ảnh bài làm của các bé (thư mục {student_id}/ trong bucket). */
async function removeStudentFiles(studentIds: string[]) {
  const bucket = createAdminClient().storage.from(STORAGE_BUCKETS.submissions);
  for (const id of studentIds) {
    for (;;) {
      const { data, error } = await bucket.list(id, { limit: 1000 });
      if (error) throw new Error("Chưa xoá được ảnh bài làm");
      if (!data?.length) break;
      const { error: removeError } = await bucket.remove(data.map((f) => `${id}/${f.name}`));
      if (removeError) throw new Error("Chưa xoá được ảnh bài làm");
    }
  }
}

// ---------------------------------------------------------------- Bài nộp

const ScoreInput = z.object({
  submission_id: z.uuid(),
  score: z.coerce.number("Điểm phải là số").int("Điểm là số nguyên").min(1, "Điểm từ 1 đến 100").max(100, "Điểm từ 1 đến 100"),
});

/** Admin sửa điểm bằng tay. Giữ điểm trong feedback_json khớp với cột score. */
export async function updateScore(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = ScoreInput.safeParse({ submission_id: formData.get("submission_id"), score: formData.get("score") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Điểm chưa hợp lệ" };
  const supabase = await createClient();
  const { data: sub } = await supabase
    .from("submissions")
    .select("feedback_json")
    .eq("id", parsed.data.submission_id)
    .maybeSingle();
  if (!sub) return { error: "Không tìm thấy bài nộp." };
  const feedback = sub.feedback_json;
  const nextFeedback: Json | null =
    feedback && typeof feedback === "object" && !Array.isArray(feedback)
      ? { ...feedback, score: parsed.data.score }
      : feedback;
  const { error } = await supabase
    .from("submissions")
    .update({ score: parsed.data.score, feedback_json: nextFeedback })
    .eq("id", parsed.data.submission_id);
  if (error) return { error: "Chưa lưu được, bạn thử lại nhé." };
  revalidatePath("/admin", "layout");
  return { ok: "Đã lưu điểm" };
}

export async function adminDeleteSubmission(formData: FormData) {
  await requireAdmin();
  const id = z.uuid().safeParse(formData.get("submission_id"));
  if (!id.success) return;
  const supabase = await createClient();
  const { data: sub } = await supabase
    .from("submissions")
    .select("image_url, student_id")
    .eq("id", id.data)
    .maybeSingle();
  if (!sub) return;
  const { error: fileError } = await createAdminClient()
    .storage.from(STORAGE_BUCKETS.submissions)
    .remove([sub.image_url, sub.image_url.replace(/\.jpg$/i, "-original.jpg")]);
  if (fileError) throw new Error("Chưa xoá được ảnh bài làm");
  const { error } = await supabase.from("submissions").delete().eq("id", id.data);
  if (error) throw new Error("Chưa xoá được bài nộp");
  revalidatePath("/admin", "layout");
  redirect(`/admin/hoc-sinh/${sub.student_id}`);
}
