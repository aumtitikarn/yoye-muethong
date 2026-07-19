import { NextRequest, NextResponse } from "next/server";
import {
  exchangeCodeForToken,
  verifyIdToken,
  getPublicOrigin,
  LINE_STATE_COOKIE,
} from "@/lib/line";
import { createSession, sessionMaxAge, SESSION_COOKIE } from "@/lib/session";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

function errorRedirect(origin: string, reason: string) {
  const url = new URL("/", origin);
  url.searchParams.set("login_error", reason);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const origin = getPublicOrigin(req);
  const params = req.nextUrl.searchParams;

  // The user denied access or LINE returned an error.
  const oauthError = params.get("error");
  if (oauthError) {
    return errorRedirect(origin, oauthError);
  }

  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) {
    return errorRedirect(origin, "missing_code_or_state");
  }

  // Validate the state cookie set during login.
  const stateCookie = req.cookies.get(LINE_STATE_COOKIE)?.value;
  if (!stateCookie) {
    return errorRedirect(origin, "missing_state_cookie");
  }

  let stored: { state: string; nonce: string; returnTo?: string };
  try {
    stored = JSON.parse(stateCookie);
  } catch {
    return errorRedirect(origin, "invalid_state_cookie");
  }

  if (stored.state !== state) {
    return errorRedirect(origin, "state_mismatch");
  }

  try {
    const token = await exchangeCodeForToken({ code, origin });
    const profile = await verifyIdToken({
      idToken: token.id_token,
      nonce: stored.nonce,
    });

    // Persist the customer to the shared DB (keyed by lineUserId). Creates a new
    // record on first login; on later logins refreshes email only (fullName is
    // left untouched so admin edits aren't overwritten). DB failures must not
    // block authentication, so this is best-effort.
    try {
      await prisma.customer.upsert({
        where: { lineUserId: profile.sub },
        create: {
          fullName: profile.name,
          email: profile.email ?? null,
          lineUserId: profile.sub,
        },
        update: {
          email: profile.email ?? undefined,
        },
      });
    } catch (dbErr) {
      console.error("LINE login: customer upsert failed:", dbErr);
    }

    const session = createSession({
      sub: profile.sub,
      name: profile.name,
      picture: profile.picture,
      email: profile.email,
    });

    const returnTo =
      stored.returnTo && stored.returnTo.startsWith("/") ? stored.returnTo : "/";
    const res = NextResponse.redirect(new URL(returnTo, origin));

    res.cookies.set(SESSION_COOKIE, session, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: sessionMaxAge(),
    });

    // Clear the one-time state cookie.
    res.cookies.set(LINE_STATE_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  } catch (err) {
    console.error("LINE login callback error:", err);
    return errorRedirect(origin, "login_failed");
  }
}
