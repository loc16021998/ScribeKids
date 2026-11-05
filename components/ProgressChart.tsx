"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { dayKey, weekKey } from "@/lib/score";

type Point = { score: number; created_at: string };
type Bucket = { key: string; t: number; avg: number; count: number };

const RANGES = [
  { id: "7", label: "7 ngày", days: 7 },
  { id: "30", label: "30 ngày", days: 30 },
  { id: "all", label: "Tất cả", days: Infinity },
] as const;

const BRAND = "#6d5efc";
const GRID = "#ebe8f7"; // một bậc lệch khỏi nền trắng — lưới chìm
const H = 200;
const M = { top: 22, right: 14, bottom: 28, left: 30 };

/**
 * Biểu đồ tiến bộ điểm số theo ngày/tuần — một chuỗi (không cần chú giải),
 * trục 0–100, đường 2px + vùng tô 10%, crosshair bám điểm gần nhất (chuột & cảm ứng).
 */
export default function ProgressChart({ points, now }: { points: Point[]; now: number }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [range, setRange] = useState<(typeof RANGES)[number]["id"]>("30");
  const [unit, setUnit] = useState<"day" | "week">("day");
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const buckets = useMemo<Bucket[]>(() => {
    const days = RANGES.find((r) => r.id === range)!.days;
    const cutoff = Number.isFinite(days) ? now - days * 86_400_000 : -Infinity;
    const map = new Map<string, { sum: number; count: number }>();
    for (const p of points) {
      if (Date.parse(p.created_at) < cutoff) continue;
      const key = unit === "day" ? dayKey(p.created_at) : weekKey(p.created_at);
      const b = map.get(key) ?? { sum: 0, count: 0 };
      b.sum += p.score;
      b.count++;
      map.set(key, b);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, b]) => ({ key, t: Date.parse(`${key}T00:00:00Z`), avg: Math.round(b.sum / b.count), count: b.count }));
  }, [points, range, unit, now]);

  const innerW = Math.max(0, width - M.left - M.right);
  const innerH = H - M.top - M.bottom;
  const t0 = buckets[0]?.t ?? 0;
  const t1 = buckets[buckets.length - 1]?.t ?? 0;
  const x = (t: number) => (t1 === t0 ? M.left + innerW / 2 : M.left + ((t - t0) / (t1 - t0)) * innerW);
  const y = (v: number) => M.top + (1 - v / 100) * innerH;

  const line = buckets.map((b, i) => `${i ? "L" : "M"}${x(b.t).toFixed(1)},${y(b.avg).toFixed(1)}`).join("");
  const area = buckets.length > 1 ? `${line}L${x(t1)},${y(0)}L${x(t0)},${y(0)}Z` : "";

  const xTicks = useMemo(() => {
    if (buckets.length <= 1) return buckets.map((_, i) => i);
    const n = Math.min(buckets.length, Math.max(2, Math.floor(innerW / 64)));
    return Array.from({ length: n }, (_, k) => Math.round((k * (buckets.length - 1)) / (n - 1)));
  }, [buckets, innerW]);

  function nearest(clientX: number, el: Element) {
    const px = clientX - el.getBoundingClientRect().left;
    let best = 0;
    buckets.forEach((b, i) => {
      if (Math.abs(x(b.t) - px) < Math.abs(x(buckets[best].t) - px)) best = i;
    });
    return best;
  }

  const shown = hover != null ? buckets[hover] : null;
  const last = buckets[buckets.length - 1];

  return (
    <div>
      {/* Bộ lọc — một hàng phía trên biểu đồ */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex rounded-full bg-brand-50 p-1 text-xs font-bold" role="group" aria-label="Khoảng thời gian">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              aria-pressed={range === r.id}
              onClick={() => {
                setRange(r.id);
                setHover(null);
              }}
              className={`min-h-9 rounded-full px-3 ${range === r.id ? "bg-white text-brand-700 shadow-sm" : "text-muted"}`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="flex rounded-full bg-brand-50 p-1 text-xs font-bold" role="group" aria-label="Gộp theo">
          {(
            [
              ["day", "Ngày"],
              ["week", "Tuần"],
            ] as const
          ).map(([u, label]) => (
            <button
              key={u}
              type="button"
              aria-pressed={unit === u}
              onClick={() => {
                setUnit(u);
                setHover(null);
              }}
              className={`min-h-9 rounded-full px-3 ${unit === u ? "bg-white text-brand-700 shadow-sm" : "text-muted"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div ref={wrapRef} className="relative">
        {buckets.length === 0 ? (
          <p className="grid h-[200px] place-items-center rounded-2xl bg-brand-50 text-center text-sm text-muted">
            Chưa có bài được chấm trong khoảng này.
          </p>
        ) : (
          width > 0 && (
            <svg
              width={width}
              height={H}
              role="img"
              aria-label={`Biểu đồ điểm trung bình theo ${unit === "day" ? "ngày" : "tuần"}`}
              tabIndex={0}
              className="block touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              onPointerDown={(e) => setHover(nearest(e.clientX, e.currentTarget))}
              onPointerMove={(e) => {
                if (e.pointerType === "mouse" || e.buttons) setHover(nearest(e.clientX, e.currentTarget));
              }}
              onPointerLeave={(e) => {
                if (e.pointerType === "mouse") setHover(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight") setHover((h) => Math.min(buckets.length - 1, (h ?? -1) + 1));
                else if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? buckets.length) - 1));
                else if (e.key === "Escape") setHover(null);
              }}
            >
              {[0, 25, 50, 75, 100].map((v) => (
                <g key={v}>
                  <line x1={M.left} x2={width - M.right} y1={y(v)} y2={y(v)} stroke={GRID} strokeWidth={1} />
                  <text x={M.left - 6} y={y(v)} textAnchor="end" dominantBaseline="middle" className="fill-muted text-[11px]">
                    {v}
                  </text>
                </g>
              ))}
              {xTicks.map((i) => (
                <text key={i} x={x(buckets[i].t)} y={H - 8} textAnchor="middle" className="fill-muted text-[11px]">
                  {shortDate(buckets[i].key)}
                </text>
              ))}

              {area && <path d={area} fill={BRAND} fillOpacity={0.1} />}
              {buckets.length > 1 && (
                <path d={line} fill="none" stroke={BRAND} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              )}

              {shown && (
                <line
                  x1={x(shown.t)}
                  x2={x(shown.t)}
                  y1={M.top - 6}
                  y2={y(0)}
                  stroke="#1f1d36"
                  strokeOpacity={0.35}
                  strokeWidth={1}
                />
              )}

              {buckets.map((b, i) => (
                <circle
                  key={b.key}
                  cx={x(b.t)}
                  cy={y(b.avg)}
                  r={hover === i ? 6 : 4}
                  fill={BRAND}
                  stroke="#fff"
                  strokeWidth={2}
                />
              ))}

              {/* Nhãn trực tiếp chọn lọc: chỉ điểm mới nhất */}
              {last && hover == null && (
                <text
                  x={Math.min(x(last.t), width - M.right - 8)}
                  y={y(last.avg) - 12}
                  textAnchor="middle"
                  className="fill-ink text-xs font-extrabold"
                >
                  {last.avg}
                </text>
              )}
            </svg>
          )
        )}

        {shown && (
          <div
            className="pointer-events-none absolute top-0 z-10 rounded-xl bg-ink px-3 py-2 text-xs text-white shadow-lg"
            style={{
              left: Math.min(Math.max(0, x(shown.t) - 70), Math.max(0, width - 140)),
              width: 140,
            }}
          >
            <p className="font-bold opacity-80">{longDate(shown.key, unit)}</p>
            <p className="mt-0.5 text-sm font-extrabold">Điểm TB: {shown.avg}</p>
            <p className="opacity-80">{shown.count} bài</p>
          </div>
        )}
      </div>

      {/* Bảng dữ liệu cho trình đọc màn hình */}
      <table className="sr-only">
        <caption>Điểm trung bình theo {unit === "day" ? "ngày" : "tuần"}</caption>
        <thead>
          <tr>
            <th>{unit === "day" ? "Ngày" : "Tuần bắt đầu"}</th>
            <th>Điểm trung bình</th>
            <th>Số bài</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((b) => (
            <tr key={b.key}>
              <td>{longDate(b.key, unit)}</td>
              <td>{b.avg}</td>
              <td>{b.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function shortDate(key: string) {
  const [, m, d] = key.split("-");
  return `${Number(d)}/${Number(m)}`;
}

function longDate(key: string, unit: "day" | "week") {
  const d = new Date(`${key}T00:00:00Z`);
  const s = new Intl.DateTimeFormat("vi-VN", {
    timeZone: "UTC",
    weekday: unit === "day" ? "short" : undefined,
    day: "numeric",
    month: "numeric",
  }).format(d);
  return unit === "day" ? s : `Tuần từ ${s}`;
}
