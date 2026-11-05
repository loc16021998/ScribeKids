/**
 * Đo lường hình học nét chữ viết tay — thuần TypeScript, không phụ thuộc DOM/Node.
 *
 * Đầu vào là 2 ảnh TRÙNG TOẠ ĐỘ do client tạo ra (lib/image/capture.ts):
 *  - gray: ảnh đã xử lý (nền trắng, chỉ còn nét mực) → tách nét chữ.
 *  - rgb : ảnh gốc cùng vùng crop (còn dòng kẻ ô ly) → dò kích thước 1 li.
 *
 *  (1) Dò lưới ô ly bằng tự tương quan (autocorrelation) profile dòng kẻ → li_px
 *  (2) Thành phần liên thông → tách dòng chữ (projection) → gộp thành "khối chữ"
 *  (3) Mỗi dòng: vùng thân chữ (x-height), đường chân chữ (baseline)
 *  (4) Độ nghiêng: tìm góc xiên (shear) làm projection dọc "sắc" nhất
 *  (5) Khoảng cách giữa các chữ, độ lệch chân chữ, chữ vượt khung
 *  (6) Quy đổi ra điểm từng tiêu chí 0–100 + danh sách lỗi kèm khung toạ độ
 */
import {
  THRESHOLDS,
  type HandwritingStandard,
} from "./standards";
import type { IssueType, MeasurementSummary, Severity } from "./types";

export type PxBox = { x0: number; y0: number; x1: number; y1: number }; // biên bao gồm

export type Blob = PxBox & {
  id: number;
  lineId: number;
  area: number;
  coreBottom: number;
  slantDeg: number | null;
};

export type TextLine = {
  id: number;
  bandTop: number;
  bandBottom: number;
  coreTop: number;
  baseline: number;
  x0: number;
  x1: number;
  xHeightPx: number;
  blobIds: number[];
};

export type CvIssue = {
  type: IssueType;
  box: PxBox;
  severity: Severity;
  label: string;
  message: string;
  blobIds: number[];
};

export type CvScores = {
  size: number | null;
  alignment: number | null;
  slant: number | null;
  spacing: number | null;
};

export type Measurements = {
  width: number;
  height: number;
  grid: { detected: boolean; liPx: number | null; phase: number | null };
  /** Đơn vị đo (px cho 1 li): từ lưới ô ly, hoặc suy ra từ chiều cao chữ nếu không dò được. */
  unitPx: number;
  lines: TextLine[];
  blobs: Blob[];
  wordGapsLi: number[];
  issues: CvIssue[];
  scores: CvScores;
  summary: MeasurementSummary;
};

const INK_THRESHOLD = 170;

