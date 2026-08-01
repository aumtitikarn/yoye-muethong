import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
// The query string drives the response, so the route itself stays dynamic —
// the DB work behind it is what gets cached (see `getReviewsPage`).
export const dynamic = "force-dynamic";

/** Reviews change rarely (admin-curated), so a minute of staleness is fine. */
const CACHE_SECONDS = 60;
const CACHE_CONTROL = `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=300`;
export const REVIEWS_CACHE_TAG = "reviews";

/** A published review as consumed by /reviews. */
export interface ReviewDTO {
  id: number;
  eventName: string;
  /** null = ลูกค้าไม่เปิดเผยชื่อ */
  customerName: string | null;
  imageUrl: string;
  content: string | null;
  /** ISO date — formatted for display on the client. */
  reviewDate: string;
}

const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 48;

/**
 * One cache entry per (search, page, pageSize) combination. Returns
 * already-serialised data so nothing Date-shaped crosses the cache boundary.
 */
const getReviewsPage = unstable_cache(
  async (search: string, page: number, pageSize: number) => {
    const where: Prisma.ReviewWhereInput = {
      deletedAt: null,
      isPublished: true,
      ...(search && {
        OR: [
          { eventName: { contains: search, mode: "insensitive" } },
          { customerName: { contains: search, mode: "insensitive" } },
        ],
      }),
    };

    const [rows, total] = await Promise.all([
      prisma.review.findMany({
        where,
        orderBy: [{ reviewDate: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          eventName: true,
          customerName: true,
          imageUrl: true,
          content: true,
          reviewDate: true,
        },
      }),
      prisma.review.count({ where }),
    ]);

    const data: ReviewDTO[] = rows.map((r) => ({
      ...r,
      reviewDate: r.reviewDate.toISOString(),
    }));

    return {
      data,
      pagination: {
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  },
  ["public-reviews"],
  { revalidate: CACHE_SECONDS, tags: [REVIEWS_CACHE_TAG] },
);

// GET /api/v1/public/reviews?search=&page=&pageSize=
// Published reviews for the public reviews page. Admin (yoye-admin) owns the
// CRUD; this only reads.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const search = url.searchParams.get("search")?.trim() ?? "";
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(url.searchParams.get("pageSize")) || DEFAULT_PAGE_SIZE),
  );

  try {
    const payload = await getReviewsPage(search, page, pageSize);
    return NextResponse.json(payload, {
      headers: { "Cache-Control": CACHE_CONTROL },
    });
  } catch (err) {
    console.error("public/reviews error:", err);
    return NextResponse.json(
      { message: "ไม่สามารถโหลดรีวิวได้" },
      { status: 500 },
    );
  }
}
