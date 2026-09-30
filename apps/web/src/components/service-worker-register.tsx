"use client";

import { useEffect } from "react";

/**
 * Registers the PWA service worker on the client. Rendered once from the root
 * layout. No-ops when service workers are unavailable (e.g. SSR, older
 * browsers) or in development, where the SW would interfere with HMR.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // Registration is best-effort; failures must not break the app.
      });
    };

    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
