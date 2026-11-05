"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  captureVideoFrame,
  loadFileToCanvas,
  processCanvas,
  type ProcessedCapture,
  type Rect,
} from "@/lib/image/capture";
import type { PreprocessOptions } from "@/lib/image/preprocess";

type Props = {
  /** Nhận ảnh đã xử lý khi phụ huynh bấm "Dùng ảnh này". */
  onConfirm: (capture: ProcessedCapture) => void | Promise<void>;
  onClose: () => void;
  /** Tỉ lệ khung hướng dẫn rộng/cao — mặc định 3:4 (trang vở dọc). */
  aspect?: number;
  options?: PreprocessOptions;
};

type Phase = "starting" | "live" | "processing" | "review" | "error";

// Khoảng chừa cho thanh trên / thanh nút dưới khi tính khung hướng dẫn (px).
const TOP_INSET = 72;
const BOTTOM_INSET = 176;
const LEVEL_TOLERANCE = 7; // độ

export default function CameraCapture({ onConfirm, onClose, aspect = 3 / 4, options }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<Phase>("starting");
  const [error, setError] = useState<string | null>(null);
  const [guide, setGuide] = useState<Rect | null>(null);
  const [torch, setTorch] = useState<{ supported: boolean; on: boolean }>({
    supported: false,
    on: false,
  });
  const [tilt, setTilt] = useState<{ beta: number; gamma: number } | null>(null);
  const [needsTiltPermission, setNeedsTiltPermission] = useState(false);
  const [result, setResult] = useState<ProcessedCapture | null>(null);
  const [previewUrls, setPreviewUrls] = useState<{ processed: string; original: string } | null>(
    null,
  );
  const [showOriginal, setShowOriginal] = useState(false);
  const [contrast, setContrast] = useState(options?.contrast ?? 0);
  const [submitting, setSubmitting] = useState(false);
  const [flash, setFlash] = useState(false);

  // ---------------------------------------------------------------- camera
  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    setPhase("starting");
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(
        window.isSecureContext
          ? "Trình duyệt không hỗ trợ camera. Hãy chọn ảnh từ thư viện."
          : "Camera chỉ hoạt động qua HTTPS. Hãy chọn ảnh từ thư viện.",
      );
      setPhase("error");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 2560 },
          height: { ideal: 1920 },
        },
      });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();

      const track = stream.getVideoTracks()[0];
      const caps = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & {
        torch?: boolean;
        focusMode?: string[];
      };
      setTorch({ supported: Boolean(caps.torch), on: false });
      if (caps.focusMode?.includes("continuous")) {
        track
          .applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] })
          .catch(() => {});
      }
      setPhase("live");
    } catch (e) {
      const name = e instanceof DOMException ? e.name : "";
      setError(
        name === "NotAllowedError"
          ? "Chưa được cấp quyền camera. Hãy bật quyền trong cài đặt trình duyệt, hoặc chọn ảnh từ thư viện."
          : name === "NotFoundError"
            ? "Không tìm thấy camera trên thiết bị này."
            : "Không mở được camera. Hãy thử lại hoặc chọn ảnh từ thư viện.",
      );
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    // Khởi động camera sau khi mount; setState xảy ra bất đồng bộ trong startCamera.
    const timer = setTimeout(startCamera, 0);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(timer);
      stopCamera();
      document.body.style.overflow = prevOverflow;
    };
  }, [startCamera, stopCamera]);

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const on = !torch.on;
    try {
      await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
      setTorch({ supported: true, on });
    } catch {
      setTorch({ supported: false, on: false });
    }
  }

  // ------------------------------------------------------- khung hướng dẫn
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const { width: cw, height: ch } = el.getBoundingClientRect();
      const availH = ch - TOP_INSET - BOTTOM_INSET;
      let width = Math.min(cw * 0.9, availH * 0.96 * aspect);
      let height = width / aspect;
      if (height > availH) {
        height = availH;
        width = height * aspect;
      }
      setGuide({
        x: (cw - width) / 2,
        y: TOP_INSET + (availH - height) / 2,
        width,
        height,
      });
    };
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspect]);

  // ----------------------------------------------- cân bằng (giữ máy song song mặt bàn)
  useEffect(() => {
    const DOE = (globalThis as { DeviceOrientationEvent?: unknown }).DeviceOrientationEvent as
      | { requestPermission?: () => Promise<string> }
      | undefined;
    if (!DOE) return;
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return;
      setTilt({ beta: e.beta, gamma: e.gamma });
    };
    window.addEventListener("deviceorientation", onOrient);
    // iOS 13+ cần người dùng chạm để cấp quyền cảm biến.
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (typeof DOE.requestPermission === "function") {
      timer = setTimeout(() => setNeedsTiltPermission(true), 0);
    }
    return () => {
      clearTimeout(timer);
      window.removeEventListener("deviceorientation", onOrient);
    };
  }, []);

  async function requestTiltPermission() {
    const DOE = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
    try {
      await DOE.requestPermission?.();
    } finally {
      setNeedsTiltPermission(false);
    }
  }

  const isLevel =
    tilt != null && Math.abs(tilt.beta) < LEVEL_TOLERANCE && Math.abs(tilt.gamma) < LEVEL_TOLERANCE;

  // ----------------------------------------------------------- xử lý ảnh
  const urlsRef = useRef<{ processed: string; original: string } | null>(null);
  const revokeUrls = useCallback(() => {
    if (!urlsRef.current) return;
    URL.revokeObjectURL(urlsRef.current.processed);
    URL.revokeObjectURL(urlsRef.current.original);
    urlsRef.current = null;
  }, []);

  const setPreview = useCallback(
    (capture: ProcessedCapture) => {
      revokeUrls();
      urlsRef.current = {
        processed: URL.createObjectURL(capture.processed),
        original: URL.createObjectURL(capture.original),
      };
      setPreviewUrls(urlsRef.current);
    },
    [revokeUrls],
  );

  useEffect(() => revokeUrls, [revokeUrls]);

  const runPipeline = useCallback(
    async (canvas: HTMLCanvasElement, contrastValue: number) => {
      setPhase("processing");
      try {
        const capture = await processCanvas(canvas, { ...options, contrast: contrastValue });
        setResult(capture);
        setPreview(capture);
        setShowOriginal(false);
        setPhase("review");
      } catch {
        setError("Xử lý ảnh thất bại. Hãy chụp lại.");
        setPhase("error");
      }
    },
    [options, setPreview],
  );

  function handleShutter() {
    const video = videoRef.current;
    if (!video || !guide || phase !== "live") return;
    navigator.vibrate?.(30);
    setFlash(true);
    setTimeout(() => setFlash(false), 180);

    const canvas = captureVideoFrame(video, guide);
    sourceCanvasRef.current = canvas;
    stopCamera();
    void runPipeline(canvas, contrast);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    stopCamera();
    setPhase("processing");
    try {
      const canvas = await loadFileToCanvas(file, aspect);
      sourceCanvasRef.current = canvas;
      await runPipeline(canvas, contrast);
    } catch {
      setError("Không đọc được ảnh này. Hãy chọn ảnh JPG hoặc PNG khác.");
      setPhase("error");
    }
  }

  function handleRetake() {
    setResult(null);
    sourceCanvasRef.current = null;
    void startCamera();
  }

  async function handleConfirm() {
    if (!result) return;
    setSubmitting(true);
    try {
      await onConfirm(result);
    } finally {
      setSubmitting(false);
    }
  }

  const fewInk = result != null && result.stats.inkRatio < 0.002;

  // ---------------------------------------------------------------- render
  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label="Chụp bài viết"
      className="fixed inset-0 z-50 overflow-hidden bg-black text-white select-none"
    >
      {/* Luồng camera */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className={`absolute inset-0 h-full w-full object-cover ${
          phase === "live" || phase === "starting" ? "" : "invisible"
        }`}
      />

      {/* Khung hướng dẫn + vùng tối bên ngoài */}
      {guide && (phase === "live" || phase === "starting") && (
        <div
          aria-hidden
          className={`pointer-events-none absolute rounded-2xl transition-colors ${
            isLevel ? "ring-4 ring-mint-400" : "ring-2 ring-white/80"
          }`}
          style={{
            left: guide.x,
            top: guide.y,
            width: guide.width,
            height: guide.height,
            boxShadow: "0 0 0 100vmax rgba(0,0,0,0.55)",
          }}
        >
          {(["top-0 left-0 border-t-4 border-l-4 rounded-tl-2xl",
             "top-0 right-0 border-t-4 border-r-4 rounded-tr-2xl",
             "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-2xl",
             "bottom-0 right-0 border-b-4 border-r-4 rounded-br-2xl"] as const).map((c) => (
            <span
              key={c}
              className={`absolute h-10 w-10 ${c} ${isLevel ? "border-mint-400" : "border-sun-400"}`}
            />
          ))}

          {/* Bọt thuỷ cân bằng */}
          {tilt && (
            <div className="absolute top-1/2 left-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/60">
              <span className="absolute top-1/2 left-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/50" />
              <span
                className={`absolute top-1/2 left-1/2 h-5 w-5 rounded-full transition-transform duration-100 ${
                  isLevel ? "bg-mint-400" : "bg-sun-400"
                }`}
                style={{
                  transform: `translate(calc(-50% + ${clamp(tilt.gamma, -30, 30)}px), calc(-50% + ${clamp(tilt.beta, -30, 30)}px))`,
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* Hiệu ứng chớp khi chụp */}
      {flash && <div className="pointer-events-none absolute inset-0 bg-white/70" />}

      {/* Thanh trên */}
      <div className="pt-safe absolute inset-x-0 top-0 z-10">
        <div className="flex h-16 items-center justify-between gap-3 px-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="grid h-12 w-12 place-items-center rounded-full bg-black/40 text-2xl active:scale-95"
          >
            ✕
          </button>
          <p className="flex-1 text-center text-sm font-bold drop-shadow">
            {phase === "review"
              ? "Kiểm tra ảnh"
              : isLevel
                ? "Tốt lắm! Bấm nút để chụp"
                : tilt
                  ? "Giữ máy song song với trang vở"
                  : "Đặt trang vở vừa trong khung"}
          </p>
          {torch.supported && phase === "live" ? (
            <button
              type="button"
              onClick={toggleTorch}
              aria-label={torch.on ? "Tắt đèn" : "Bật đèn"}
              aria-pressed={torch.on}
              className={`grid h-12 w-12 place-items-center rounded-full text-2xl active:scale-95 ${
                torch.on ? "bg-sun-400 text-ink" : "bg-black/40"
              }`}
            >
              🔦
            </button>
          ) : (
            <span className="w-12" />
          )}
        </div>
        {needsTiltPermission && phase === "live" && (
          <button
            type="button"
            onClick={requestTiltPermission}
            className="mx-auto mt-1 block min-h-11 rounded-full bg-white/90 px-4 text-sm font-bold text-ink"
          >
            Bật hướng dẫn cân bằng máy
          </button>
        )}
      </div>

      {/* Đang xử lý */}
      {(phase === "processing" || phase === "starting") && (
        <div className="absolute inset-0 grid place-items-center">
          <div className="flex flex-col items-center gap-3 rounded-3xl bg-black/60 px-6 py-5">
            <span className="h-10 w-10 animate-spin rounded-full border-4 border-white/30 border-t-sun-400" />
            <p className="font-bold">
              {phase === "starting" ? "Đang mở camera…" : "Đang làm rõ nét chữ…"}
            </p>
          </div>
        </div>
      )}

      {/* Lỗi */}
      {phase === "error" && (
        <div className="absolute inset-0 grid place-items-center px-6">
          <div className="max-w-sm rounded-3xl bg-white p-6 text-center text-ink">
            <p className="text-4xl" aria-hidden>
              📷
            </p>
            <p className="mt-3 font-semibold">{error}</p>
            <div className="mt-5 grid gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="min-h-14 rounded-full bg-brand-600 text-lg font-extrabold text-white active:scale-95"
              >
                Chọn ảnh từ thư viện
              </button>
              <button
                type="button"
                onClick={() => void startCamera()}
                className="min-h-12 rounded-full font-bold text-brand-700 active:scale-95"
              >
                Thử mở camera lại
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Xem lại kết quả */}
      {phase === "review" && previewUrls && result && (
        <div className="absolute inset-x-0 top-[calc(env(safe-area-inset-top)+4rem)] bottom-[calc(env(safe-area-inset-bottom)+11rem)] flex flex-col items-center gap-3 px-4">
          <div className="flex rounded-full bg-white/15 p-1 text-sm font-bold">
            {[
              { label: "Đã làm rõ", value: false },
              { label: "Ảnh gốc", value: true },
            ].map((t) => (
              <button
                key={t.label}
                type="button"
                onClick={() => setShowOriginal(t.value)}
                aria-pressed={showOriginal === t.value}
                className={`min-h-10 rounded-full px-4 ${
                  showOriginal === t.value ? "bg-white text-ink" : ""
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="relative min-h-0 w-full flex-1">
            {/* eslint-disable-next-line @next/next/no-img-element -- ảnh blob cục bộ */}
            <img
              src={showOriginal ? previewUrls.original : previewUrls.processed}
              alt={showOriginal ? "Ảnh gốc bài viết" : "Ảnh bài viết đã xử lý"}
              className="h-full w-full rounded-2xl bg-white object-contain"
            />
          </div>
          {fewInk && (
            <p className="rounded-xl bg-coral-400 px-3 py-2 text-center text-sm font-bold text-white">
              Hình như chưa thấy chữ rõ. Thử bật đèn hoặc chụp gần hơn nhé!
            </p>
          )}
        </div>
      )}

      {/* Thanh nút dưới */}
      <div className="pb-safe absolute inset-x-0 bottom-0 z-10">
        {phase === "review" ? (
          <div className="space-y-3 px-4 pb-5">
            <label className="flex items-center gap-3 text-sm font-bold">
              <span className="shrink-0">Độ đậm</span>
              <input
                type="range"
                min={-50}
                max={60}
                step={10}
                value={contrast}
                onChange={(e) => setContrast(Number(e.target.value))}
                onPointerUp={() =>
                  sourceCanvasRef.current && void runPipeline(sourceCanvasRef.current, contrast)
                }
                onKeyUp={() =>
                  sourceCanvasRef.current && void runPipeline(sourceCanvasRef.current, contrast)
                }
                className="h-11 flex-1 accent-sun-400"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleRetake}
                disabled={submitting}
                className="min-h-16 rounded-full bg-white/15 text-lg font-extrabold active:scale-95 disabled:opacity-50"
              >
                ↺ Chụp lại
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={submitting}
                className="min-h-16 rounded-full bg-sun-400 text-lg font-extrabold text-ink active:scale-95 disabled:opacity-60"
              >
                {submitting ? "Đang gửi…" : "✓ Dùng ảnh này"}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid h-36 grid-cols-3 items-center px-6">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Chọn ảnh từ thư viện"
              className="grid h-14 w-14 place-items-center justify-self-start rounded-2xl bg-white/15 text-2xl active:scale-95"
            >
              🖼️
            </button>
            <button
              type="button"
              onClick={handleShutter}
              disabled={phase !== "live"}
              aria-label="Chụp ảnh"
              className={`grid h-20 w-20 place-items-center justify-self-center rounded-full border-4 transition-transform active:scale-90 disabled:opacity-40 ${
                isLevel ? "border-mint-400" : "border-white"
              }`}
            >
              <span className="h-16 w-16 rounded-full bg-white" />
            </button>
            <span />
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}
