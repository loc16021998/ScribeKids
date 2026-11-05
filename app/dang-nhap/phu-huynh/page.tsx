import type { Metadata } from "next";
import { LoginPage } from "@/components/login-page";

export const metadata: Metadata = { title: "Đăng nhập phụ huynh" };

export default function ParentLoginPage({ searchParams }: PageProps<"/dang-nhap/phu-huynh">) {
  return <LoginPage portal="parent" searchParams={searchParams} />;
}