export function measureHandwriting(
  gray: Uint8Array,
  rgb: Uint8Array | null,
  width: number,
  height: number,
  standard: HandwritingStandard,
  expectedSlantDeg: number,
): Measurements {
  const n = width * height;
  const ink = new Uint8Array(n);
  for (let i = 0; i < n; i++) ink[i] = gray[i] < INK_THRESHOLD ? 1 : 0;

  // ---------------------------------------------------------------- (2) thành phần
  const { labels, comps } = labelComponents(ink, width, height);
  const minArea = Math.max(4, Math.round(n * 0.000005));
  const kept = comps.filter((c) => {
    const w = c.x1 - c.x0 + 1;
    const h = c.y1 - c.y0 + 1;
    if (c.area < minArea) return false;
    // Phần dư của đường kẻ/lề dài (không phải chữ)
    if (w > width * 0.6 && h < height * 0.05) return false;
    if (h > height * 0.6 && w < width * 0.05) return false;
    return true;
  });

  const empty = emptyMeasurements(width, height);
  if (kept.length === 0) return empty;

  const heights = kept.map((c) => c.y1 - c.y0 + 1);
  const p75CompH = percentile(heights, 0.75);

  // ---------------------------------------------------------------- (1) lưới ô ly
  const grid = rgb ? detectGrid(rgb, ink, width, height) : null;

  // ---------------------------------------------------------------- dòng chữ
  // Dùng SỐ ĐOẠN MỰC cắt qua mỗi hàng (không phải số pixel): vùng thân chữ có nhiều
  // nét dọc cắt qua nên tạo "cao nguyên" rõ ràng; nét nối ngang ở chân chữ hay nét
  // khuyết trên/dưới không làm lệch như khi đếm pixel.
  const keptIds = new Set(kept.map((c) => c.id));
  const rowRuns = runProfile(labels, width, 0, height - 1, 0, width - 1, keptIds);
  const smoothed = smooth(rowRuns, Math.max(2, Math.round(p75CompH * 0.12)));
  const peaks = findPeaks(smoothed, 0.2, Math.max(4, p75CompH * 0.8));
  const bands = peaksToBands(peaks, smoothed, height);

  const lineComps: (typeof kept)[] = bands.map(() => []);
  for (const c of kept) {
    const bandIdx = bands.findIndex((b) => c.meanY >= b.top && c.meanY <= b.bottom);
    if (bandIdx >= 0) lineComps[bandIdx].push(c);
  }

  // (3) Vùng thân chữ và chân chữ của từng dòng
  const rawLines: Omit<TextLine, "id" | "blobIds">[] = [];
  const rawLineComps: (typeof kept)[] = [];
  bands.forEach((band, i) => {
    const cs = lineComps[i];
    if (cs.length === 0) return;
    const y0 = Math.min(...cs.map((c) => c.y0));
    const y1 = Math.max(...cs.map((c) => c.y1));
    const lx0 = Math.min(...cs.map((c) => c.x0));
    const lx1 = Math.max(...cs.map((c) => c.x1));
    const ids = new Set(cs.map((c) => c.id));
    const hs = smooth(runProfile(labels, width, y0, y1, lx0, lx1, ids), Math.max(1, Math.round(p75CompH * 0.06)));
    let peak = 0;
    for (let k = 1; k < hs.length; k++) if (hs[k] > hs[peak]) peak = k;
    const thr = hs[peak] * 0.5;
    let top = peak;
    while (top > 0 && hs[top - 1] >= thr) top--;
    let bottom = peak;
    while (bottom < hs.length - 1 && hs[bottom + 1] >= thr) bottom++;
    rawLines.push({
      bandTop: band.top,
      bandBottom: band.bottom,
      coreTop: y0 + top,
      baseline: y0 + bottom,
      x0: Math.min(...cs.map((c) => c.x0)),
      x1: Math.max(...cs.map((c) => c.x1)),
      xHeightPx: bottom - top + 1,
    });
    rawLineComps.push(cs);
  });

  if (rawLines.length === 0) return empty;

  // Đơn vị đo: tin lưới ô ly nếu chiều cao chữ đo được hợp lý so với nó.
  const medianXHeight = median(rawLines.map((l) => l.xHeightPx));
  let gridReliable = false;
  if (grid) {
    const ratio = medianXHeight / (grid.liPx * standard.xHeightLi);
    gridReliable = ratio > 0.35 && ratio < 2.8;
  }
  const unit = gridReliable ? grid!.liPx : medianXHeight / standard.xHeightLi;

  // ---------------------------------------------------------------- khối chữ
  const lines: TextLine[] = [];
  const blobs: Blob[] = [];
  const medianArea = median(kept.map((c) => c.area));

  rawLines.forEach((rl, li) => {
    const line: TextLine = { ...rl, id: li, blobIds: [] };
    const cs = [...rawLineComps[li]].sort((a, b) => a.x0 - b.x0);
    const groups: (typeof kept)[] = [];
    for (const c of cs) {
      const cur = groups[groups.length - 1];
      if (cur) {
        const gx1 = Math.max(...cur.map((g) => g.x1));
        const gx0 = Math.min(...cur.map((g) => g.x0));
        const cx = (c.x0 + c.x1) / 2;
        const overlaps = c.x0 <= gx1;
        // Dấu thanh / dấu phụ: thành phần nhỏ nằm sát phía trên/dưới chữ
        const isMark = c.area < medianArea * 0.2 && cx >= gx0 - unit * 0.3 && cx <= gx1 + unit * 0.3;
        if (overlaps || isMark) {
          cur.push(c);
          continue;
        }
      }
      groups.push([c]);
    }

    for (const g of groups) {
      const box = {
        x0: Math.min(...g.map((c) => c.x0)),
        y0: Math.min(...g.map((c) => c.y0)),
        x1: Math.max(...g.map((c) => c.x1)),
        y1: Math.max(...g.map((c) => c.y1)),
      };
      const ids = new Set(g.map((c) => c.id));
      const { coreBottom, xs, ys } = blobPixels(labels, width, box, ids);
      const tallEnough = box.y1 - box.y0 + 1 >= unit * 1.2;
      const blob: Blob = {
        ...box,
        id: blobs.length,
        lineId: li,
        area: g.reduce((s, c) => s + c.area, 0),
        coreBottom,
        slantDeg: tallEnough && xs.length >= 80 ? estimateSlant(xs, ys) : null,
      };
      blobs.push(blob);
      line.blobIds.push(blob.id);
    }
    lines.push(line);
  });

  // ---------------------------------------------------------------- (4)(5) số đo
  const issues: CvIssue[] = [];
  const toLi = (px: number) => px / unit;

  // Chiều cao chữ từng dòng
  const xHeightsLi = lines.map((l) => toLi(l.xHeightPx));
  const medianXLi = median(xHeightsLi);
  lines.forEach((l, i) => {
    const ref = gridReliable ? standard.xHeightLi : medianXLi;
    const ratio = xHeightsLi[i] / ref;
    const box = { x0: l.x0, y0: l.coreTop, x1: l.x1, y1: l.baseline };
    if (ratio > THRESHOLDS.sizeRatioHigh) {
      issues.push({
        type: "too_big",
        box,
        severity: ratio > 1.7 ? "major" : "moderate",
        label: "Chữ hơi to",
        message: `Dòng này chữ hơi to rồi, con viết nhỏ lại cao vừa ${fmtLi(standard.xHeightLi)} ô ly nhé!`,
        blobIds: l.blobIds,
      });
    } else if (ratio < THRESHOLDS.sizeRatioLow) {
      issues.push({
        type: "too_small",
        box,
        severity: ratio < 0.45 ? "major" : "moderate",
        label: "Chữ hơi nhỏ",
        message: `Chữ dòng này hơi bé, con viết to hơn một chút cho đủ ${fmtLi(standard.xHeightLi)} ô ly nhé!`,
        blobIds: l.blobIds,
      });
    }
  });

  // Vượt khung trên/dưới & lệch dòng
  const residuals: number[] = [];
  for (const b of blobs) {
    const line = lines[b.lineId];
    const aboveLi = toLi(line.baseline - b.y0);
    const belowLi = toLi(b.y1 - line.baseline);
    const sevFor = (over: number): Severity =>
      !gridReliable ? "minor" : over > 1.5 ? "major" : "moderate";
    const overAbove = aboveLi - standard.maxAboveLi;
    const overBelow = belowLi - standard.maxBelowLi;
    if (overAbove > THRESHOLDS.exceedToleranceLi) {
      issues.push({
        type: "exceeds_line",
        box: b,
        severity: sevFor(overAbove),
        label: "Nét cao quá khung",
        message: `Nét này cao quá rồi, nét cao nhất chỉ tới ${fmtLi(standard.maxAboveLi)} ô ly thôi con nhé!`,
        blobIds: [b.id],
      });
    } else if (overBelow > THRESHOLDS.exceedToleranceLi) {
      issues.push({
        type: "exceeds_line",
        box: b,
        severity: sevFor(overBelow),
        label: "Nét kéo quá dài",
        message: `Nét kéo xuống hơi dài, con dừng bút ở ${fmtLi(standard.maxBelowLi)} ô ly dưới dòng kẻ nhé!`,
        blobIds: [b.id],
      });
    }

    if (b.x1 - b.x0 + 1 >= unit * 0.5) {
      const r = toLi(b.coreBottom - line.baseline);
      residuals.push(r);
      if (Math.abs(r) > THRESHOLDS.baselineDeviationLi) {
        issues.push({
          type: "misaligned",
          box: b,
          severity: Math.abs(r) > 1.5 ? "moderate" : "minor",
          label: r > 0 ? "Chữ bị tụt dòng" : "Chữ bị nhảy lên",
          message: "Chữ này chưa ngồi ngay ngắn trên dòng kẻ, con đặt chân chữ chạm đường kẻ nhé!",
          blobIds: [b.id],
        });
      }
    }
  }
  const baselineStd = residuals.length >= 2 ? std(residuals) : null;

  let ruledOffset: number | null = null;
  if (gridReliable && grid!.phase != null) {
    const offs = lines.map((l) => {
      let d = (l.baseline - grid!.phase!) % grid!.liPx;
      if (d < 0) d += grid!.liPx;
      if (d > grid!.liPx / 2) d -= grid!.liPx;
      return Math.abs(d / grid!.liPx);
    });
    ruledOffset = median(offs);
  }

  // Khoảng cách giữa các chữ
  const wordGapsLi: number[] = [];
  for (const l of lines) {
    const bs = l.blobIds.map((id) => blobs[id]);
    const gaps = bs.slice(1).map((b, i) => ({
      li: Math.max(0, toLi(b.x0 - bs[i].x1 - 1)),
      left: bs[i],
      right: b,
    }));
    const wordGaps = selectWordGaps(gaps.map((g) => g.li), standard.wordGapLi);
    gaps.forEach((g, i) => {
      if (!wordGaps.has(i)) return;
      wordGapsLi.push(g.li);
      const box = unionBox(g.left, g.right);
      if (g.li < standard.wordGapLi * THRESHOLDS.gapTooClose) {
        issues.push({
          type: "too_close",
          box,
          severity: g.li < standard.wordGapLi * 0.25 ? "moderate" : "minor",
          label: "Hai chữ hơi sát",
          message: "Hai chữ này đứng hơi sát nhau, con để cách nhau bằng một con chữ o nhé!",
          blobIds: [g.left.id, g.right.id],
        });
      } else if (g.li > standard.wordGapLi * THRESHOLDS.gapTooFar) {
        issues.push({
          type: "too_far",
          box,
          severity: "minor",
          label: "Hai chữ hơi xa",
          message: "Hai chữ này cách nhau hơi xa, con viết gần lại bằng một con chữ o thôi nhé!",
          blobIds: [g.left.id, g.right.id],
        });
      }
    });
  }

  // Độ nghiêng
  const slants = blobs.map((b) => b.slantDeg).filter((s): s is number => s != null);
  const slantMedian = slants.length ? median(slants) : null;
  const slantStd = slants.length >= 2 ? std(slants) : slants.length ? 0 : null;
  if (slantMedian != null && slantStd != null) {
    const limit = Math.max(12, slantStd * 2.5);
    for (const b of blobs) {
      if (b.slantDeg == null || Math.abs(b.slantDeg - slantMedian) <= limit) continue;
      issues.push({
        type: "slant",
        box: b,
        severity: "minor",
        label: b.slantDeg > slantMedian ? "Chữ ngả sang phải" : "Chữ ngả sang trái",
        message: "Chữ này hơi nghiêng so với các bạn chữ bên cạnh, con viết thẳng đều như các chữ khác nhé!",
        blobIds: [b.id],
      });
    }
  }

  // ---------------------------------------------------------------- (6) điểm CV
  const sizeScore = (() => {
    if (!lines.length) return null;
    const devs = xHeightsLi.map((x) => Math.abs(x / standard.xHeightLi - 1));
    const consistency = xHeightsLi.length >= 2 ? std(xHeightsLi) / mean(xHeightsLi) : 0;
    // Không có lưới thì không biết chữ to/nhỏ tuyệt đối — chỉ chấm độ đều.
    const absPenalty = gridReliable ? 120 * Math.max(0, mean(devs) - 0.1) : 0;
    return clamp(100 - absPenalty - 150 * Math.max(0, consistency - 0.08));
  })();

  const alignmentScore = (() => {
    if (baselineStd == null) return null;
    let s = 100 - 60 * Math.max(0, baselineStd - 0.25);
    if (ruledOffset != null) s -= 50 * Math.max(0, ruledOffset - 0.25);
    return clamp(s);
  })();

  const slantScore = (() => {
    if (slantMedian == null || slantStd == null) return null;
    const dev = Math.abs(slantMedian - expectedSlantDeg);
    return clamp(
      100 -
        3 * Math.max(0, dev - THRESHOLDS.slantToleranceDeg) -
        4 * Math.max(0, slantStd - THRESHOLDS.slantConsistencyDeg),
    );
  })();

  const spacingScore = (() => {
    if (wordGapsLi.length === 0) return null;
    const inRange =
      wordGapsLi.filter(
        (g) =>
          g >= standard.wordGapLi * THRESHOLDS.gapTooClose &&
          g <= standard.wordGapLi * THRESHOLDS.gapTooFar,
      ).length / wordGapsLi.length;
    const cv = wordGapsLi.length >= 2 ? std(wordGapsLi) / Math.max(0.05, mean(wordGapsLi)) : 0;
    return clamp(100 * (0.65 * inRange + 0.35 * Math.max(0, 1 - Math.max(0, cv - 0.2) / 0.8)));
  })();

  return {
    width,
    height,
    grid: {
      detected: gridReliable,
      liPx: gridReliable ? round2(grid!.liPx) : null,
      phase: gridReliable ? grid!.phase : null,
    },
    unitPx: unit,
    lines,
    blobs,
    wordGapsLi,
    issues,
    scores: {
      size: roundOrNull(sizeScore),
      alignment: roundOrNull(alignmentScore),
      slant: roundOrNull(slantScore),
      spacing: roundOrNull(spacingScore),
    },
    summary: {
      grid_detected: gridReliable,
      li_px: gridReliable ? round2(grid!.liPx) : null,
      line_count: lines.length,
      word_count: blobs.length,
      x_height_li: xHeightsLi.map(round2),
      slant_deg:
        slantMedian != null && slantStd != null
          ? { median: round2(slantMedian), std: round2(slantStd) }
          : null,
      word_gap_li: wordGapsLi.length
        ? {
            mean: round2(mean(wordGapsLi)),
            cv: round2(wordGapsLi.length >= 2 ? std(wordGapsLi) / Math.max(0.05, mean(wordGapsLi)) : 0),
            values: wordGapsLi.map(round2),
          }
        : null,
      baseline_std_li: baselineStd != null ? round2(baselineStd) : null,
      ruled_line_offset_li: ruledOffset != null ? round2(ruledOffset) : null,
    },
  };
}

