import type { Metadata } from "next";
import { LoginPage } from "@/components/login-page";

export const metadata: Metadata = { title: "Đăng nhập Trung Tâm THEDU" };

/** Trang mở ra đầu tiên khi vào app. */
export default function AdminLoginPage({ searchParams }: PageProps<"/dang-nhap">) {
  return <LoginPage portal="admin" searchParams={searchParams} />;
}
