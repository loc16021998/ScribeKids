import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { ScoreBadge } from "@/components/score-badge";
import { Sparkline } from "@/components/sparkline";
import { StudentAvatar } from "@/components/student-avatar";
import { EmptyState, PrimaryLink, Skeleton, TrendPill } from "@/components/ui";
import { listAllStudents } from "@/lib/admin";

export const metadata: Metadata = { title: "Học sinh" };

export default function StudentsPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="Học sinh" subtitle="Tất cả các bé của trung tâm." />
      <PrimaryLink href="/admin/hoc-sinh/moi" icon="➕">
        Thêm học sinh
      </PrimaryLink>
      <Suspense fallback={<Skeleton className="h-48" />}>
        <Students />
      </Suspense>
    </div>
  );
}

async function Students() {
  const students = await listAllStudents();
  if (students.length === 0) return <EmptyState icon="🎒" title="Chưa có học sinh nào" />;
  return (
    <ul className="space-y-2">
      {students.map((s) => (
        <li key={s.id}>
          <Link
            href={`/admin/hoc-sinh/${s.id}`}
            className="flex min-h-16 items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-brand-100 active:scale-[0.99]"
          >
            <StudentAvatar avatar={s.avatar} id={s.id} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 truncate font-extrabold">
                {s.name}
                <TrendPill trend={s.trend} />
              </p>
              <p className="truncate text-xs text-muted">
                {s.age} tuổi · {s.submissionCount} bài · PH: {s.parentName}
              </p>
            </div>
            <Sparkline scores={s.points.map((p) => p.score)} />
            {s.latestScore != null && <ScoreBadge score={s.latestScore} size="sm" />}
          </Link>
        </li>
      ))}
    </ul>
  );
}
