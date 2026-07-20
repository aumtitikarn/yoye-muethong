import { NextRequest, NextResponse } from "next/server";

// Name of the LINE session cookie set at login (see lib/session.ts).
// Hardcoded here rather than imported so the Edge middleware bundle doesn't
// pull in node:crypto from lib/session.ts.
const SESSION_COOKIE = "session";

/**
 * Gate the booking flow behind a LINE login. If a visitor hits /bookings
 * (or a nested route) without a session cookie, send them through the LINE
 * login first and return them to the page they wanted afterwards.
 *
 * This is a lightweight presence check for UX only — the API routes still
 * verify the session signature/expiry before doing anything sensitive.
 */
export function middleware(req: NextRequest) {
  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);
  if (hasSession) return NextResponse.next();

  const returnTo = req.nextUrl.pathname + req.nextUrl.search;
  const loginUrl = new URL("/api/auth/line/login", req.url);
  loginUrl.searchParams.set("returnTo", returnTo);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/bookings", "/bookings/:path*"],
};
