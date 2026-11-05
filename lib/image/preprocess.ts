/**
 * Pipeline tiền xử lý ảnh bài viết tay trên giấy ô ly — thuần TypeScript,
 * không phụ thuộc DOM nên chạy được trong Web Worker lẫn main thread.
 *
 *  RGBA ──► (1) kênh "mực" (max-channel)    — đường kẻ hồng/xanh/tím nhạt gần như biến mất
 *       ──► (2) cân bằng chiếu sáng          — chia cho nền ước lượng (flat-field)
 *       ──► (3) giãn tương phản theo percentile + tinh chỉnh sáng/tương phản
 *       ──► (4) ngưỡng thích nghi (integral image) + ngưỡng trần chặn nét nhạt
 *       ──► (5) xoá đường kẻ thẳng dài còn sót (giữ chỗ nét mực đậm cắt qua)
 *       ──► (6) lọc đốm nhiễu (connected components)
 *       ──► (7) tự động crop vùng chữ + lề
 *       ──► ảnh xám: nền trắng tinh, nét chữ giữ sắc độ (không nhị phân cứng)
 */

export type PreprocessOptions = {
  /** Kích thước cửa sổ ngưỡng thích nghi, tính theo tỉ lệ cạnh ngắn (mặc định 1/24). */
  windowRatio?: number;
  /** Độ lệch C: pixel là mực nếu tối hơn trung bình cục bộ ít nhất C (mặc định 14). */
  adaptiveC?: number;
  /** Ngưỡng trần: pixel sáng hơn mức này không bao giờ là mực (mặc định 205). */
  maxInkLevel?: number;
  /** Nét đậm hơn mức này được giữ lại kể cả khi nằm trên đường kẻ (mặc định 120). */
  strongInkLevel?: number;
  /** Chiều dài tối thiểu (tỉ lệ cạnh) để coi một đoạn thẳng là đường kẻ (mặc định 0.2). */
  lineLengthRatio?: number;
  /** Tinh chỉnh độ sáng, -100..100 (mặc định 0). */
  brightness?: number;
  /** Tinh chỉnh tương phản, -100..100 (mặc định 0). */
  contrast?: number;
  /** Tự động crop sát vùng chữ (mặc định true). */
  autoCrop?: boolean;
  /** Lề giữ lại quanh vùng chữ, tỉ lệ cạnh dài (mặc định 0.04). */
  cropMarginRatio?: number;
};

export type GrayImage = { data: Uint8ClampedArray; width: number; height: number };

export type PreprocessResult = GrayImage & {
  /** Vùng crop trên ảnh đầu vào (pixel). */
  crop: { x: number; y: number; width: number; height: number };
  stats: {
    inkRatio: number;
    removedLinePixels: number;
    paperLevel: number;
    inkLevel: number;
    ms: number;
  };
};

const DEFAULTS: Required<PreprocessOptions> = {
  windowRatio: 1 / 24,
  adaptiveC: 14,
  maxInkLevel: 205,
  strongInkLevel: 120,
  lineLengthRatio: 0.2,
  brightness: 0,
  contrast: 0,
  autoCrop: true,
  cropMarginRatio: 0.04,
};

