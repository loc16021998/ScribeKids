import { createClient, STORAGE_BUCKETS } from "@/lib/supabase";
import type { ProcessedCapture } from "./capture";

/**
 * Đẩy ảnh lên bucket "submissions" (đường dẫn {student_id}/… khớp storage policy)
 * và tạo bản ghi submissions ở trạng thái chờ chấm (score = null).
 */
export async function uploadSubmission(studentId: string, capture: ProcessedCapture) {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Bạn cần đăng nhập để nộp bài.");

  // Kiểm tra lượt trước khi tải ảnh, để không để lại ảnh mồ côi khi đã hết lượt.
  const { data: left } = await supabase.rpc("submissions_left_today", { sid: studentId });
  if (left === 0) throw new Error("Hôm nay bé đã nộp đủ 5 bài. Ngày mai mình nộp tiếp nhé!");

  const base = `${studentId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const processedPath = `${base}.jpg`;
  const originalPath = `${base}-original.jpg`;
  const bucket = supabase.storage.from(STORAGE_BUCKETS.submissions);

  const uploads = await Promise.all([
    bucket.upload(processedPath, capture.processed, { contentType: "image/jpeg" }),
    bucket.upload(originalPath, capture.original, { contentType: "image/jpeg" }),
  ]);
  if (uploads.some((u) => u.error)) throw new Error("Chưa tải được ảnh lên, bạn thử lại nhé.");

  const { data, error } = await supabase
    .from("submissions")
    .insert({ student_id: studentId, image_url: processedPath, submitted_by: auth.user.id })
    .select()
    .single();
  if (error) {
    await bucket.remove([processedPath, originalPath]);
    throw new Error(error.message);
  }
  return data;
}
