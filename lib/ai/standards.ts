/**
 * Chuẩn chữ viết tiểu học (mẫu chữ trong trường tiểu học) quy đổi ra đơn vị "li"
 * (1 li = 1 ô ly nhỏ ≈ 2mm). Mọi ngưỡng chấm điểm đều tập trung ở đây để
 * giáo viên/chuyên gia có thể tinh chỉnh mà không phải sửa thuật toán.
 */

export type LetterSize = "vua" | "nho";
export type WritingStyle = "dung" | "nghieng";

export type HandwritingStandard = {
  label: string;
  /** Chiều cao chữ cái thường không có nét khuyết (a, c, e, o, …). */
  xHeightLi: number;
  /** Chiều cao tối đa phía trên dòng kẻ chân chữ (b, h, k, l = 5 li ở cỡ vừa). */
  maxAboveLi: number;
  /** Chiều sâu tối đa phía dưới dòng kẻ chân chữ (g, y = 3 li ở cỡ vừa). */
  maxBelowLi: number;
  /** Khoảng cách chuẩn giữa hai chữ (tiếng) ≈ bề rộng một con chữ o. */
  wordGapLi: number;
};

export const STANDARDS: Record<LetterSize, HandwritingStandard> = {
  vua: { label: "cỡ vừa", xHeightLi: 2, maxAboveLi: 5, maxBelowLi: 3, wordGapLi: 1.5 },
  nho: { label: "cỡ nhỏ", xHeightLi: 1, maxAboveLi: 2.5, maxBelowLi: 1.5, wordGapLi: 0.75 },
};

/** Góc nghiêng mong đợi (độ, dương = nghiêng sang phải). */
export const SLANT: Record<WritingStyle, { label: string; expectedDeg: number }> = {
  dung: { label: "chữ viết đứng", expectedDeg: 0 },
  nghieng: { label: "chữ viết nghiêng", expectedDeg: 15 },
};

/** Ngưỡng phát hiện lỗi & quy đổi điểm. */
export const THRESHOLDS = {
  /** Vượt quá chiều cao/sâu tối đa bao nhiêu li thì coi là "vượt khung". */
  exceedToleranceLi: 0.75,
  /** Tỉ lệ chiều cao chữ / chuẩn: ngoài khoảng này là "quá to" / "quá nhỏ". */
  sizeRatioHigh: 1.35,
  sizeRatioLow: 0.65,
  /** Chân chữ lệch khỏi đường chân dòng quá bao nhiêu li thì là "lệch dòng". */
  baselineDeviationLi: 0.8,
  /** Khoảng cách chữ: dưới tooClose × chuẩn là quá sát, trên tooFar × chuẩn là quá xa. */
  gapTooClose: 0.55,
  gapTooFar: 2.2,
  /** Độ lệch góc nghiêng chấp nhận được so với mẫu (độ). */
  slantToleranceDeg: 8,
  /** Độ dao động góc nghiêng giữa các chữ chấp nhận được (độ lệch chuẩn). */
  slantConsistencyDeg: 4,
} as const;

/** Trọng số các tiêu chí trong điểm tổng (tổng = 1). */
export const WEIGHTS = {
  size: 0.25, // Tỷ lệ chuẩn ô ly: chiều cao, độ rộng con chữ
  alignment: 0.15, // Chữ ngồi đúng dòng kẻ, thẳng hàng
  slant: 0.15, // Độ nghiêng đúng mẫu và đều
  spacing: 0.2, // Khoảng cách giữa các chữ đều, đúng chuẩn
  letter_form: 0.25, // Hình dáng con chữ, nét nối, dấu thanh — chỉ VLM đánh giá được
} as const;

/** Khi có cả số đo hình học lẫn đánh giá VLM cho một tiêu chí, tỉ trọng của số đo. */
export const CV_BLEND = 0.6;

export type CriterionKey = keyof typeof WEIGHTS;