// ============================================================================
// Lưới ô ly
// ============================================================================

/**
 * Profile "độ đậm dòng kẻ" theo hàng (và cột) trên ảnh gốc, bỏ qua pixel mực,
 * khử nền chậm biến thiên, rồi tìm chu kỳ bằng tự tương quan → khoảng cách 1 li.
 */
export function detectGrid(rgb: Uint8Array, ink: Uint8Array, width: number, height: number) {
  const rowP = new Float64Array(height);
  const rowN = new Float64Array(height);
  const colP = new Float64Array(width);
  const colN = new Float64Array(width);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (ink[i]) continue;
      const p = i * 3;
      const r = rgb[p], g = rgb[p + 1], b = rgb[p + 2];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const v = 255 - mn + 0.5 * (mx - mn);
      rowP[y] += v; rowN[y]++;
      colP[x] += v; colN[x]++;
    }
  }
  for (let y = 0; y < height; y++) rowP[y] = rowN[y] ? rowP[y] / rowN[y] : 0;
  for (let x = 0; x < width; x++) colP[x] = colN[x] ? colP[x] / colN[x] : 0;

  const rows = findPeriod(rowP);
  const cols = findPeriod(colP);
  if (rows && cols && Math.abs(rows.period - cols.period) / rows.period < 0.2) {
    // Ô ly vuông: hai chiều khớp → tin cậy cao, lấy trung bình.
    return { liPx: (rows.period + cols.period) / 2, phase: rows.phase };
  }
  if (rows && cols) {
    // Ô ly vuông: nếu một chiều là bội số của chiều kia thì chiều lớn đã bắt nhầm dòng đậm.
    const small = Math.min(rows.period, cols.period);
    const ratio = Math.max(rows.period, cols.period) / small;
    if (Math.round(ratio) >= 2 && Math.abs(ratio - Math.round(ratio)) < 0.08) {
      return { liPx: small, phase: rows.phase };
    }
  }
  if (rows) return { liPx: rows.period, phase: rows.phase };
  if (cols) return { liPx: cols.period, phase: null };
  return null;
}

