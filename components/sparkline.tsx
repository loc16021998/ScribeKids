/** Đường xu hướng nhỏ (8 bài gần nhất) cho thẻ học sinh — thuần SVG, render ở server. */
export function Sparkline({ scores, width = 76, height = 28 }: { scores: number[]; width?: number; height?: number }) {
  const data = scores.slice(-8);
  if (data.length < 2) return null;
  const pad = 4;
  const x = (i: number) => pad + (i / (data.length - 1)) * (width - pad * 2);
  const y = (v: number) => pad + (1 - v / 100) * (height - pad * 2);
  const d = data.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const last = data.length - 1;
  return (
    <svg width={width} height={height} aria-hidden className="shrink-0">
      <path d={d} fill="none" stroke="#6d5efc" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last)} cy={y(data[last])} r={4} fill="#6d5efc" stroke="#fff" strokeWidth={2} />
    </svg>
  );
}
