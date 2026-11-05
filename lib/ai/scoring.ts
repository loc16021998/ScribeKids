/**
 * Gộp số đo hình học (CV) + đánh giá VLM → điểm tổng 1–100, danh sách khung lỗi
 * (toạ độ chuẩn hoá 0–1000) và lời nhận xét. Thuần TypeScript, không gọi API.
 */
import { unionBox, type Measurements, type PxBox } from "./measure";
import { CV_BLEND, WEIGHTS, type CriterionKey, type HandwritingStandard } from "./standards";
import type {
  BoundingBoxIssue,
  Box2D,
  CriterionResult,
  HighlightBox,
  IssueType,
  Severity,
} from "./types";
import type { VlmOutput } from "./vlm";

export const MAX_BOXES = 6;

const CRITERIA = Object.keys(WEIGHTS) as CriterionKey[];

const DEFAULT_COMMENTS: Record<CriterionKey, string> = {
  size: "Chiều cao con chữ so với ô ly",
  alignment: "Chữ ngồi trên dòng kẻ",
  slant: "Độ nghiêng của chữ",
  spacing: "Khoảng cách giữa các chữ",
  letter_form: "Hình dáng con chữ",
};

export function combineCriteria(
  m: Measurements,
  vlm: VlmOutput | null,
): Record<CriterionKey, CriterionResult> {
  const cvScores: Record<CriterionKey, number | null> = { ...m.scores, letter_form: null };
  const out = {} as Record<CriterionKey, CriterionResult>;
  for (const key of CRITERIA) {
    const cv = cvScores[key];
    const v = vlm ? clamp(vlm.criteria[key].score, 0, 100) : null;
    const score =
      cv != null && v != null ? CV_BLEND * cv + (1 - CV_BLEND) * v : (cv ?? v ?? null);
    out[key] = {
      score: score == null ? -1 : Math.round(score),
      cv_score: cv,
      vlm_score: v,
      comment: vlm?.criteria[key].comment || DEFAULT_COMMENTS[key],
    };
  }
  return out;
}

/** Điểm tổng 1–100; tiêu chí nào không có dữ liệu (-1) thì chia lại trọng số. */
export function totalScore(criteria: Record<CriterionKey, CriterionResult>) {
  let sum = 0;
  let weight = 0;
  for (const key of CRITERIA) {
    if (criteria[key].score < 0) continue;
    sum += WEIGHTS[key] * criteria[key].score;
    weight += WEIGHTS[key];
  }
  if (weight === 0) return 1;
  return clamp(Math.round(sum / weight), 1, 100);
}

const SEVERITY_RANK: Record<Severity, number> = { major: 3, moderate: 2, minor: 1 };

/**
 * Gộp lỗi CV (đã được VLM xác nhận) với lỗi VLM. Lỗi trùng vị trí (IoU > 0.4)
 * được nhập làm một: lấy lời nhắc của VLM (tự nhiên hơn) + khung của CV (chính xác hơn).
 */
export function mergeIssues(m: Measurements, vlm: VlmOutput | null): BoundingBoxIssue[] {
  const rejected = new Set(
    (vlm?.cv_issue_review ?? []).filter((r) => !r.valid).map((r) => r.index),
  );
  type Px = Omit<BoundingBoxIssue, "box"> & { px: PxBox };

  const cv: Px[] = m.issues
    .filter((_, i) => !rejected.has(i))
    .map((iss) => ({
      px: iss.box,
      type: iss.type,
      label: iss.label,
      message: iss.message,
      severity: iss.severity,
      source: "cv",
    }));

  const fromVlm: Px[] = [];
  for (const iss of vlm?.issues ?? []) {
    const blobs = iss.blob_ids.map((id) => m.blobs[id]).filter(Boolean);
    let px: PxBox | null = blobs.length ? blobs.reduce<PxBox>((a, b) => unionBox(a, b), blobs[0]) : null;
    if (!px && iss.box) {
      px = { x0: iss.box.xmin, y0: iss.box.ymin, x1: iss.box.xmax, y1: iss.box.ymax };
    }
    if (!px || px.x1 <= px.x0 || px.y1 <= px.y0) continue;
    fromVlm.push({
      px,
      type: iss.type,
      label: iss.label,
      message: iss.message,
      severity: iss.severity,
      source: "vlm",
    });
  }

  const merged: Px[] = [...cv];
  for (const v of fromVlm) {
    const twin = merged.find((c) => c.source === "cv" && iou(c.px, v.px) > 0.4);
    if (twin) {
      twin.label = v.label;
      twin.message = v.message;
      twin.type = pickType(twin.type, v.type);
      twin.severity = SEVERITY_RANK[v.severity] > SEVERITY_RANK[twin.severity] ? v.severity : twin.severity;
      twin.source = "cv+vlm";
    } else {
      merged.push(v);
    }
  }

  const sourceRank = { "cv+vlm": 3, vlm: 2, cv: 1 } as const;
  merged.sort(
    (a, b) =>
      SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
      sourceRank[b.source] - sourceRank[a.source],
  );

  const pad = Math.max(3, Math.round(m.unitPx * 0.2));
  return merged.slice(0, MAX_BOXES).map(({ px, ...rest }) => ({
    ...rest,
    box: toBox2D(px, m.width, m.height, pad),
  }));
}