function findPeriod(profile: Float64Array) {
  const n = profile.length;
  if (n < 60) return null;
  const trend = smooth(profile, 15);
  const d = new Float64Array(n);
  let energy = 0;
  for (let i = 0; i < n; i++) {
    d[i] = profile[i] - trend[i];
    energy += d[i] * d[i];
  }
  if (energy === 0) return null;

  const maxLag = Math.min(160, Math.floor(n / 4));
  const ac = new Float64Array(maxLag + 2);
  for (let lag = 4; lag <= maxLag + 1; lag++) {
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += d[i] * d[i + lag];
    ac[lag] = (s / energy) * (n / (n - lag));
  }

  // Dưới 10px là không đáng tin: JPEG tự tạo lưới khối 8px trên mọi ảnh.
  const minLag = 10;
  let best = -1;
  for (let lag = minLag; lag <= maxLag; lag++) {
    if (ac[lag] > ac[lag - 1] && ac[lag] >= ac[lag + 1] && (best < 0 || ac[lag] > ac[best])) best = lag;
  }
  if (best < 0 || ac[best] < 0.2) return null;

  // Tự tương quan có đỉnh ở mọi bội số của chu kỳ (20, 40, 60…), và dòng kẻ đậm mỗi 4 li
  // làm đỉnh ở 4 li mạnh hơn hẳn đỉnh ở 1 li. Ô ly là chu kỳ cơ bản: đỉnh nhỏ nhất mà
  // đỉnh mạnh nhất là bội số của nó, và mọi bội số ở giữa đều có đỉnh (lọc nhiễu lẻ).
  // Ngưỡng đo thực nghiệm: đỉnh giả của JPEG (khối 8/16px) tới 0,19; ô ly thật có dòng
  // đậm mỗi 4 li thấp nhất 0,23 so với đỉnh mạnh nhất.
  const floor = 0.21 * ac[best];
  const peakNear = (lag: number) => {
    for (let l = lag - 1; l <= lag + 1; l++) {
      if (l >= 5 && l <= maxLag && ac[l] >= floor && ac[l] >= ac[l - 1] && ac[l] >= ac[l + 1]) return true;
    }
    return false;
  };
  for (let lag = minLag; lag < best; lag++) {
    if (!(ac[lag] > ac[lag - 1] && ac[lag] >= ac[lag + 1] && ac[lag] >= floor)) continue;
    const multiple = Math.round(best / lag);
    if (multiple < 2 || Math.abs(best - multiple * lag) > 1 + multiple * 0.1) continue;
    let comb = true;
    for (let k = 2; k < multiple && comb; k++) comb = peakNear(k * lag);
    if (comb) {
      best = lag;
      break;
    }
  }

  // Nội suy parabol để lấy chu kỳ dưới-pixel
  const a = ac[best - 1], b = ac[best], c = ac[best + 1];
  const denom = a - 2 * b + c;
  const period = best + (denom !== 0 ? (0.5 * (a - c)) / denom : 0);

  let bestPhase = 0;
  let bestScore = -Infinity;
  for (let phi = 0; phi < period; phi++) {
    let s = 0;
    for (let k = phi; k < n; k += period) s += d[Math.round(k)] ?? 0;
    if (s > bestScore) {
      bestScore = s;
      bestPhase = phi;
    }
  }
  return { period, phase: bestPhase };
}

