/**
 * Kiểu dữ liệu kết quả chấm điểm — dùng chung giữa backend (lưu vào
 * submissions.feedback_json) và frontend (vẽ khung lỗi lên ảnh).
 */
import type { CriterionKey } from "./standards";

export const ISSUE_TYPES = [
  "too_big", // chữ quá to so với ô ly
  "too_small", // chữ quá nhỏ
  "exceeds_line", // nét vượt khung ô ly (quá cao / quá sâu)
  "misaligned", // chân chữ lệch khỏi dòng kẻ
  "slant", // nghiêng sai / nghiêng không đều
  "too_close", // hai chữ quá sát
  "too_far", // hai chữ quá xa
  "letter_form", // hình dáng con chữ chưa đúng mẫu
  "diacritic", // dấu thanh / dấu phụ sai vị trí hoặc thiếu
  "other",
] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];

export type Severity = "minor" | "moderate" | "major";

/**
 * Toạ độ khung lỗi: [ymin, xmin, ymax, xmax], CHUẨN HOÁ 0–1000 theo kích thước
 * ảnh đã xử lý. Frontend vẽ bằng phần trăm: top = ymin/10 %, left = xmin/10 %, …
 */
export type Box2D = [ymin: number, xmin: number, ymax: number, xmax: number];

export type BoundingBoxIssue = {
  box: Box2D;
  type: IssueType;
  /** Nhãn ngắn hiển thị cạnh khung, ví dụ "Chữ h hơi cao". */
  label: string;
  /** Lời nhắc thân thiện cho bé khi chạm vào khung. */
  message: string;
  severity: Severity;
  /** Nguồn phát hiện: đo hình học (cv), mô hình thị giác (vlm), hoặc cả hai. */
  source: "cv" | "vlm" | "cv+vlm";
};

/** Khung khen ngợi (vẽ màu xanh): chữ viết đẹp nhất trong bài. */
export type HighlightBox = {
  box: Box2D;
  label: string;
  message: string;
};

export type CriterionResult = {
  score: number;
  cv_score: number | null;
  vlm_score: number | null;
  comment: string;
};

export type GradingResult = {
  /** Điểm tổng 1–100. */
  score: number;
  bounding_boxes: BoundingBoxIssue[];
  /** Chữ đẹp để khen (có từ phiên bản 1.1; bản ghi cũ có thể thiếu). */
  highlight_boxes?: HighlightBox[];
  encouraging_feedback: string;

  criteria: Record<CriterionKey, CriterionResult>;
  strengths: string[];
  /** Gợi ý dành cho phụ huynh/giáo viên (ngôn ngữ người lớn). */
  parent_tip: string;
  transcription: string;
  measurements: MeasurementSummary;
  meta: {
    coordinate_system: "normalized_1000_yxyx";
    image_width: number;
    image_height: number;
    letter_size: string;
    writing_style: string;
    /** "hybrid" = đo hình học + VLM; "cv_only" khi VLM không khả dụng. */
    mode: "hybrid" | "cv_only";
    model: string | null;
    version: string;
    graded_at: string;
  };
};

export type MeasurementSummary = {
  grid_detected: boolean;
  li_px: number | null;
  line_count: number;
  word_count: number;
  x_height_li: number[];
  slant_deg: { median: number; std: number } | null;
  word_gap_li: { mean: number; cv: number; values: number[] } | null;
  baseline_std_li: number | null;
  ruled_line_offset_li: number | null;
};
