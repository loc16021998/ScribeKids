import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { ScoreBadge } from "@/components/score-badge";
import { Sparkline } from "@/components/sparkline";
import { StudentAvatar } from "@/components/student-avatar";
import { EmptyState, SetupNotice, Skeleton, StatTile, TrendPill } from "@/components/ui";
import { listStudentsWithStats, summarizeRecent } from "@/lib/data";
import { average, relativeDay } from "@/lib/score";
import { isSupabaseConfigured } from "@/lib/supabase";

export const metadata: Metadata = { title: "Tiến bộ" };

export default function ProgressOverviewPage() {
  return (
    <div className="space-y-5">
      <PageHeader title="Bảng tiến bộ" subtitle="Tổng quan nét chữ của các bé." />
      <Suspense fallback={<OverviewSkeleton />}>
        <Overview />
      </Suspense>
    </div>
  );
}

async function Overview() {
  if (!isSupabaseConfigured()) return <SetupNotice />;
  const students = await listStudentsWithStats();
  if (students.length === 0) {
    return (
      <EmptyState icon="📊" title="Chưa có dữ liệu">
        Trung Tâm THEDU sẽ thêm hồ sơ bé cho bạn. Bạn liên hệ trung tâm nhé.
      </EmptyState>
    );
  }

  const { weekCount, weekAverage, practicedToday } = summarizeRecent(students);

  // Bé cần quan tâm (điểm đi xuống) lên đầu, rồi tới bé lâu chưa luyện.
  const sorted = [...students].sort(
    (a, b) =>
      (a.trend ?? 0) - (b.trend ?? 0) ||
      Date.parse(a.latestAt ?? "1970-01-01") - Date.parse(b.latestAt ?? "1970-01-01"),
  );

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <StatTile label="Bài tuần này" value={weekCount} />
        <StatTile label="Điểm TB tuần" value={weekAverage == null ? "—" : Math.round(weekAverage)} />
        <StatTile label="Luyện hôm nay" value={`${practicedToday}/${students.length}`} />
      </div>

      <ul className="space-y-3">
        {sorted.map((s) => {
          const avg = average(s.points.slice(-5).map((p) => p.score));
          return (
            <li key={s.id}>
              <Link
                href={`/hoc-sinh/${s.id}`}
                className="flex min-h-20 items-center gap-3 rounded-3xl bg-white p-3 shadow-sm ring-1 ring-brand-100 active:scale-[0.98]"
              >
                <StudentAvatar avatar={s.avatar} id={s.id} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate font-extrabold">
                    {s.name}
                    <TrendPill trend={s.trend} />
                  </p>
                  <p className="text-xs text-muted">
                    {s.latestAt ? `Lần cuối: ${relativeDay(s.latestAt)}` : "Chưa nộp bài"}
                    {avg != null && ` · TB 5 bài: ${Math.round(avg)}`}
                  </p>
                </div>
                <Sparkline scores={s.points.map((p) => p.score)} />
                {s.latestScore != null && <ScoreBadge score={s.latestScore} size="sm" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
      <Skeleton className="h-20" />
      <Skeleton className="h-20" />
    </div>
  );
}
