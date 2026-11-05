import Link from "next/link";
import { CriteriaBars } from "@/components/criteria-bars";
import { BadgeShelf, StreakCard } from "@/components/gamification/badge-shelf";
import ProgressChart from "@/components/ProgressChart";
import { ScoreBadge } from "@/components/score-badge";
import { StudentAvatar } from "@/components/student-avatar";
import { Card, EmptyState, PrimaryLink, SectionTitle, Skeleton, StatTile, TrendPill } from "@/components/ui";
import type { HistoryItem, StudentDashboard } from "@/lib/data";
import { formatDate, relativeDay } from "@/lib/score";

/** Hồ sơ tiến bộ của một bé — dùng chung cho khu phụ huynh và khu admin. */
export function StudentDashboardView({
  data,
  submissionHref,
  captureHref,
  captureLabel,
}: {
  data: StudentDashboard;
  submissionHref: (id: string) => string;
  captureHref: string;
  captureLabel: string;
}) {
  const { student, history, criteria } = data;
  const graded = history.filter((h) => h.score != null && h.thumbUrl);
  const newest = graded[0];
  const oldest = graded.length >= 2 ? graded[graded.length - 1] : null;

  return (
    <>
      <section className="flex items-center gap-4">
        <StudentAvatar avatar={student.avatar} id={student.id} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-extrabold">{student.name}</h1>
          <p className="text-muted">{student.age} tuổi</p>
        </div>
      </section>

      <PrimaryLink href={captureHref} icon="📸">
        {captureLabel} {student.name}
      </PrimaryLink>

      <StreakCard current={student.streak} longest={data.longestStreak} />

      <div className="grid grid-cols-2 gap-3">
        <StatTile label="Bài đã nộp" value={student.submissionCount} />
        <StatTile
          label="Điểm gần nhất"
          value={student.latestScore ?? "—"}
          hint={student.latestAt ? relativeDay(student.latestAt) : undefined}
        />
        <StatTile label="Huy hiệu" value={`🏅 ${data.earnedBadges.length}`} />
        <StatTile
          label="So với trước"
          value={
            student.trend == null ? (
              "—"
            ) : (
              <span className="flex items-center gap-2">
                {student.trend > 0 ? "+" : ""}
                {student.trend}
                <TrendPill trend={student.trend} />
              </span>
            )
          }
          hint="3 bài gần nhất"
        />
      </div>

      <BadgeShelf earned={data.earnedBadges} />

      {history.length === 0 ? (
        <EmptyState icon="📒" title="Chưa có bài nào">
          Chụp bài viết đầu tiên của {student.name} nhé!
        </EmptyState>
      ) : (
        <>
          <Card>
            <SectionTitle>📈 Tiến bộ điểm số</SectionTitle>
            <ProgressChart points={student.points} now={data.now} />
          </Card>

          {oldest && newest && (
            <Card>
              <SectionTitle>✨ Nét chữ đã thay đổi</SectionTitle>
              <div className="grid grid-cols-2 gap-3">
                <Compare item={oldest} caption="Bài đầu" href={submissionHref(oldest.id)} />
                <Compare item={newest} caption="Mới nhất" href={submissionHref(newest.id)} />
              </div>
              {criteria.some((c) => c.first != null) && (
                <div className="mt-5">
                  <p className="mb-3 text-sm font-bold text-muted">3 bài gần nhất so với 3 bài đầu tiên</p>
                  <CriteriaBars rows={criteria.map((c) => ({ key: c.key, value: c.recent, before: c.first }))} />
                </div>
              )}
            </Card>
          )}

          <section>
            <SectionTitle>🗂️ Lịch sử bài nộp</SectionTitle>
            <ul className="space-y-3">
              {history.map((h) => (
                <HistoryRow key={h.id} item={h} href={submissionHref(h.id)} />
              ))}
            </ul>
          </section>
        </>
      )}
    </>
  );
}

function Compare({ item, caption, href }: { item: HistoryItem; caption: string; href: string }) {
  return (
    <Link href={href} className="block active:scale-[0.98]">
      <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-white ring-1 ring-brand-100">
        {/* eslint-disable-next-line @next/next/no-img-element -- signed URL */}
        <img src={item.thumbUrl!} alt={`${caption}: bài ngày ${formatDate(item.created_at)}`} className="h-full w-full object-contain" loading="lazy" />
        <span className="absolute top-2 right-2">
          <ScoreBadge score={item.score!} size="sm" />
        </span>
      </div>
      <p className="mt-2 text-center text-sm font-bold">
        {caption} <span className="font-normal text-muted">· {formatDate(item.created_at)}</span>
      </p>
    </Link>
  );
}

function HistoryRow({ item, href }: { item: HistoryItem; href: string }) {
  return (
    <li>
      <Link
        href={href}
        className="flex min-h-20 items-center gap-3 rounded-3xl bg-white p-3 shadow-sm ring-1 ring-brand-100 active:scale-[0.98]"
      >
        <div className="h-16 w-14 shrink-0 overflow-hidden rounded-xl bg-paper ring-1 ring-brand-100">
          {item.thumbUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- signed URL
            <img src={item.thumbUrl} alt="" className="h-full w-full object-cover object-top" loading="lazy" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-extrabold">
            {relativeDay(item.created_at)}
            <span className="ml-1 text-sm font-normal text-muted">
              {formatDate(item.created_at, { hour: "2-digit", minute: "2-digit", day: undefined, month: undefined })}
            </span>
          </p>
          <p className="line-clamp-2 text-sm text-muted">
            {item.score == null ? "Đang chờ chấm điểm" : (item.feedback ?? "Đã chấm xong")}
          </p>
        </div>
        {item.score != null ? (
          <ScoreBadge score={item.score} size="sm" />
        ) : (
          <span className="rounded-full bg-sun-400/30 px-3 py-1 text-xs font-bold">Chờ chấm</span>
        )}
      </Link>
    </li>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-20" />
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}
