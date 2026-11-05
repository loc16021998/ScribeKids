import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { SUPABASE_URL } from "@/lib/supabase";
import { measureHandwriting } from "./measure";
import {
  combineCriteria,
  fallbackFeedback,
  mergeIssues,
  pickHighlights,
  totalScore,
} from "./scoring";
import { SLANT, STANDARDS, type LetterSize, type WritingStyle } from "./standards";
import type { GradingResult } from "./types";
import { assessWithVlm, VlmUnavailableError, VLM_MODEL, type VlmOutput } from "./vlm";

export const GRADER_VERSION = "1.1.0";

/** Cạnh dài tối đa đưa vào chấm — ≤ 2576px để Claude giữ toạ độ 1:1 với pixel. */
const MAX_SIDE = 2400;
const MAX_BYTES = 15 * 1024 * 1024;

export type GradeInput = {
  /** URL ảnh đã xử lý (signed URL của Supabase Storage). */
  imageUrl: string;
  /** URL ảnh gốc cùng vùng crop (còn dòng kẻ ô ly) — giúp đo theo đơn vị li. */
  originalImageUrl?: string | null;
  letterSize?: LetterSize;
  writingStyle?: WritingStyle;
  studentAge?: number | null;
};

export class GradingError extends Error {
  constructor(
    public code: "INVALID_URL" | "FETCH_FAILED" | "BAD_IMAGE" | "NO_HANDWRITING",
    message: string,
  ) {
    super(message);
  }
}

