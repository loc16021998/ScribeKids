import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { PracticeCapture } from "@/components/practice-capture";
import { EmptyState, PrimaryLink, Skeleton } from "@/components/ui";
import { listAllStudents } from "@/lib/admin";

export const metadata: Metadata = { title: "Chấm bài" };

export default function AdminCapturePage({ searchParams }: PageProps<"/admin/cham-bai">) {
  return (
    <>
      <PageHeader title="Chấm bài" subtitle="Chụp bài viết của bất kỳ bé nào trong trung tâm." />
      <Suspense fallback={<Skeleton className="mt-5 h-64" />}>
        <Capture searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Capture({ searchParams }: Pick<PageProps<"/admin/cham-bai">, "searchParams">) {
  const [sp, students] = await Promise.all([searchParams, listAllStudents()]);
  if (students.length === 0) {
    return (
      <div className="mt-5 space-y-4">
        <EmptyState icon="🎒" title="Chưa có học sinh nào" />
        <PrimaryLink href="/admin/hoc-sinh/moi" icon="➕">
          Thêm học sinh
        </PrimaryLink>
      </div>
    );
  }
  return (
    <PracticeCapture
      students={students.map(({ id, name, avatar }) => ({ id, name, avatar }))}
      initialStudentId={typeof sp.hs === "string" ? sp.hs : undefined}
      resultBase="/admin/bai-nop"
      gradeAfterUpload
    />
  );
}
