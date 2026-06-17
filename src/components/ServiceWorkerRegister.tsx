"use client";

import { useEffect } from "react";

// Registers the PWA service worker in production only (avoids interfering with
// dev HMR). Renders nothing.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (
      process.env.NODE_ENV === "production" &&
      typeof navigator !== "undefined" &&
      "serviceWorker" in navigator
    ) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registration failures shouldn't break the app.
      });
    }
  }, []);
  return null;
}
