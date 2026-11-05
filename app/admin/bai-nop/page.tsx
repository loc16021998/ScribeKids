import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SubmissionRows } from "@/components/admin/submission-rows";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui";
import { SUBMISSION_PAGE_SIZE, listAllSubmissions } from "@/lib/admin";

export const metadata: Metadata = { title: "Bài nộp" };

export default function SubmissionsPage({ searchParams }: PageProps<"/admin/bai-nop">) {
  return (
    <div className="space-y-4">
      <PageHeader title="Bài nộp" subtitle={`${SUBMISSION_PAGE_SIZE} bài mới nhất của toàn trung tâm.`} />
      <Suspense fallback={<Skeleton className="h-64" />}>
        <List searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function List({ searchParams }: Pick<PageProps<"/admin/bai-nop">, "searchParams">) {
  const sp = await searchParams;
  const pendingOnly = sp.loc === "cho-cham";
  const rows = await listAllSubmissions(pendingOnly);
  const tab = (active: boolean) =>
    `flex min-h-10 items-center rounded-full px-4 text-sm font-bold ${active ? "bg-white text-brand-700 shadow-sm" : "text-muted"}`;
  return (
    <>
      <div className="inline-flex rounded-full bg-brand-50 p-1">
        <Link href="/admin/bai-nop" className={tab(!pendingOnly)}>
          Tất cả
        </Link>
        <Link href="/admin/bai-nop?loc=cho-cham" className={tab(pendingOnly)}>
          Chờ chấm
        </Link>
      </div>
      <SubmissionRows rows={rows} />
    </>
  );
}
