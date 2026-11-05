"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BoundingBoxIssue, HighlightBox, Severity } from "@/lib/ai/types";

type Mark =
  | ({ kind: "issue" } & BoundingBoxIssue)
  | ({ kind: "highlight" } & HighlightBox);

const COLORS: Record<Severity | "good", { stroke: string; fill: string; chip: string }> = {
  major: { stroke: "#ef4444", fill: "rgba(239,68,68,0.14)", chip: "bg-[#ef4444]" },
  moderate: { stroke: "#ff8a1f", fill: "rgba(255,138,31,0.14)", chip: "bg-[#ff8a1f]" },
  minor: { stroke: "#f5b400", fill: "rgba(245,180,0,0.14)", chip: "bg-[#f5b400]" },
  good: { stroke: "#16b07a", fill: "rgba(22,176,122,0.14)", chip: "bg-[#16b07a]" },
};

const colorOf = (m: Mark) => COLORS[m.kind === "highlight" ? "good" : m.severity];
const TOUCH_SLOP = 14; // px CSS — vùng chạm rộng hơn khung để ngón tay dễ trúng

/**
 * Ảnh bài làm + lớp phủ Canvas. Khung đỏ/cam/vàng = chỗ cần cải thiện, khung xanh có
 * sao = chữ đẹp. Chạm vào khung (hoặc chip bên dưới) để xem lời nhắc; khung đang
 * chọn có viền chạy & nhấp nháy nhẹ.
 */
