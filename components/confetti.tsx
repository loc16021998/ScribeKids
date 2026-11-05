"use client";

import { useEffect, useState } from "react";

const COLORS = ["#6d5efc", "#ffc93c", "#4fd1a5", "#ff7a7a", "#7f71ff"];

/** Mưa giấy màu ăn mừng điểm cao — chỉ chạy một lần, tôn trọng "giảm chuyển động". */
export function Confetti({ pieces = 40 }: { pieces?: number }) {
  const [items, setItems] = useState<{ left: number; delay: number; dx: number; color: string; size: number }[]>([]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setTimeout(() => {
      setItems(
        Array.from({ length: pieces }, (_, i) => ({
          left: Math.random() * 100,
          delay: Math.random() * 0.6,
          dx: (Math.random() - 0.5) * 160,
          color: COLORS[i % COLORS.length],
          size: 6 + Math.random() * 6,
        })),
      );
    }, 0);
    const clear = setTimeout(() => setItems([]), 3500);
    return () => {
      clearTimeout(timer);
      clearTimeout(clear);
    };
  }, [pieces]);

  if (!items.length) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
      {items.map((p, i) => (
        <span
          key={i}
          className="absolute top-0 block rounded-sm"
          style={
            {
              left: `${p.left}%`,
              width: p.size,
              height: p.size * 0.6,
              background: p.color,
              animation: `confetti 2.6s ${p.delay}s cubic-bezier(0.2, 0.6, 0.4, 1) forwards`,
              "--dx": `${p.dx}px`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
