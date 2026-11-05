import { scoreTier } from "@/lib/score";

/** Huy hiệu điểm: hình huân chương tròn có răng cưa, điểm to, nhãn & sao. */
export function ScoreBadge({ score, size = "lg" }: { score: number; size?: "lg" | "sm" }) {
  const tier = scoreTier(score);

  if (size === "sm") {
    return (
      <span
        className={`inline-flex h-11 min-w-11 items-center justify-center rounded-full bg-linear-to-br px-2 text-base font-extrabold text-white shadow-sm ${tier.badge}`}
        aria-label={`${score} điểm, ${tier.label}`}
      >
        {score}
      </span>
    );
  }

  return (
    <div className="flex flex-col items-center" role="img" aria-label={`${score} điểm — ${tier.label}`}>
      <div className="relative h-40 w-40 animate-pop">
        {/* Răng cưa huân chương */}
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full drop-shadow-lg" aria-hidden>
          <defs>
            <linearGradient id="badge-burst" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ffd966" />
              <stop offset="1" stopColor="#ffb02e" />
            </linearGradient>
          </defs>
          <polygon fill="url(#badge-burst)" points={burstPoints(50, 50, 50, 43, 16)} />
        </svg>
        <div
          className={`absolute inset-[14%] flex flex-col items-center justify-center rounded-full bg-linear-to-br text-white ring-4 ring-white ${tier.badge}`}
        >
          <span className="text-5xl leading-none font-extrabold tabular-nums drop-shadow">{score}</span>
          <span className="mt-0.5 text-xs font-bold tracking-wide opacity-90">điểm</span>
        </div>
        <span aria-hidden className="absolute -top-1 -right-1 animate-float text-4xl">
          {tier.icon}
        </span>
      </div>

      <p className="mt-3 text-2xl font-extrabold text-ink">{tier.label}!</p>
      <p aria-hidden className="mt-1 flex gap-1 text-2xl">
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} className={i < tier.stars ? "" : "opacity-20 grayscale"}>
            ⭐
          </span>
        ))}
      </p>
    </div>
  );
}

function burstPoints(cx: number, cy: number, outer: number, inner: number, spikes: number) {
  const pts: string[] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI * i) / spikes - Math.PI / 2;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(" ");
}