export function preprocessHandwriting(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: PreprocessOptions = {},
): PreprocessResult {
  const t0 = performance.now();
  const o = { ...DEFAULTS, ...options };
  const n = width * height;

  // (1) Kênh mực. Mực (đen/xanh đậm/tím đậm/bút chì) tối ở MỌI kênh màu,
  // còn đường kẻ ô ly hồng/xanh/tím nhạt có ít nhất một kênh rất sáng.
  // Lấy max(R,G,B) trộn chút độ sáng để giữ tương phản cho bút chì.
  const ink = new Uint8ClampedArray(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const r = rgba[p], g = rgba[p + 1], b = rgba[p + 2];
    const max = r > g ? (r > b ? r : b) : g > b ? g : b;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    ink[i] = 0.8 * max + 0.2 * lum;
  }

  // (2) Cân bằng chiếu sáng: ước lượng nền giấy bằng max-pool + làm mờ ở độ phân giải thấp.
  const background = estimateBackground(ink, width, height);
  const norm = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) {
    const bg = background[i] || 1;
    norm[i] = (ink[i] / bg) * 255;
  }

  // (3) Giãn tương phản: mực (percentile thấp) → 0, giấy (trung vị) → 255.
  const hist = histogram(norm);
  const inkLevel = percentile(hist, n, 0.005);
  const paperLevel = Math.max(inkLevel + 30, percentile(hist, n, 0.5));
  const userContrast = 1 + o.contrast / 100;
  const userBrightness = o.brightness * 1.28;
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) {
    let s = ((v - inkLevel) / (paperLevel - inkLevel)) * 255;
    s = (s - 128) * userContrast + 128 + userBrightness;
    lut[v] = s;
  }
  const enhanced = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) enhanced[i] = lut[norm[i]];

  // (4) Ngưỡng thích nghi (trung bình cục bộ qua integral image).
  const win = Math.max(15, Math.round(Math.min(width, height) * o.windowRatio) | 1);
  const mask = adaptiveThreshold(enhanced, width, height, win, o.adaptiveC, o.maxInkLevel);

  // (5) Xoá đường kẻ thẳng dài còn sót (lề đỏ, đường kẻ đậm…).
  const removedLinePixels = removeRuledLines(
    mask,
    enhanced,
    width,
    height,
    Math.round(width * o.lineLengthRatio),
    Math.round(height * o.lineLengthRatio),
    o.strongInkLevel,
  );

  // (6) Lọc đốm nhiễu nhỏ (bụi, vân giấy, chấm mực rơi).
  const minBlob = Math.max(6, Math.round(n * 0.000008));
  const bbox = removeSmallComponents(mask, width, height, minBlob);

  // Nới mask 1px để giữ viền khử răng cưa của nét chữ.
  const soft = dilate(mask, width, height);

  // (7) Crop.
  let crop = { x: 0, y: 0, width, height };
  if (o.autoCrop && bbox) {
    const margin = Math.max(16, Math.round(Math.max(width, height) * o.cropMarginRatio));
    const x0 = Math.max(0, bbox.minX - margin);
    const y0 = Math.max(0, bbox.minY - margin);
    const x1 = Math.min(width, bbox.maxX + 1 + margin);
    const y1 = Math.min(height, bbox.maxY + 1 + margin);
    // Không crop quá nhỏ (tránh trường hợp chỉ bắt được 1 chữ do nhiễu).
    if (x1 - x0 >= width * 0.15 && y1 - y0 >= height * 0.08) {
      crop = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
    }
  }

  const out = new Uint8ClampedArray(crop.width * crop.height);
  let inkCount = 0;
  for (let y = 0; y < crop.height; y++) {
    const srcRow = (y + crop.y) * width + crop.x;
    const dstRow = y * crop.width;
    for (let x = 0; x < crop.width; x++) {
      const i = srcRow + x;
      if (soft[i]) {
        out[dstRow + x] = enhanced[i];
        if (mask[i]) inkCount++;
      } else {
        out[dstRow + x] = 255;
      }
    }
  }

  return {
    data: out,
    width: crop.width,
    height: crop.height,
    crop,
    stats: {
      inkRatio: inkCount / (crop.width * crop.height),
      removedLinePixels,
      paperLevel,
      inkLevel,
      ms: Math.round(performance.now() - t0),
    },
  };
}

/** Chuyển ảnh xám sang RGBA để vẽ lên canvas. */
export function grayToRgba(gray: GrayImage): Uint8ClampedArray<ArrayBuffer> {
  const rgba = new Uint8ClampedArray(gray.width * gray.height * 4);
  for (let i = 0, p = 0; i < gray.data.length; i++, p += 4) {
    const v = gray.data[i];
    rgba[p] = rgba[p + 1] = rgba[p + 2] = v;
    rgba[p + 3] = 255;
  }
  return rgba;
}

// ---------------------------------------------------------------------------
// Các bước con
// ---------------------------------------------------------------------------

/**
 * Nền giấy: max-pool theo khối (xoá nét mực), làm mờ, rồi nội suy song tuyến về
 * kích thước gốc. Rẻ hơn nhiều so với morphological closing ở độ phân giải đầy đủ.
 */
function estimateBackground(src: Uint8ClampedArray, width: number, height: number) {
  const block = Math.max(8, Math.round(Math.min(width, height) / 48));
  const sw = Math.ceil(width / block);
  const sh = Math.ceil(height / block);
  const small = new Float32Array(sw * sh);

  for (let by = 0; by < sh; by++) {
    for (let bx = 0; bx < sw; bx++) {
      let m = 0;
      const yEnd = Math.min(height, (by + 1) * block);
      const xEnd = Math.min(width, (bx + 1) * block);
      for (let y = by * block; y < yEnd; y++) {
        const row = y * width;
        for (let x = bx * block; x < xEnd; x++) if (src[row + x] > m) m = src[row + x];
      }
      small[by * sw + bx] = m;
    }
  }

  // Làm mờ 2 lượt box 3x3 trên lưới nhỏ để nền mượt.
  let cur = small;
  for (let pass = 0; pass < 2; pass++) {
    const next = new Float32Array(sw * sh);
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        let sum = 0, cnt = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= sh) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= sw) continue;
            sum += cur[yy * sw + xx];
            cnt++;
          }
        }
        next[y * sw + x] = sum / cnt;
      }
    }
    cur = next;
  }

  const bg = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const fy = Math.min(sh - 1, Math.max(0, (y + 0.5) / block - 0.5));
    const y0 = Math.floor(fy), y1 = Math.min(sh - 1, y0 + 1), wy = fy - y0;
    for (let x = 0; x < width; x++) {
      const fx = Math.min(sw - 1, Math.max(0, (x + 0.5) / block - 0.5));
      const x0 = Math.floor(fx), x1 = Math.min(sw - 1, x0 + 1), wx = fx - x0;
      const top = cur[y0 * sw + x0] * (1 - wx) + cur[y0 * sw + x1] * wx;
      const bot = cur[y1 * sw + x0] * (1 - wx) + cur[y1 * sw + x1] * wx;
      bg[y * width + x] = top * (1 - wy) + bot * wy;
    }
  }
  return bg;
}

