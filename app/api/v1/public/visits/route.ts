import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Cookie that identifies a browser for the "ผู้เข้าชมทั้งหมด" counter. */
export const VISITOR_COOKIE = "yy_vid";
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;
const BOT_UA = /bot|crawler|spider|crawling|facebookexternalhit|slurp|bingpreview|headless/i;

// POST /api/v1/public/visits
// Issues an anonymous visitor cookie the first time a browser hits the site and
// records one row per cookie. The number is deliberately cookie-based, not
// person-based: clearing cookies or using incognito counts as a new visitor.
export async function POST(req: NextRequest) {
  const userAgent = req.headers.get("user-agent") ?? "";
  if (BOT_UA.test(userAgent)) {
    return NextResponse.json({ data: { counted: false } });
  }

  const existing = req.cookies.get(VISITOR_COOKIE)?.value;
  const visitorId = existing && existing.length <= 64 ? existing : crypto.randomUUID();

  try {
    await prisma.siteVisitor.upsert({
      where: { visitorId },
      create: { visitorId },
      update: { lastSeenAt: new Date() },
    });
  } catch (err) {
    // Never let analytics break a page load.
    console.error("public/visits error:", err);
    return NextResponse.json({ data: { counted: false } });
  }

  const res = NextResponse.json({ data: { counted: true } });
  if (existing !== visitorId) {
    res.cookies.set(VISITOR_COOKIE, visitorId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: ONE_YEAR_SECONDS,
    });
  }
  return res;
}
