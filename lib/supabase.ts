/**
 * Kết nối Supabase dùng chung (an toàn cho cả Client Component).
 * - createClient(): dùng trong Client Component ("use client").
 * - Server Component / Server Action / Route Handler: dùng lib/supabase-server.ts.
 * - Proxy (refresh phiên đăng nhập): dùng updateSession() trong lib/supabase-proxy.ts.
 */
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
// Hỗ trợ cả publishable key mới (sb_publishable_…) lẫn anon key cũ.
export const SUPABASE_KEY = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!;

export const STORAGE_BUCKETS = {
  submissions: "submissions",
  avatars: "avatars",
} as const;

export function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

let browserClient: ReturnType<typeof createBrowserClient<Database>> | undefined;

/** Client cho trình duyệt — singleton để không tạo nhiều kết nối realtime. */
export function createClient() {
  browserClient ??= createBrowserClient<Database>(SUPABASE_URL, SUPABASE_KEY);
  return browserClient;
}

/** Đường dẫn lưu ảnh bài nộp, khớp với storage policy: {student_id}/{file} */
export function submissionPath(studentId: string, fileName: string) {
  return `${studentId}/${Date.now()}-${fileName}`;
}
