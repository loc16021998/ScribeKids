import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AdminStudentForm } from "@/components/admin/forms";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui";
import { listParents } from "@/lib/admin";

export const metadata: Metadata = { title: "Thêm học sinh" };

export default function AdminNewStudentPage({ searchParams }: PageProps<"/admin/hoc-sinh/moi">) {
  return (
    <div className="space-y-4">
      <Link href="/admin/hoc-sinh" className="inline-flex min-h-11 items-center text-sm font-bold text-brand-700">
        ← Học sinh
      </Link>
      <PageHeader title="Thêm học sinh" />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Form searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Form({ searchParams }: Pick<PageProps<"/admin/hoc-sinh/moi">, "searchParams">) {
  const [sp, parents] = await Promise.all([searchParams, listParents()]);
  const wanted = sp["phu-huynh"];
  return (
    <AdminStudentForm
      parents={parents.map((p) => ({ id: p.id, label: `${p.fullName} (${p.email ?? "không có email"})` }))}
      defaultParentId={typeof wanted === "string" && parents.some((p) => p.id === wanted) ? wanted : undefined}
    />
  );
}
