import { Card, SectionTitle } from "@/components/ui";
import { BADGES } from "@/lib/gamification/badges";

/** Tủ huy hiệu: cái đã có thì rực rỡ, cái chưa có thì mờ và ghi cách đạt được. */
export function BadgeShelf({ earned }: { earned: string[] }) {
  const owned = new Set(earned);
  return (
    <Card>
      <SectionTitle>
        🏅 Tủ huy hiệu ({owned.size}/{BADGES.length})
      </SectionTitle>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {BADGES.map((b) => {
          const has = owned.has(b.id);
          return (
            <li
              key={b.id}
              data-earned={has}
              className={`flex min-h-20 flex-col items-center justify-center rounded-2xl p-2 text-center ${
                has ? "bg-sun-400/25 ring-2 ring-sun-400" : "bg-brand-50/60"
              }`}
            >
              <span aria-hidden className={`text-3xl ${has ? "" : "opacity-30 grayscale"}`}>
                {b.icon}
              </span>
              <span className={`mt-1 text-sm leading-tight font-extrabold ${has ? "" : "text-muted"}`}>{b.name}</span>
              {!has && <span className="mt-0.5 text-xs leading-tight text-muted">{b.hint}</span>}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** Chuỗi ngày luyện tập và mốc kế tiếp. */
export function StreakCard({ current, longest }: { current: number; longest: number }) {
  const next = [3, 5, 10].find((goal) => goal > current);
  return (
    <section className="flex items-center gap-4 rounded-3xl bg-linear-to-br from-[#ff9f43] to-coral-400 p-4 text-white shadow-sm">
      <span aria-hidden className="text-5xl">
        {current > 0 ? "🔥" : "🌱"}
      </span>
      <div className="min-w-0">
        <p className="text-2xl font-extrabold">
          {current > 0 ? `${current} ngày liên tiếp!` : "Hôm nay mình bắt đầu nhé!"}
        </p>
        <p className="text-sm font-semibold opacity-95">
          {next ? `Còn ${next - current} ngày nữa tới mốc ${next} ngày` : "Con đã vượt mọi mốc rồi, giỏi quá!"}
          {longest > current && ` · Kỷ lục: ${longest} ngày`}
        </p>
      </div>
    </section>
  );
}
