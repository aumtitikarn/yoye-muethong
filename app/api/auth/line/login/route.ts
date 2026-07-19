import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { buildAuthorizeUrl, getPublicOrigin, LINE_STATE_COOKIE } from "@/lib/line";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const origin = getPublicOrigin(req);

    // Optional post-login redirect target within the app.
    const returnTo = req.nextUrl.searchParams.get("returnTo") ?? "/";

    const state = crypto.randomBytes(16).toString("hex");
    const nonce = crypto.randomBytes(16).toString("hex");

    const authorizeUrl = buildAuthorizeUrl({ origin, state, nonce });

    const res = NextResponse.redirect(authorizeUrl);
    // Store state + nonce (and the return target) to validate on callback.
    res.cookies.set(
      LINE_STATE_COOKIE,
      JSON.stringify({ state, nonce, returnTo }),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 10, // 10 minutes
      }
    );
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
