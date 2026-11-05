import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { SUPABASE_KEY, SUPABASE_URL, isSupabaseConfigured } from "./supabase";

/** Các đường dẫn xem được khi chưa đăng nhập. */
const PUBLIC_PREFIXES = ["/dang-nhap", "/auth", "/offline", "/api"];

/**
 * Làm mới token Supabase trên mỗi request, rồi đưa mỗi vai trò về đúng khu vực:
 * chưa đăng nhập → /dang-nhap, admin → /admin, phụ huynh → khu phụ huynh.
 *
 * Đây chỉ là điều hướng lạc quan (dựa vào app_metadata trong JWT). Lớp bảo vệ thật
 * là RLS trong database và requireAdmin() trong lib/admin.ts.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (!isSupabaseConfigured()) return response;

  const supabase = createServerClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries(headers ?? {}).forEach(([key, value]) =>
          response.headers.set(key, value),
        );
      },
    },
  });

  // Không chèn code giữa createServerClient và getClaims() — dễ gây lỗi đăng xuất ngẫu nhiên.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const signedIn = Boolean(claims);
  const isAdmin = (claims?.app_metadata as { role?: string } | undefined)?.role === "admin";

  const { pathname, search } = request.nextUrl;
  const isPublic = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
  const inAdminArea = pathname === "/admin" || pathname.startsWith("/admin/");

  const go = (path: string, query = "") => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = query;
    return redirectWithCookies(url, response);
  };

  if (!signedIn) {
    if (isPublic) return response;
    // Mở app ("/") và khu admin vào cổng trung tâm; link sâu của phụ huynh vào cổng phụ huynh.
    const login = pathname === "/" || inAdminArea ? "/dang-nhap" : "/dang-nhap/phu-huynh";
    return go(login, pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`);
  }
  if (pathname.startsWith("/dang-nhap")) return go(isAdmin ? "/admin" : "/");
  if (inAdminArea && !isAdmin) return go("/");
  if (isAdmin && !inAdminArea && !isPublic) {
    // Link bài nộp / hồ sơ bé mở trong khu phụ huynh → sang trang tương ứng của admin.
    const detail = pathname.match(/^\/(hoc-sinh|bai-nop)\/(.+)$/);
    return go(detail ? `/admin/${detail[1]}/${detail[2]}` : "/admin");
  }
  return response;
}

/** Redirect nhưng giữ lại cookie phiên vừa được làm mới. */
function redirectWithCookies(url: URL, from: NextResponse) {
  const redirect = NextResponse.redirect(url);
  from.cookies.getAll().forEach((c) => redirect.cookies.set(c));
  return redirect;
}
