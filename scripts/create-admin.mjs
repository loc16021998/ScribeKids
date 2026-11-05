/**
 * Tạo (hoặc nâng quyền) tài khoản admin Trung Tâm THEDU. Chạy trên máy của bạn:
 *   npm run create-admin
 * Mật khẩu chỉ nhập/hiện tại terminal này, không đi qua ứng dụng.
 */
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !secret) {
  console.error("Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SECRET_KEY trong .env.local");
  process.exit(1);
}
const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

const rl = createInterface({ input: process.stdin, output: process.stdout });
const email = (await rl.question("Email admin: ")).trim().toLowerCase();
if (!email.includes("@")) {
  console.error("Email không hợp lệ.");
  process.exit(1);
}

// Tìm tài khoản đã có với email này.
let existing = null;
for (let page = 1; !existing; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw error;
  existing = data.users.find((u) => u.email?.toLowerCase() === email) ?? null;
  if (data.users.length < 1000) break;
}

if (existing) {
  const answer = await rl.question(`Email này đã có tài khoản. Nâng lên admin? (c/k): `);
  rl.close();
  if (!/^c/i.test(answer.trim())) process.exit(0);
  const { error: e1 } = await admin.auth.admin.updateUserById(existing.id, {
    app_metadata: { ...existing.app_metadata, role: "admin" },
  });
  if (e1) throw e1;
  const { error: e2 } = await admin.from("profiles").update({ role: "admin" }).eq("id", existing.id);
  if (e2) throw e2;
  console.log("Đã nâng quyền. Đăng xuất rồi đăng nhập lại để vào /admin (mật khẩu giữ nguyên).");
} else {
  const typed = await rl.question("Mật khẩu (Enter để tự tạo): ");
  rl.close();
  const password = typed || randomBytes(12).toString("base64url");
  if (password.length < 6) {
    console.error("Mật khẩu cần ít nhất 6 ký tự.");
    process.exit(1);
  }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: "admin" },
    user_metadata: { full_name: "Trung Tâm THEDU" },
  });
  if (error) throw error;
  // Tài khoản mới luôn là phụ huynh: vai trò admin trong profiles do service role ghi.
  const { error: roleError } = await admin.from("profiles").update({ role: "admin" }).eq("id", data.user.id);
  if (roleError) {
    await admin.auth.admin.deleteUser(data.user.id);
    throw roleError;
  }
  console.log("Đã tạo tài khoản admin.");
  if (!typed) console.log(`Mật khẩu: ${password}`);
}
