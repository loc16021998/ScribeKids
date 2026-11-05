import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { adminDeleteStudent } from "@/app/admin/actions";
import { AdminStudentForm, DangerForm } from "@/components/admin/forms";
import { DashboardSkeleton, StudentDashboardView } from "@/components/student-dashboard";
import { Card, SectionTitle } from "@/components/ui";
import { listParents } from "@/lib/admin";
import { getStudentDashboard } from "@/lib/data";
import { avatarOf } from "@/lib/score";

export const metadata: Metadata = { title: "Học sinh" };

export default function AdminStudentPage({ params }: PageProps<"/admin/hoc-sinh/[id]">) {
  return (
    <div className="space-y-5">
      <Link href="/admin/hoc-sinh" className="inline-flex min-h-11 items-center text-sm font-bold text-brand-700">
        ← Học sinh
      </Link>
      <Suspense fallback={<DashboardSkeleton />}>
        <Detail params={params} />
      </Suspense>
    </div>
  );
}

async function Detail({ params }: Pick<PageProps<"/admin/hoc-sinh/[id]">, "params">) {
  const { id } = await params;
  // listParents chạy requireAdmin trước khi trả dữ liệu.
  const [parents, data] = await Promise.all([listParents(), getStudentDashboard(id)]);
  if (!data) notFound();
  const { student } = data;

  return (
    <>
      <StudentDashboardView
        data={data}
        submissionHref={(sid) => `/admin/bai-nop/${sid}`}
        captureHref={`/admin/cham-bai?hs=${id}`}
        captureLabel="Chấm bài mới cho"
      />
      <Card>
        <SectionTitle>Chỉnh sửa hồ sơ</SectionTitle>
        <AdminStudentForm
          parents={parents.map((p) => ({ id: p.id, label: `${p.fullName} (${p.email ?? "không có email"})` }))}
          student={{
            id,
            name: student.name,
            age: student.age,
            avatar: avatarOf(student.avatar, id),
            ownerId: student.owner_id,
          }}
        />
      </Card>
      <DangerForm
        action={adminDeleteStudent}
        fieldName="student_id"
        fieldValue={id}
        label="Xoá hồ sơ bé"
        confirmText={`Xoá hồ sơ ${student.name}? Toàn bộ ${student.submissionCount} bài nộp và ảnh sẽ bị xoá vĩnh viễn.`}
      />
    </>
  );
}
