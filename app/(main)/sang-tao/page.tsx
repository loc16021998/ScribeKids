import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Viết sáng tạo" };

export default function CreativePage() {
  return (
    <>
      <PageHeader title="Viết sáng tạo" subtitle="Nhìn tranh, kể chuyện bằng chữ của bé." />
      <ComingSoon icon="🖍️" text="Kho đề viết sáng tạo sắp ra mắt." />
    </>
  );
}