export async function gradeHandwriting(input: GradeInput): Promise<GradingResult> {
  const letterSize = input.letterSize ?? "vua";
  const writingStyle = input.writingStyle ?? "dung";
  const standard = STANDARDS[letterSize];

  const [processedBuf, originalBuf] = await Promise.all([
    fetchImage(input.imageUrl),
    input.originalImageUrl ? fetchImage(input.originalImageUrl).catch(() => null) : null,
  ]);

  // ---- Giải mã ảnh; ảnh gốc được ép về đúng kích thước ảnh xử lý để trùng toạ độ.
  let width: number, height: number, gray: Uint8Array, processedJpeg: Buffer;
  try {
    const meta = await sharp(processedBuf).rotate().metadata();
    const scale = Math.min(1, MAX_SIDE / Math.max(meta.width ?? 1, meta.height ?? 1));
    width = Math.max(1, Math.round((meta.autoOrient?.width ?? meta.width ?? 1) * scale));
    height = Math.max(1, Math.round((meta.autoOrient?.height ?? meta.height ?? 1) * scale));
    const base = sharp(processedBuf).rotate().resize(width, height, { fit: "fill" });
    const raw = await base.clone().greyscale().raw().toBuffer({ resolveWithObject: true });
    gray = takeChannel(raw.data, raw.info.channels, 0);
    processedJpeg = await base.clone().jpeg({ quality: 90 }).toBuffer();
  } catch {
    throw new GradingError("BAD_IMAGE", "Không đọc được ảnh bài làm");
  }

  let rgb: Uint8Array | null = null;
  let originalJpeg: Buffer | null = null;
  if (originalBuf) {
    try {
      const base = sharp(originalBuf).rotate().resize(width, height, { fit: "fill" }).removeAlpha();
      const raw = await base.clone().raw().toBuffer({ resolveWithObject: true });
      rgb = raw.info.channels === 3 ? new Uint8Array(raw.data) : null;
      originalJpeg = await base.clone().jpeg({ quality: 88 }).toBuffer();
    } catch {
      rgb = null; // Ảnh gốc hỏng không chặn việc chấm — chỉ mất phần đo theo ô ly.
    }
  }

  // ---- Đo hình học
  const measurements = measureHandwriting(
    gray,
    rgb,
    width,
    height,
    standard,
    SLANT[writingStyle].expectedDeg,
  );

  // ---- Đánh giá bằng VLM (lỗi API → chấm bằng số đo hình học)
  let vlm: VlmOutput | null = null;
  let model: string | null = null;
  try {
    const res = await assessWithVlm({
      processedJpeg,
      originalJpeg,
      measurements,
      standard,
      writingStyle,
      studentAge: input.studentAge ?? null,
    });
    vlm = res.output;
    model = res.model;
  } catch (error) {
    if (error instanceof VlmUnavailableError) {
      console.warn("[grade] VLM không trả kết quả:", error.message);
    } else if (error instanceof Anthropic.AuthenticationError) {
      console.error("[grade] Sai/thiếu ANTHROPIC_API_KEY — chuyển sang chấm bằng CV");
    } else if (error instanceof Anthropic.RateLimitError) {
      console.warn("[grade] Bị giới hạn tốc độ — chuyển sang chấm bằng CV");
    } else if (error instanceof Anthropic.APIConnectionError) {
      console.error("[grade] Không kết nối được API:", error.message);
    } else if (error instanceof Anthropic.APIError) {
      console.error(`[grade] Lỗi API ${error.status}:`, error.message);
    } else if (error instanceof Anthropic.AnthropicError) {
      // Ví dụ: chưa cấu hình thông tin xác thực Claude.
      console.error("[grade] Claude chưa sẵn sàng:", error.message);
    } else {
      throw error;
    }
  }

  if (vlm && !vlm.is_handwriting_page) {
    throw new GradingError("NO_HANDWRITING", "Ảnh không phải bài viết tay");
  }
  if (!vlm && measurements.blobs.length === 0) {
    throw new GradingError("NO_HANDWRITING", "Không tìm thấy nét chữ trong ảnh");
  }

  // ---- Chấm điểm & tổng hợp
  const criteria = combineCriteria(measurements, vlm);
  const score = totalScore(criteria);

  return {
    score,
    bounding_boxes: mergeIssues(measurements, vlm),
    highlight_boxes: pickHighlights(measurements, vlm),
    encouraging_feedback: vlm?.encouraging_feedback || fallbackFeedback(criteria, standard),
    criteria,
    strengths: vlm?.strengths ?? [],
    parent_tip: vlm?.parent_tip ?? "",
    transcription: vlm?.transcription ?? "",
    measurements: measurements.summary,
    meta: {
      coordinate_system: "normalized_1000_yxyx",
      image_width: width,
      image_height: height,
      letter_size: standard.label,
      writing_style: SLANT[writingStyle].label,
      mode: vlm ? "hybrid" : "cv_only",
      model: model ?? (vlm ? VLM_MODEL : null),
      version: GRADER_VERSION,
      graded_at: new Date().toISOString(),
    },
  };
}

/** Chỉ cho phép tải ảnh từ Supabase của dự án (chặn SSRF). */
export function assertSupabaseUrl(url: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new GradingError("INVALID_URL", "URL ảnh không hợp lệ");
  }
  const allowed = new URL(SUPABASE_URL);
  if (parsed.origin !== allowed.origin || !parsed.pathname.startsWith("/storage/v1/object/")) {
    throw new GradingError("INVALID_URL", "Chỉ chấp nhận ảnh từ Supabase Storage của ứng dụng");
  }
}

async function fetchImage(url: string) {
  assertSupabaseUrl(url);
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000), cache: "no-store" });
  if (!res.ok) throw new GradingError("FETCH_FAILED", `Tải ảnh thất bại (${res.status})`);
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES) throw new GradingError("BAD_IMAGE", "Ảnh quá lớn");
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) throw new GradingError("BAD_IMAGE", "Ảnh quá lớn");
  return buf;
}

function takeChannel(data: Buffer, channels: number, c: number) {
  if (channels === 1) return new Uint8Array(data);
  const out = new Uint8Array(data.length / channels);
  for (let i = 0, p = c; i < out.length; i++, p += channels) out[i] = data[p];
  return out;
}
