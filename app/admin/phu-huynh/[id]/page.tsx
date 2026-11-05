import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { deleteParent } from "@/app/admin/actions";
import { DangerForm, ParentNameForm, ResetPasswordForm } from "@/components/admin/forms";
import { StudentAvatar } from "@/components/student-avatar";
import { Card, SectionTitle, Skeleton } from "@/components/ui";
import { listAllStudents, listParents } from "@/lib/admin";

export const metadata: Metadata = { title: "Phụ huynh" };

export default function ParentDetailPage({ params }: PageProps<"/admin/phu-huynh/[id]">) {
  return (
    <div className="space-y-4">
      <Link href="/admin/phu-huynh" className="inline-flex min-h-11 items-center text-sm font-bold text-brand-700">
        ← Phụ huynh
      </Link>
      <Suspense fallback={<Skeleton className="h-72" />}>
        <Detail params={params} />
      </Suspense>
    </div>
  );
}

async function Detail({ params }: Pick<PageProps<"/admin/phu-huynh/[id]">, "params">) {
  const { id } = await params;
  const [parents, students] = await Promise.all([listParents(), listAllStudents()]);
  const parent = parents.find((p) => p.id === id);
  if (!parent) notFound();
  const children = students.filter((s) => s.owner_id === id);

  return (
    <>
      <header>
        <h1 className="text-2xl font-extrabold break-words">{parent.fullName}</h1>
        <p className="break-all text-muted">{parent.email ?? "—"}</p>
      </header>

      <Card>
        <SectionTitle
          action={
            <Link
              href={`/admin/hoc-sinh/moi?phu-huynh=${id}`}
              className="min-h-11 content-center px-2 text-sm font-bold text-brand-700"
            >
              + Thêm bé
            </Link>
          }
        >
          Các bé ({children.length})
        </SectionTitle>
        {children.length === 0 ? (
          <p className="text-sm text-muted">Chưa có bé nào.</p>
        ) : (
          <ul className="space-y-2">
            {children.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/admin/hoc-sinh/${s.id}`}
                  className="flex min-h-14 items-center gap-3 rounded-2xl bg-brand-50/60 p-2 active:scale-[0.99]"
                >
                  <StudentAvatar avatar={s.avatar} id={s.id} size="sm" />
                  <span className="min-w-0 flex-1 truncate font-bold">{s.name}</span>
                  <span className="text-sm text-muted">{s.age} tuổi</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <SectionTitle>Họ tên</SectionTitle>
        <ParentNameForm parentId={id} fullName={parent.fullName} />
      </Card>

      <Card>
        <SectionTitle>Mật khẩu</SectionTitle>
        <ResetPasswordForm parentId={id} />
      </Card>

      <DangerForm
        action={deleteParent}
        fieldName="parent_id"
        fieldValue={id}
        label="Xoá tài khoản phụ huynh"
        confirmText={`Xoá tài khoản ${parent.fullName}? Toàn bộ ${children.length} hồ sơ bé, bài nộp và ảnh sẽ bị xoá vĩnh viễn.`}
      />
    </>
  );
}