// ============================================================================
// Độ nghiêng
// ============================================================================

/**
 * Xiên (shear) tập điểm theo góc θ; góc làm histogram cột "nhọn" nhất (tổng bình
 * phương lớn nhất) là góc nghiêng của nét dọc. Dương = nghiêng sang phải.
 */
export function estimateSlant(xs: number[], ys: number[]) {
  const maxY = Math.max(...ys);
  const score = (deg: number) => {
    const t = Math.tan((deg * Math.PI) / 180);
    const hist = new Map<number, number>();
    for (let i = 0; i < xs.length; i++) {
      const key = Math.round(xs[i] - (maxY - ys[i]) * t);
      hist.set(key, (hist.get(key) ?? 0) + 1);
    }
    let s = 0;
    for (const v of hist.values()) s += v * v;
    return s;
  };
  let best = 0, bestS = -1;
  for (let deg = -35; deg <= 35; deg += 2.5) {
    const s = score(deg);
    if (s > bestS) { bestS = s; best = deg; }
  }
  const coarse = best;
  for (let deg = coarse - 2; deg <= coarse + 2; deg += 0.5) {
    const s = score(deg);
    if (s > bestS) { bestS = s; best = deg; }
  }
  return best;
}

// ============================================================================
// Tiện ích
// ============================================================================

