"use client";

import { useEffect } from "react";

/** Registra o Service Worker PWA (/sw.js) em navegadores compatíveis. */
export function PwaRegistrar() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
