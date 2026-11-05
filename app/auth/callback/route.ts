import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase-server";

/** Đích của link xác nhận email (PKCE): đổi `code` lấy phiên đăng nhập. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  return NextResponse.redirect(`${origin}/dang-nhap?loi=xac-nhan`);
}

/** Chỉ cho phép chuyển hướng nội bộ (chặn open redirect). */
function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}