type Comp = PxBox & { id: number; area: number; meanY: number };

function labelComponents(mask: Uint8Array, width: number, height: number) {
  const labels = new Int32Array(width * height);
  const stack = new Int32Array(width * height);
  const comps: Comp[] = [];
  let next = 0;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start]) continue;
    const id = ++next;
    let top = 0, area = 0, sumY = 0;
    let x0 = width, y0 = height, x1 = -1, y1 = -1;
    stack[top++] = start;
    labels[start] = id;
    while (top > 0) {
      const i = stack[--top];
      const x = i % width, y = (i / width) | 0;
      area++; sumY += y;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          const j = yy * width + xx;
          if (mask[j] && !labels[j]) {
            labels[j] = id;
            stack[top++] = j;
          }
        }
      }
    }
    comps.push({ id, x0, y0, x1, y1, area, meanY: sumY / area });
  }
  return { labels, comps };
}

/** Số đoạn mực liên tiếp (thuộc các thành phần `ids`) trên mỗi hàng y0..y1. */
function runProfile(
  labels: Int32Array,
  width: number,
  y0: number,
  y1: number,
  x0: number,
  x1: number,
  ids: Set<number>,
) {
  const out = new Float64Array(y1 - y0 + 1);
  for (let y = y0; y <= y1; y++) {
    const row = y * width;
    let inside = false;
    let runs = 0;
    for (let x = x0; x <= x1; x++) {
      const on = ids.has(labels[row + x]);
      if (on && !inside) runs++;
      inside = on;
    }
    out[y - y0] = runs;
  }
  return out;
}

