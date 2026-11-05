/**
 * Các tiện ích phía trình duyệt: cắt khung từ camera, đọc ảnh từ thư viện,
 * chạy pipeline tiền xử lý trong Web Worker và xuất Blob sẵn sàng upload.
 */
import {
  grayToRgba,
  preprocessHandwriting,
  type PreprocessOptions,
  type PreprocessResult,
} from "./preprocess";

/** Cạnh dài tối đa của ảnh đưa vào xử lý — đủ nét cho AI, đủ nhẹ cho điện thoại. */
export const MAX_SIDE = 1800;

export type Rect = { x: number; y: number; width: number; height: number };

export type ProcessedCapture = {
  /** Ảnh đã xử lý (xám, nền trắng, crop gọn) — dùng để chấm điểm AI. */
  processed: Blob;
  /** Ảnh màu gốc, cùng vùng crop & kích thước với `processed` (còn giữ dòng kẻ ô ly). */
  original: Blob;
  width: number;
  height: number;
  stats: PreprocessResult["stats"];
};

/**
 * Chuyển khung hướng dẫn (toạ độ CSS trên phần tử <video> hiển thị object-cover)
 * sang toạ độ pixel thực của luồng video.
 */
export function guideRectToVideoRect(video: HTMLVideoElement, guide: Rect): Rect {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const box = video.getBoundingClientRect();
  const scale = Math.max(box.width / vw, box.height / vh); // object-fit: cover
  const offsetX = (box.width - vw * scale) / 2;
  const offsetY = (box.height - vh * scale) / 2;

  const x = Math.max(0, (guide.x - offsetX) / scale);
  const y = Math.max(0, (guide.y - offsetY) / scale);
  return {
    x,
    y,
    width: Math.min(vw - x, guide.width / scale),
    height: Math.min(vh - y, guide.height / scale),
  };
}

/** Vẽ vùng `src` của nguồn ảnh lên canvas, thu nhỏ nếu vượt MAX_SIDE. */
export function drawRegion(source: CanvasImageSource, src: Rect) {
  const scale = Math.min(1, MAX_SIDE / Math.max(src.width, src.height));
  const width = Math.round(src.width * scale);
  const height = Math.round(src.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, src.x, src.y, src.width, src.height, 0, 0, width, height);
  return canvas;
}

/** Chụp khung hình hiện tại của video, chỉ lấy phần nằm trong khung hướng dẫn. */
export function captureVideoFrame(video: HTMLVideoElement, guide: Rect) {
  return drawRegion(video, guideRectToVideoRect(video, guide));
}

/** Đọc ảnh chọn từ thư viện (tôn trọng EXIF xoay), cắt giữa theo tỉ lệ khung. */
export async function loadFileToCanvas(file: File, aspect: number) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    let width = bitmap.width;
    let height = bitmap.height;
    if (width / height > aspect) width = height * aspect;
    else height = width / aspect;
    return drawRegion(bitmap, {
      x: (bitmap.width - width) / 2,
      y: (bitmap.height - height) / 2,
      width,
      height,
    });
  } finally {
    bitmap.close();
  }
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

let worker: Worker | null = null;
let workerBroken = false;
let nextId = 0;
const pending = new Map<
  number,
  { resolve: (r: PreprocessResult) => void; reject: (e: Error) => void }
>();

function getWorker() {
  if (worker || typeof Worker === "undefined") return worker;
  try {
    worker = new Worker(new URL("./preprocess.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (event) => {
      const { id, result, error } = event.data;
      const job = pending.get(id);
      if (!job) return;
      pending.delete(id);
      if (error) job.reject(new Error(error));
      else job.resolve(result);
    };
    worker.onerror = () => {
      // Worker hỏng: huỷ các job đang chờ, lần sau sẽ chạy trên main thread.
      pending.forEach((job) => job.reject(new Error("worker-failed")));
      pending.clear();
      worker?.terminate();
      worker = null;
      workerBroken = true;
    };
  } catch {
    workerBroken = true;
    worker = null;
  }
  return worker;
}

function runPreprocess(image: ImageData, options?: PreprocessOptions) {
  const w = workerBroken ? null : getWorker();
  if (!w) {
    return Promise.resolve(
      preprocessHandwriting(image.data, image.width, image.height, options),
    );
  }
  return new Promise<PreprocessResult>((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    // Sao chép buffer để canvas gốc vẫn dùng được nếu phải chạy lại.
    const data = new Uint8ClampedArray(image.data);
    w.postMessage(
      { id, data, width: image.width, height: image.height, options },
      [data.buffer],
    );
  }).catch(() => preprocessHandwriting(image.data, image.width, image.height, options));
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Không xuất được ảnh"))),
      type,
      quality,
    ),
  );
}

/** Chạy toàn bộ pipeline trên canvas đã chụp và trả về 2 Blob JPEG. */
export async function processCanvas(
  canvas: HTMLCanvasElement,
  options?: PreprocessOptions,
): Promise<ProcessedCapture> {
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);

  const result = await runPreprocess(image, options);

  // Ảnh gốc được cắt CÙNG vùng với ảnh đã xử lý để hai ảnh trùng toạ độ pixel:
  // backend chấm điểm đo dòng kẻ ô ly trên ảnh gốc và đo nét chữ trên ảnh xử lý.
  const { crop } = result;
  const originalCanvas = document.createElement("canvas");
  originalCanvas.width = crop.width;
  originalCanvas.height = crop.height;
  originalCanvas
    .getContext("2d")!
    .drawImage(canvas, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
  const original = await canvasToBlob(originalCanvas, "image/jpeg", 0.9);

  const out = document.createElement("canvas");
  out.width = result.width;
  out.height = result.height;
  out
    .getContext("2d")!
    .putImageData(new ImageData(grayToRgba(result), result.width, result.height), 0, 0);

  return {
    processed: await canvasToBlob(out, "image/jpeg", 0.92),
    original,
    width: result.width,
    height: result.height,
    stats: result.stats,
  };
}
