import type { Metadata } from "next";
import Link from "next/link";
import { CreateParentForm } from "@/components/admin/forms";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Tạo tài khoản phụ huynh" };

export default function NewParentPage() {
  return (
    <div className="space-y-4">
      <Link href="/admin/phu-huynh" className="inline-flex min-h-11 items-center text-sm font-bold text-brand-700">
        ← Phụ huynh
      </Link>
      <PageHeader title="Tạo tài khoản phụ huynh" subtitle="Phụ huynh đăng nhập được ngay, không cần xác nhận email." />
      <CreateParentForm />
    </div>
  );
}