function histogram(src: Uint8ClampedArray) {
  const h = new Uint32Array(256);
  for (let i = 0; i < src.length; i++) h[src[i]]++;
  return h;
}

function percentile(hist: Uint32Array, total: number, p: number) {
  const target = total * p;
  let acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= target) return v;
  }
  return 255;
}

function adaptiveThreshold(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  win: number,
  c: number,
  maxInk: number,
) {
  const w1 = width + 1;
  const integral = new Float64Array(w1 * (height + 1));
  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    for (let x = 0; x < width; x++) {
      rowSum += src[y * width + x];
      integral[(y + 1) * w1 + x + 1] = integral[y * w1 + x + 1] + rowSum;
    }
  }

  const half = win >> 1;
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - half), y1 = Math.min(height, y + half + 1);
    for (let x = 0; x < width; x++) {
      const v = src[y * width + x];
      if (v > maxInk) continue;
      const x0 = Math.max(0, x - half), x1 = Math.min(width, x + half + 1);
      const sum =
        integral[y1 * w1 + x1] - integral[y0 * w1 + x1] -
        integral[y1 * w1 + x0] + integral[y0 * w1 + x0];
      const mean = sum / ((x1 - x0) * (y1 - y0));
      if (v < mean - c) mask[y * width + x] = 1;
    }
  }
  return mask;
}

/**
 * Tìm các đoạn mask nằm ngang/dọc dài liên tục (đặc trưng của đường kẻ, không phải
 * chữ viết tay) và xoá chúng — trừ những pixel rất đậm (nét mực cắt qua đường kẻ).
 */
function removeRuledLines(
  mask: Uint8Array,
  level: Uint8ClampedArray,
  width: number,
  height: number,
  minH: number,
  minV: number,
  strongInk: number,
) {
  const line = new Uint8Array(width * height);
  // Đường kẻ mờ thường bị nhiễu làm đứt quãng → cho phép nhảy qua khoảng hở nhỏ.
  const maxGap = Math.max(3, Math.round(Math.min(width, height) / 300));

  // Quét một đường (hàng hoặc cột) và đánh dấu các đoạn đủ dài.
  const scan = (len: number, minLen: number, idx: (k: number) => number) => {
    let start = -1;
    let last = -1;
    for (let k = 0; k <= len; k++) {
      const on = k < len && mask[idx(k)];
      if (on) {
        if (start < 0) start = k;
        last = k;
      } else if (start >= 0 && (k === len || k - last > maxGap)) {
        if (last - start + 1 >= minLen) {
          for (let j = start; j <= last; j++) if (mask[idx(j)]) line[idx(j)] = 1;
        }
        start = -1;
      }
    }
  };

  for (let y = 0; y < height; y++) scan(width, minH, (x) => y * width + x);
  for (let x = 0; x < width; x++) scan(height, minV, (y) => y * width + x);

  let removed = 0;
  for (let i = 0; i < mask.length; i++) {
    if (line[i] && level[i] > strongInk) {
      mask[i] = 0;
      removed++;
    }
  }
  return removed;
}

/** Xoá thành phần liên thông (8-hướng) nhỏ hơn minArea; trả về bbox của phần còn lại. */
function removeSmallComponents(mask: Uint8Array, width: number, height: number, minArea: number) {
  const labels = new Int32Array(width * height);
  const stack = new Int32Array(width * height);
  let label = 0;
  let minX = width, minY = height, maxX = -1, maxY = -1;

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start]) continue;
    label++;
    let top = 0, area = 0;
    let cMinX = width, cMinY = height, cMaxX = -1, cMaxY = -1;
    stack[top++] = start;
    labels[start] = label;
    const members: number[] = [];

    while (top > 0) {
      const i = stack[--top];
      members.push(i);
      area++;
      const x = i % width, y = (i / width) | 0;
      if (x < cMinX) cMinX = x;
      if (x > cMaxX) cMaxX = x;
      if (y < cMinY) cMinY = y;
      if (y > cMaxY) cMaxY = y;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          const j = yy * width + xx;
          if (mask[j] && !labels[j]) {
            labels[j] = label;
            stack[top++] = j;
          }
        }
      }
    }

    if (area < minArea) {
      for (const i of members) mask[i] = 0;
    } else {
      if (cMinX < minX) minX = cMinX;
      if (cMinY < minY) minY = cMinY;
      if (cMaxX > maxX) maxX = cMaxX;
      if (cMaxY > maxY) maxY = cMaxY;
    }
  }

  return maxX < 0 ? null : { minX, minY, maxX, maxY };
}

function dilate(mask: Uint8Array, width: number, height: number) {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx >= 0 && xx < width) out[yy * width + xx] = 1;
        }
      }
    }
  }
  return out;
}
