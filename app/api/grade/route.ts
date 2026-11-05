import { z } from "zod";
import { gradeHandwriting, GradingError, assertSupabaseUrl } from "@/lib/ai/grade";
import type { GradingResult } from "@/lib/ai/types";
import type { Json } from "@/lib/database.types";
import { STORAGE_BUCKETS, isSupabaseConfigured } from "@/lib/supabase";
import { createAdminClient, createClient } from "@/lib/supabase-server";

// Gọi VLM + xử lý ảnh có thể mất 30–90 giây.
export const maxDuration = 120;

const Body = z.union([
  z.object({
    /** Chấm bài đã nộp: lấy ảnh từ bucket, lưu điểm vào bảng submissions. */
    submission_id: z.uuid(),
    letter_size: z.enum(["vua", "nho"]).optional(),
    writing_style: z.enum(["dung", "nghieng"]).optional(),
    /** Chấm lại kể cả khi bài đã có điểm. */
    force: z.boolean().optional(),
  }),
  z.object({
    /** Chấm trực tiếp một URL ảnh trong Supabase Storage (không lưu kết quả). */
    image_url: z.url(),
    original_image_url: z.url().optional(),
    letter_size: z.enum(["vua", "nho"]).optional(),
    writing_style: z.enum(["dung", "nghieng"]).optional(),
  }),
]);

const STATUS: Record<GradingError["code"], number> = {
  INVALID_URL: 400,
  BAD_IMAGE: 422,
  NO_HANDWRITING: 422,
  FETCH_FAILED: 502,
};

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return json({ error: "Chưa cấu hình Supabase (xem .env.example)." }, 503);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("[grade] Chưa có ANTHROPIC_API_KEY — bài sẽ được chấm bằng số đo hình học (cv_only).");
  }
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return json({ error: "Bạn cần đăng nhập." }, 401);

  // Chỉ Trung Tâm THEDU chấm bài. Phụ huynh xem kết quả qua trang bài nộp.
  const { data: me } = await supabase.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (me?.role !== "admin") return json({ error: "Chỉ Trung Tâm THEDU mới chấm được bài." }, 403);

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Dữ liệu gửi lên không hợp lệ." }, 400);
  const body = parsed.data;

  try {
    // ---- Chấm trực tiếp theo URL
    if ("image_url" in body) {
      assertSupabaseUrl(body.image_url);
      const result = await gradeHandwriting({
        imageUrl: body.image_url,
        originalImageUrl: body.original_image_url,
        letterSize: body.letter_size,
        writingStyle: body.writing_style,
      });
      return json(result);
    }

    // ---- Chấm bài đã nộp. Truy vấn bằng client của NGƯỜI DÙNG để RLS kiểm tra quyền.
    const { data: submission } = await supabase
      .from("submissions")
      .select("id, student_id, image_url, score, feedback_json")
      .eq("id", body.submission_id)
      .maybeSingle();
    if (!submission) return json({ error: "Không tìm thấy bài nộp." }, 404);

    if (submission.score != null && submission.feedback_json && !body.force) {
      return json(submission.feedback_json as unknown as GradingResult);
    }

    const { data: student } = await supabase
      .from("students")
      .select("age")
      .eq("id", submission.student_id)
      .maybeSingle();

    const admin = createAdminClient();
    const path = submission.image_url;
    const originalPath = path.replace(/\.jpg$/i, "-original.jpg");
    const { data: signed, error: signError } = await admin.storage
      .from(STORAGE_BUCKETS.submissions)
      .createSignedUrls([path, originalPath], 300);
    if (signError || !signed?.[0]?.signedUrl) {
      return json({ error: "Không tìm thấy ảnh bài làm." }, 404);
    }

    const result = await gradeHandwriting({
      imageUrl: signed[0].signedUrl,
      originalImageUrl: signed[1]?.signedUrl ?? null,
      letterSize: body.letter_size,
      writingStyle: body.writing_style,
      studentAge: student?.age ?? null,
    });

    // Chỉ backend (service role) được ghi điểm — RLS chặn người dùng tự sửa.
    const { error: updateError } = await admin
      .from("submissions")
      .update({ score: result.score, feedback_json: result as unknown as Json })
      .eq("id", submission.id);
    if (updateError) console.error("[grade] Lưu điểm thất bại:", updateError.message);

    return json(result);
  } catch (error) {
    if (error instanceof GradingError) {
      const message =
        error.code === "NO_HANDWRITING"
          ? "Chưa thấy bài viết trong ảnh. Phụ huynh chụp lại rõ trang vở giúp bé nhé!"
          : error.message;
      return json({ error: message, code: error.code }, STATUS[error.code]);
    }
    console.error("[grade] Lỗi không mong đợi:", error);
    return json({ error: "Hệ thống chấm bài đang bận, vui lòng thử lại sau." }, 500);
  }
}

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}