export const MAX_HIGHLIGHTS = 2;

/**
 * Chữ đẹp để khen (vẽ màu xanh). Ưu tiên lựa chọn của VLM; nếu không có, chọn
 * khối chữ không dính lỗi nào, chân chữ sát dòng kẻ nhất và nghiêng đều nhất.
 */
export function pickHighlights(m: Measurements, vlm: VlmOutput | null): HighlightBox[] {
  const pad = Math.max(3, Math.round(m.unitPx * 0.2));
  const fromVlm: HighlightBox[] = [];
  for (const h of vlm?.highlights ?? []) {
    const blobs = h.blob_ids.map((id) => m.blobs[id]).filter(Boolean);
    if (!blobs.length) continue;
    const px = blobs.reduce<PxBox>((a, b) => unionBox(a, b), blobs[0]);
    fromVlm.push({ box: toBox2D(px, m.width, m.height, pad), label: h.label, message: h.message });
  }
  if (fromVlm.length) return fromVlm.slice(0, MAX_HIGHLIGHTS);
  if (m.blobs.length < 3) return [];

  const flagged = new Set(m.issues.flatMap((i) => i.blobIds));
  const slants = m.blobs.map((b) => b.slantDeg).filter((s): s is number => s != null);
  const medSlant = slants.length ? slants.sort((a, b) => a - b)[slants.length >> 1] : 0;
  const minWidth = m.unitPx * 1.2;

  return m.blobs
    .filter((b) => !flagged.has(b.id) && b.x1 - b.x0 + 1 >= minWidth)
    .map((b) => {
      const line = m.lines[b.lineId];
      const baselineErr = Math.abs(b.coreBottom - line.baseline) / (m.unitPx || 1);
      const slantErr = b.slantDeg == null ? 1 : Math.abs(b.slantDeg - medSlant) / 10;
      return { b, cost: baselineErr + slantErr };
    })
    .sort((a, z) => a.cost - z.cost)
    .slice(0, MAX_HIGHLIGHTS)
    .map(({ b }) => ({
      box: toBox2D(b, m.width, m.height, pad),
      label: "Chữ viết đẹp",
      message: "Chữ này con viết ngay ngắn, đều nét lắm. Giỏi quá!",
    }));
}

/** Pixel (biên bao gồm) → [ymin, xmin, ymax, xmax] chuẩn hoá 0–1000, có nới lề. */
export function toBox2D(b: PxBox, width: number, height: number, pad = 0): Box2D {
  const nx = (x: number) => clamp(Math.round((x / width) * 1000), 0, 1000);
  const ny = (y: number) => clamp(Math.round((y / height) * 1000), 0, 1000);
  return [ny(b.y0 - pad), nx(b.x0 - pad), ny(b.y1 + 1 + pad), nx(b.x1 + 1 + pad)];
}

/** Nhận xét dự phòng khi không gọi được VLM — dựng từ tiêu chí tốt nhất & yếu nhất. */
export function fallbackFeedback(
  criteria: Record<CriterionKey, CriterionResult>,
  standard: HandwritingStandard,
) {
  const scored = CRITERIA.filter((k) => criteria[k].score >= 0).sort(
    (a, b) => criteria[b].score - criteria[a].score,
  );
  const praise: Record<CriterionKey, string> = {
    size: "các con chữ cao đều, vừa vặn trong ô ly",
    alignment: "chữ ngồi ngay ngắn trên dòng kẻ",
    slant: "chữ đứng thẳng đều đặn",
    spacing: "các chữ cách nhau rất đều",
    letter_form: "nét chữ rất nắn nót",
  };
  const tips: Record<CriterionKey, string> = {
    size: `mình giữ chữ thường cao vừa ${String(standard.xHeightLi).replace(".", ",")} ô ly nhé`,
    alignment: "mình đặt chân các con chữ chạm đúng đường kẻ nhé",
    slant: "mình viết các nét thẳng đều như nhau nhé",
    spacing: "mình để khoảng cách giữa hai chữ bằng một con chữ o nhé",
    letter_form: "mình viết chậm lại một chút cho nét thật tròn trịa nhé",
  };
  const best = scored[0] ?? "letter_form";
  const worst = scored[scored.length - 1];
  const tip =
    worst && worst !== best && criteria[worst].score < 85
      ? ` Lần sau ${tips[worst]}!`
      : " Con cứ tiếp tục luyện đều đặn như thế nhé!";
  return `Con viết giỏi lắm, ${praise[best]}!${tip}`;
}

function pickType(cvType: IssueType, vlmType: IssueType): IssueType {
  return vlmType === "other" ? cvType : vlmType;
}

function iou(a: PxBox, b: PxBox) {
  const ix = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) + 1);
  const iy = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) + 1);
  const inter = ix * iy;
  const area = (r: PxBox) => (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1);
  return inter / (area(a) + area(b) - inter);
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