function blobPixels(labels: Int32Array, width: number, box: PxBox, ids: Set<number>) {
  const rows = new Float64Array(box.y1 - box.y0 + 1);
  const xs: number[] = [];
  const ys: number[] = [];
  const total = (box.x1 - box.x0 + 1) * (box.y1 - box.y0 + 1);
  const stride = Math.max(1, Math.round(Math.sqrt(total / 20000)));
  for (let y = box.y0; y <= box.y1; y++) {
    const row = y * width;
    for (let x = box.x0; x <= box.x1; x++) {
      if (!ids.has(labels[row + x])) continue;
      rows[y - box.y0]++;
      if ((x + y) % stride === 0) {
        xs.push(x);
        ys.push(y);
      }
    }
  }
  // Chân thân chữ: hàng thấp nhất còn đủ mật độ (bỏ qua nét khuyết dưới mảnh)
  const peak = Math.max(...rows);
  let coreBottom = box.y1;
  for (let k = rows.length - 1; k >= 0; k--) {
    if (rows[k] >= peak * 0.3) {
      coreBottom = box.y0 + k;
      break;
    }
  }
  return { coreBottom, xs, ys };
}

/**
 * Trong một dòng: khoảng hở nào là khoảng cách GIỮA CÁC CHỮ (không phải giữa các
 * con chữ rời trong một chữ)? Chia 2 cụm (k-means 1D); nếu không tách bạch, coi tất
 * cả là khoảng cách giữa chữ (bài luyện viết lặp lại, chữ viết liền nét).
 */
