"use client";

import { useEffect } from "react";

const SESSION_FLAG = "yy-visit-counted";

/**
 * Pings the visitor endpoint once per browser tab. The server issues the
 * `yy_vid` cookie and records the visitor; the sessionStorage flag just avoids
 * a redundant request on every client-side navigation.
 *
 * Renders nothing and never surfaces an error — the counter is cosmetic.
 */
export default function VisitTracker() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (window.sessionStorage.getItem(SESSION_FLAG)) return;
      window.sessionStorage.setItem(SESSION_FLAG, "1");
    } catch {
      // sessionStorage blocked (private mode / strict settings) — still ping,
      // the server side is idempotent per cookie.
    }
    void fetch("/api/v1/public/visits", { method: "POST" }).catch(() => {});
  }, []);

  return null;
}
