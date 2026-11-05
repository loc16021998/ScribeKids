import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { EmptyState, PrimaryLink, Skeleton } from "@/components/ui";
import { listParents } from "@/lib/admin";
import { relativeDay } from "@/lib/score";

export const metadata: Metadata = { title: "Phụ huynh" };

export default function ParentsPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="Phụ huynh" subtitle="Tài khoản do trung tâm cấp." />
      <PrimaryLink href="/admin/phu-huynh/moi" icon="➕">
        Tạo tài khoản phụ huynh
      </PrimaryLink>
      <Suspense fallback={<Skeleton className="h-48" />}>
        <Parents />
      </Suspense>
    </div>
  );
}

async function Parents() {
  const parents = await listParents();
  if (parents.length === 0) return <EmptyState icon="👨‍👩‍👧" title="Chưa có phụ huynh nào" />;
  return (
    <ul className="space-y-2">
      {parents.map((p) => (
        <li key={p.id}>
          <Link
            href={`/admin/phu-huynh/${p.id}`}
            className="flex min-h-16 items-center justify-between gap-3 rounded-2xl bg-white p-3 ring-1 ring-brand-100 active:scale-[0.99]"
          >
            <div className="min-w-0">
              <p className="truncate font-extrabold">{p.fullName}</p>
              <p className="truncate text-sm text-muted">{p.email ?? "—"}</p>
              <p className="text-xs text-muted">
                {p.lastSignInAt ? `Đăng nhập: ${relativeDay(p.lastSignInAt)}` : "Chưa đăng nhập lần nào"}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700">
              {p.studentCount} bé
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
