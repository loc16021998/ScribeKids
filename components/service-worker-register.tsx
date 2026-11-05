"use client";

import { useEffect } from "react";

/** Đăng ký service worker (chỉ ở production để không cache nhầm khi dev). */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch((error) => console.error("Đăng ký service worker thất bại:", error));
  }, []);

  return null;
}
