import Link from "next/link";
import { Suspense } from "react";
import { InstallPrompt } from "@/components/install-prompt";
import { ScoreBadge } from "@/components/score-badge";
import { Sparkline } from "@/components/sparkline";
import { StudentAvatar } from "@/components/student-avatar";
import { EmptyState, SetupNotice, Skeleton, TrendPill } from "@/components/ui";
import { getViewer, listStudentsWithStats } from "@/lib/data";
import { relativeDay } from "@/lib/score";
import { isSupabaseConfigured } from "@/lib/supabase";

export default function HomePage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<HomeSkeleton />}>
        <HomeContent />
      </Suspense>
      <InstallPrompt />
    </div>
  );
}

async function HomeContent() {
  if (!isSupabaseConfigured()) return <SetupNotice />;
  const [viewer, students] = await Promise.all([getViewer(), listStudentsWithStats()]);
  const firstName = viewer?.profile?.full_name?.trim().split(/\s+/).pop();
  

  return (
    <>
      <section className="relative overflow-hidden rounded-3xl bg-brand-600 p-5 text-white shadow-lg shadow-brand-600/20">
        <span aria-hidden className="absolute -right-3 -bottom-4 animate-float text-7xl opacity-90">
          ✏️
        </span>
        <p className="text-sm font-semibold opacity-80">Xin chào{firstName ? `, ${firstName}` : ""}! 👋</p>
        <h1 className="mt-1 max-w-[15rem] text-2xl leading-tight font-extrabold">
          Hôm nay mình cùng luyện chữ nhé!
        </h1>
        <Link
          href="/luyen-viet"
          className="mt-4 inline-flex min-h-12 items-center rounded-full bg-sun-400 px-6 font-extrabold text-ink active:scale-95"
        >
          📸 Nộp bài mới
        </Link>
      </section>

      <section aria-labelledby="students-heading">
        <h2 id="students-heading" className="mb-3 text-lg font-extrabold">
          Các bé nhà mình
        </h2>

        {students.length === 0 ? (
          <EmptyState icon="🐣" title="Chưa có bé nào">
            Trung Tâm THEDU sẽ thêm hồ sơ bé cho bạn. Bạn liên hệ trung tâm nhé.
          </EmptyState>
        ) : (
          <ul className="grid gap-3">
            {students.map((s, i) => (
              <li key={s.id} className="animate-rise" style={{ animationDelay: `${i * 60}ms` }}>
                <Link
                  href={`/hoc-sinh/${s.id}`}
                  className="flex min-h-24 items-center gap-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-brand-100 active:scale-[0.98]"
                >
                  <StudentAvatar avatar={s.avatar} id={s.id} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate text-lg font-extrabold">
                      {s.name}
                      <TrendPill trend={s.trend} />
                    </p>
                    <p className="text-sm text-muted">
                      {s.age} tuổi · {s.submissionCount} bài
                      {s.streak >= 2 && <span className="font-bold text-[#c2410c]"> · 🔥 {s.streak} ngày</span>}
                    </p>
                    {s.latestAt && <p className="text-xs text-muted">Lần cuối: {relativeDay(s.latestAt)}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {s.latestScore != null ? <ScoreBadge score={s.latestScore} size="sm" /> : <span className="text-2xl">✨</span>}
                    <Sparkline scores={s.points.map((p) => p.score)} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function HomeSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-40" />
      <Skeleton className="h-24" />
      <Skeleton className="h-24" />
    </div>
  );
}
