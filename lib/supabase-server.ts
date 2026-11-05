import "server-only";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { SUPABASE_KEY, SUPABASE_URL } from "./supabase";

/**
 * Client cho Server Component / Server Action / Route Handler, chạy theo
 * quyền của người dùng đang đăng nhập (RLS được áp dụng).
 *
 * Lưu ý (cacheComponents đang bật): hàm này đọc cookies() nên component gọi nó
 * phải nằm trong <Suspense>.
 */
export async function createClient() {
  // Supabase Auth gọi Date.now() để kiểm tra hạn phiên: báo cho Next.js biết phần này
  // chỉ chạy theo từng request, không nằm trong bước prerender.
  await connection();
  const cookieStore = await cookies();

  return createServerClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Gọi từ Server Component (không được ghi cookie) — proxy.ts đã lo refresh phiên.
        }
      },
    },
  });
}

/**
 * Client quyền quản trị (BỎ QUA RLS). Chỉ dùng ở backend cho tác vụ hệ thống,
 * ví dụ ghi điểm & nhận xét AI vào submissions. Không bao giờ import vào client.
 */
export function createAdminClient() {
  const serviceKey =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error("Thiếu SUPABASE_SECRET_KEY (hoặc SUPABASE_SERVICE_ROLE_KEY)");
  }
  return createSupabaseClient<Database>(SUPABASE_URL, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