export default function SubmissionCanvas({
  imageUrl,
  originalUrl,
  issues,
  highlights,
}: {
  imageUrl: string;
  originalUrl?: string | null;
  issues: BoundingBoxIssue[];
  highlights: HighlightBox[];
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [active, setActive] = useState<number | null>(null);
  const [showBoxes, setShowBoxes] = useState(true);
  const [useOriginal, setUseOriginal] = useState(Boolean(originalUrl));

  // Khen trước, góp ý sau — thứ tự đánh số cũng vậy.
  const marks: Mark[] = [
    ...highlights.map((h) => ({ kind: "highlight" as const, ...h })),
    ...issues.map((i) => ({ kind: "issue" as const, ...i })),
  ];

  // Theo dõi kích thước hiển thị của ảnh
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rectOf = useCallback(
    (m: Mark) => {
      const [ymin, xmin, ymax, xmax] = m.box;
      return {
        x: (xmin / 1000) * size.w,
        y: (ymin / 1000) * size.h,
        w: ((xmax - xmin) / 1000) * size.w,
        h: ((ymax - ymin) / 1000) * size.h,
      };
    },
    [size],
  );

  // Vẽ (có hoạt ảnh cho khung đang chọn)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size.w) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    const ctx = canvas.getContext("2d")!;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let raf = 0;

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size.w, size.h);
      if (!showBoxes) return;

      marks.forEach((m, i) => {
        const r = rectOf(m);
        const c = colorOf(m);
        const selected = active === i;
        const dim = active != null && !selected;
        const pulse = selected && !reduceMotion ? 0.5 + 0.5 * Math.sin(frame / 8) : 0;

        ctx.globalAlpha = dim ? 0.35 : 1;
        ctx.fillStyle = c.fill;
        roundRect(ctx, r.x, r.y, r.w, r.h, 10);
        ctx.fill();

        if (selected) {
          ctx.shadowColor = c.stroke;
          ctx.shadowBlur = 8 + pulse * 10;
        }
        ctx.lineWidth = selected ? 4 : 3;
        ctx.strokeStyle = c.stroke;
        ctx.setLineDash(selected ? [10, 6] : []);
        ctx.lineDashOffset = selected && !reduceMotion ? -frame / 2 : 0;
        roundRect(ctx, r.x, r.y, r.w, r.h, 10);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.setLineDash([]);

        // Nhãn số / ngôi sao ở góc trên-trái
        const cx = Math.max(13, r.x);
        const cy = Math.max(13, r.y);
        ctx.beginPath();
        ctx.arc(cx, cy, 13, 0, Math.PI * 2);
        ctx.fillStyle = c.stroke;
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = "#fff";
        ctx.stroke();
        ctx.fillStyle = "#fff";
        ctx.font = "800 14px Nunito, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(m.kind === "highlight" ? "★" : String(i + 1 - highlights.length), cx, cy + 1);
        ctx.globalAlpha = 1;
      });

      if (active != null && !reduceMotion) {
        frame++;
        raf = requestAnimationFrame(draw);
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- marks dựng lại mỗi render từ props ổn định
  }, [size, active, showBoxes, rectOf, issues, highlights]);

  function onTap(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!showBoxes) return;
    const bounds = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - bounds.left;
    const y = e.clientY - bounds.top;
    // Chọn khung nhỏ nhất chứa điểm chạm (khung lồng nhau thì lấy khung trong).
    let best: number | null = null;
    let bestArea = Infinity;
    marks.forEach((m, i) => {
      const r = rectOf(m);
      const hit =
        x >= r.x - TOUCH_SLOP && x <= r.x + r.w + TOUCH_SLOP && y >= r.y - TOUCH_SLOP && y <= r.y + r.h + TOUCH_SLOP;
      if (hit && r.w * r.h < bestArea) {
        best = i;
        bestArea = r.w * r.h;
      }
    });
    if (best != null) navigator.vibrate?.(15);
    setActive(best === active ? null : best);
  }

  const current = active != null ? marks[active] : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        {originalUrl ? (
          <div className="flex rounded-full bg-brand-50 p-1 text-sm font-bold">
            {[
              { label: "Ảnh chụp", value: true },
              { label: "Nét chữ", value: false },
            ].map((t) => (
              <button
                key={t.label}
                type="button"
                aria-pressed={useOriginal === t.value}
                onClick={() => setUseOriginal(t.value)}
                className={`min-h-10 rounded-full px-4 ${useOriginal === t.value ? "bg-white text-brand-700 shadow-sm" : "text-muted"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        ) : (
          <span />
        )}
        <button
          type="button"
          aria-pressed={showBoxes}
          onClick={() => {
            setShowBoxes((v) => !v);
            setActive(null);
          }}
          className="min-h-10 rounded-full bg-brand-50 px-4 text-sm font-bold text-brand-700"
        >
          {showBoxes ? "Ẩn khung" : "Hiện khung"}
        </button>
      </div>

      <div ref={wrapRef} className="relative overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-brand-100">
        {/* eslint-disable-next-line @next/next/no-img-element -- signed URL riêng tư, không qua bộ tối ưu ảnh */}
        <img
          src={useOriginal && originalUrl ? originalUrl : imageUrl}
          alt="Bài viết của bé"
          className="block w-full select-none"
          draggable={false}
        />
        <canvas
          ref={canvasRef}
          onPointerUp={onTap}
          className="absolute inset-0 h-full w-full touch-manipulation"
          aria-hidden
        />
      </div>

      {/* Thẻ lời nhắc của khung đang chọn */}
      <div aria-live="polite" className="min-h-[4.5rem]">
        {current ? (
          <div
            key={active}
            className={`flex animate-rise items-start gap-3 rounded-2xl p-4 ${
              current.kind === "highlight" ? "bg-mint-400/20" : "bg-sun-400/20"
            }`}
          >
            <span aria-hidden className="text-2xl">
              {current.kind === "highlight" ? "🌟" : "💡"}
            </span>
            <p className="text-ink">
              <b>{current.label}</b>
              <br />
              {current.message}
            </p>
          </div>
        ) : (
          marks.length > 0 &&
          showBoxes && <p className="pt-2 text-center text-sm text-muted">👆 Chạm vào khung trên ảnh để xem lời nhắc nhé!</p>
        )}
      </div>

      {/* Chip truy cập được bằng bàn phím / trình đọc màn hình (canvas không đọc được) */}
      {marks.length > 0 && showBoxes && (
        <ul className="flex flex-wrap gap-2">
          {marks.map((m, i) => (
            <li key={i}>
              <button
                type="button"
                aria-pressed={active === i}
                onClick={() => setActive(active === i ? null : i)}
                className={`flex min-h-11 items-center gap-2 rounded-full border-2 bg-white px-3 text-sm font-bold active:scale-95 ${
                  active === i ? "border-ink" : "border-brand-100"
                }`}
              >
                <span
                  aria-hidden
                  className={`grid h-6 w-6 place-items-center rounded-full text-xs text-white ${colorOf(m).chip}`}
                >
                  {m.kind === "highlight" ? "★" : i + 1 - highlights.length}
                </span>
                {m.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, rr);
}
