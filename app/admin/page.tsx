import Link from "next/link";
import { Suspense } from "react";
import { SubmissionRows } from "@/components/admin/submission-rows";
import { PageHeader } from "@/components/page-header";
import { SectionTitle, Skeleton, StatTile } from "@/components/ui";
import { getAdminOverview, listAllSubmissions } from "@/lib/admin";

export default function AdminHomePage() {
  return (
    <div className="space-y-5">
      <PageHeader title="Tổng quan" subtitle="Toàn bộ hoạt động của trung tâm." />
      <Suspense fallback={<Skeleton className="h-72" />}>
        <Overview />
      </Suspense>
    </div>
  );
}

async function Overview() {
  const [stats, recent] = await Promise.all([getAdminOverview(), listAllSubmissions()]);
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="Phụ huynh" value={stats.parents} />
        <StatTile label="Học sinh" value={stats.students} />
        <StatTile label="Tổng bài nộp" value={stats.submissions} />
        <StatTile label="Bài 7 ngày qua" value={stats.thisWeek} />
        <StatTile label="Điểm TB 7 ngày" value={stats.weekAverage ?? "—"} />
        <StatTile label="Chờ chấm" value={stats.pending} />
      </div>

      {stats.pending > 0 && (
        <Link
          href="/admin/bai-nop?loc=cho-cham"
          className="flex min-h-14 items-center justify-center rounded-full bg-sun-400 px-4 text-center font-extrabold text-ink active:scale-[0.98]"
        >
          ✍️ Có {stats.pending} bài đang chờ chấm
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/admin/phu-huynh/moi"
          className="flex min-h-14 items-center justify-center rounded-full bg-brand-600 px-3 text-center font-extrabold text-white active:scale-[0.98]"
        >
          ➕ Tạo phụ huynh
        </Link>
        <Link
          href="/admin/hoc-sinh/moi"
          className="flex min-h-14 items-center justify-center rounded-full bg-white px-3 text-center font-extrabold text-brand-700 ring-2 ring-brand-100 active:scale-[0.98]"
        >
          ➕ Thêm học sinh
        </Link>
      </div>

      <section>
        <SectionTitle
          action={
            <Link href="/admin/bai-nop" className="min-h-11 content-center px-2 text-sm font-bold text-brand-700">
              Xem tất cả
            </Link>
          }
        >
          Bài nộp mới nhất
        </SectionTitle>
        <SubmissionRows rows={recent.slice(0, 8)} />
      </section>
    </>
  );
}
