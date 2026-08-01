"use client";

import { useEffect, useState } from "react";
import Loading from "@/components/Loading";
import { useReviewStatsQuery, useReviewsQuery } from "@/lib/queries";
import type { ReviewDTO } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ArrowUp,
  Search,
  Users,
  Calendar,
  CheckCircle2,
  X,
} from "lucide-react";

const ITEMS_PER_PAGE = 12;

const thaiDate = new Intl.DateTimeFormat("th-TH-u-ca-buddhist", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const formatReviewDate = (iso: string) => thaiDate.format(new Date(iso));

/** Debounce the search box so typing doesn't fire a request per keystroke. */
function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default function ReviewsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedReview, setSelectedReview] = useState<ReviewDTO | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  const debouncedSearch = useDebounced(searchQuery);
  const reviewsQuery = useReviewsQuery({
    search: debouncedSearch.trim() || undefined,
    page: currentPage,
    pageSize: ITEMS_PER_PAGE,
  });
  const statsQuery = useReviewStatsQuery();

  const paginatedReviews = reviewsQuery.data?.data ?? [];
  const totalPages = reviewsQuery.data?.totalPages ?? 1;
  const isLoading = reviewsQuery.isPending;

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 400);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const statValue = (value?: number) =>
    value === undefined ? "—" : value.toLocaleString("th-TH");

  const stats = [
    {
      icon: Users,
      label: "ผู้เข้าชมทั้งหมด",
      value: statValue(statsQuery.data?.totalVisitors),
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      icon: Calendar,
      label: "จำนวนการจองคิว",
      value: statValue(statsQuery.data?.totalBookings),
      color: "text-amber-600",
      bg: "bg-amber-100",
    },
    {
      icon: CheckCircle2,
      label: "กดบัตรสำเร็จ",
      value: statValue(statsQuery.data?.successPresses),
      color: "text-emerald-600",
      bg: "bg-emerald-100",
    },
  ];

  return (
    <main className="min-h-screen px-4 py-4">
      {isLoading && <Loading />}
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">
            Reviews
          </p>
          <h1 className="text-3xl font-black text-foreground">
            รีวิวจากลูกค้า
          </h1>
          <p className="text-sm text-muted-foreground">
            ความประทับใจจากผู้ใช้บริการของเรา
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {stats.map((stat, index) => (
            <div
              key={index}
              className="relative group"
              style={{
                animation: `fadeInUp 0.6s ease-out ${index * 0.15}s both`,
              }}
            >
              <div className="absolute -inset-0.5 bg-gradient-to-r from-primary via-amber-500 to-emerald-500 rounded-lg opacity-0 group-hover:opacity-100 blur-sm transition-all duration-500 group-hover:animate-gradient" />
              <Card className="relative p-6 hover:shadow-xl hover:scale-105 hover:-translate-y-1 transition-all duration-300 bg-background">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-full ${stat.bg}`}>
                    <stat.icon className={`size-6 ${stat.color}`} />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {stat.label}
                    </p>
                    <p className="text-2xl font-bold">{stat.value}</p>
                  </div>
                </div>
              </Card>
            </div>
          ))}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-muted-foreground" />
          <Input
            placeholder="ค้นหางาน"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="pl-10 h-12"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {paginatedReviews.map((review, index) => (
            <div
              key={review.id}
              className="group cursor-pointer"
              onClick={() => setSelectedReview(review)}
              style={{
                animation: `fadeInUp 0.5s ease-out ${index * 0.1}s both`,
              }}
            >
              <Card className="overflow-hidden hover:shadow-xl transition-all duration-300 hover:-translate-y-2 pt-0">
                <div className="relative aspect-[4/3] overflow-hidden">
                  <img
                    src={review.imageUrl}
                    alt={review.eventName}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
                    <span className="text-white font-bold text-sm bg-black/50 px-4 py-2 rounded-full backdrop-blur-sm">
                      ดูรายละเอียด
                    </span>
                  </div>
                </div>
                <div className="p-3 space-y-1.5">
                  <h3 className="font-bold text-base line-clamp-1">
                    {review.eventName}
                  </h3>
                  {review.customerName && (
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {review.customerName}
                    </p>
                  )}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-muted-foreground">
                      {formatReviewDate(review.reviewDate)}
                    </span>
                  </div>
                </div>
              </Card>
            </div>
          ))}
        </div>

        {!isLoading && paginatedReviews.length === 0 && (
          <div className="text-center py-16">
            <p className="text-muted-foreground">
              {debouncedSearch.trim() ? "ไม่พบรีวิวที่ค้นหา" : "ยังไม่มีรีวิว"}
            </p>
          </div>
        )}

        {reviewsQuery.isError && (
          <div className="text-center py-16">
            <p className="text-muted-foreground">
              โหลดรีวิวไม่สำเร็จ กรุณาลองใหม่อีกครั้ง
            </p>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex justify-center items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
            >
              ก่อนหน้า
            </Button>
            <div className="flex gap-1">
              {Array.from({ length: totalPages }).map((_, i) => (
                <Button
                  key={i}
                  variant={currentPage === i + 1 ? "default" : "outline"}
                  size="sm"
                  className="w-10"
                  onClick={() => setCurrentPage(i + 1)}
                >
                  {i + 1}
                </Button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === totalPages}
              onClick={() =>
                setCurrentPage((prev) => Math.min(totalPages, prev + 1))
              }
            >
              ถัดไป
            </Button>
          </div>
        )}
      </div>

      {selectedReview && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 animate-in fade-in duration-300"
          onClick={() => setSelectedReview(null)}
        >
          <div
            className="relative max-w-4xl w-full bg-background rounded-2xl overflow-hidden animate-in zoom-in-95 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-4 right-4 z-10 bg-background/80 hover:bg-background"
              onClick={() => setSelectedReview(null)}
            >
              <X className="size-5" />
            </Button>
            <div className="grid md:grid-cols-2">
              <div className="relative aspect-square md:aspect-auto">
                <img
                  src={selectedReview.imageUrl}
                  alt={selectedReview.eventName}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-8 space-y-4">
                <div>
                  <h2 className="text-2xl font-bold">
                    {selectedReview.eventName}
                  </h2>
                  {selectedReview.customerName && (
                    <p className="text-muted-foreground">
                      {selectedReview.customerName}
                    </p>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  วันที่: {formatReviewDate(selectedReview.reviewDate)}
                </p>
                {selectedReview.content && (
                  <div className="pt-4 border-t">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">
                      {selectedReview.content}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showScrollTop && (
        <Button
          size="icon"
          className="fixed bottom-8 right-8 rounded-full shadow-lg z-40 animate-in slide-in-from-bottom-5"
          onClick={scrollToTop}
        >
          <ArrowUp className="size-5" />
        </Button>
      )}

      <style jsx>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes gradient {
          0%,
          100% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
        }
        .animate-gradient {
          background-size: 200% 200%;
          animation: gradient 3s ease infinite;
        }
      `}</style>
    </main>
  );
}