function selectWordGaps(gaps: number[], expected: number) {
  const idx = gaps.map((_, i) => i);
  if (gaps.length < 4) return new Set(idx);
  const sorted = [...gaps].sort((a, b) => a - b);
  let bestSplit = -1, bestCost = Infinity;
  for (let k = 1; k < sorted.length; k++) {
    const lo = sorted.slice(0, k), hi = sorted.slice(k);
    const cost = variance(lo) * lo.length + variance(hi) * hi.length;
    if (cost < bestCost) { bestCost = cost; bestSplit = k; }
  }
  const lo = sorted.slice(0, bestSplit), hi = sorted.slice(bestSplit);
  // Cụm "khoảng cách trong chữ" phải đủ nhiều phần tử; một khoảng hở nhỏ lẻ loi giữa
  // các khoảng đều nhau gần như chắc chắn là hai chữ viết quá sát.
  const separated =
    lo.length >= Math.max(2, gaps.length * 0.25) &&
    mean(hi) >= 2 * Math.max(0.05, mean(lo)) &&
    mean(hi) >= expected * 0.6;
  if (!separated) return new Set(idx);
  const thr = (sorted[bestSplit - 1] + sorted[bestSplit]) / 2;
  return new Set(idx.filter((i) => gaps[i] >= thr));
}

function findPeaks(signal: Float64Array, relThreshold: number, minSep: number) {
  let max = 0;
  for (const v of signal) if (v > max) max = v;
  const candidates: number[] = [];
  for (let i = 1; i < signal.length - 1; i++) {
    if (signal[i] >= max * relThreshold && signal[i] >= signal[i - 1] && signal[i] > signal[i + 1]) {
      candidates.push(i);
    }
  }
  candidates.sort((a, b) => signal[b] - signal[a]);
  const accepted: number[] = [];
  for (const c of candidates) if (accepted.every((a) => Math.abs(a - c) >= minSep)) accepted.push(c);
  return accepted.sort((a, b) => a - b);
}

function peaksToBands(peaks: number[], signal: Float64Array, height: number) {
  if (peaks.length === 0) return [{ top: 0, bottom: height - 1 }];
  const cuts: number[] = [];
  for (let i = 0; i + 1 < peaks.length; i++) {
    let m = peaks[i];
    for (let y = peaks[i]; y <= peaks[i + 1]; y++) if (signal[y] < signal[m]) m = y;
    cuts.push(m);
  }
  return peaks.map((_, i) => ({
    top: i === 0 ? 0 : cuts[i - 1] + 1,
    bottom: i === peaks.length - 1 ? height - 1 : cuts[i],
  }));
}

function smooth(src: Float64Array, radius: number) {
  const out = new Float64Array(src.length);
  let acc = 0;
  const prefix = new Float64Array(src.length + 1);
  for (let i = 0; i < src.length; i++) prefix[i + 1] = acc += src[i];
  for (let i = 0; i < src.length; i++) {
    const a = Math.max(0, i - radius), b = Math.min(src.length, i + radius + 1);
    out[i] = (prefix[b] - prefix[a]) / (b - a);
  }
  return out;
}

export function unionBox(a: PxBox, b: PxBox): PxBox {
  return {
    x0: Math.min(a.x0, b.x0),
    y0: Math.min(a.y0, b.y0),
    x1: Math.max(a.x1, b.x1),
    y1: Math.max(a.y1, b.y1),
  };
}

function emptyMeasurements(width: number, height: number): Measurements {
  return {
    width,
    height,
    grid: { detected: false, liPx: null, phase: null },
    unitPx: 0,
    lines: [],
    blobs: [],
    wordGapsLi: [],
    issues: [],
    scores: { size: null, alignment: null, slant: null, spacing: null },
    summary: {
      grid_detected: false,
      li_px: null,
      line_count: 0,
      word_count: 0,
      x_height_li: [],
      slant_deg: null,
      word_gap_li: null,
      baseline_std_li: null,
      ruled_line_offset_li: null,
    },
  };
}

const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const variance = (a: number[]) => {
  const m = mean(a);
  return a.length ? a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length : 0;
};
const std = (a: number[]) => Math.sqrt(variance(a));
function percentile(a: number[], p: number) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}
function median(a: number[]) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const clamp = (v: number) => Math.max(0, Math.min(100, v));
const round2 = (v: number) => Math.round(v * 100) / 100;
const roundOrNull = (v: number | null) => (v == null ? null : Math.round(v));
const fmtLi = (v: number) => String(v).replace(".", ",");
