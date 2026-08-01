"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Loading from "@/components/Loading";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { STATUS_METADATA, TrackingStatus } from "./types/enum";
import type { TrackingRowDTO } from "@/lib/api";
import {
  useBookingsQuery,
  useCancelBookingMutation,
  BookingsError,
} from "@/lib/queries";
import {
  ChevronLeft,
  ChevronRight,
  ClipboardPen,
  CreditCard,
  EllipsisVertical,
  FileText,
  Landmark,
  Loader2,
  RefreshCcw,
  TriangleAlert,
  XCircle,
} from "lucide-react";

type TrackingRow = {
  bookingId: string;
  concertName: string;
  showTime: string;
  zone: string;
  status: TrackingStatus;
  paymentDeadline?: Date;
  totalPrice: number;
  haveDeepInfo: boolean;
  haveRefundInfo: boolean;
  canCancel: boolean;
};

const PAGE_SIZE = 5;

function dtoToRow(dto: TrackingRowDTO): TrackingRow {
  return {
    bookingId: dto.bookingId,
    concertName: dto.concertName,
    showTime: dto.showTime,
    zone: dto.zone,
    status: dto.status as TrackingStatus,
    paymentDeadline: dto.paymentDeadline
      ? new Date(dto.paymentDeadline)
      : undefined,
    totalPrice: dto.totalPrice,
    haveDeepInfo: dto.haveDeepInfo,
    haveRefundInfo: dto.haveRefundInfo,
    canCancel: dto.canCancel,
  };
}

/** Three-dots menu: booking detail, plus self-cancel while it is still allowed. */
function BookingRowMenu({
  bookingId,
  canCancel,
  onCancel,
}: {
  bookingId: string;
  canCancel: boolean;
  onCancel: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="size-8 rounded-full text-muted-foreground hover:text-foreground"
          aria-label="ตัวเลือกเพิ่มเติม"
        >
          <EllipsisVertical className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-52 bg-background p-1 shadow-lg"
      >
        <Link
          href={`/bookings/${bookingId}`}
          className="flex items-center gap-2 rounded-md px-2 py-2 text-sm font-medium transition-colors hover:bg-muted"
        >
          <FileText className="size-4" />
          รายละเอียดการจอง
        </Link>
        {canCancel && (
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onCancel();
            }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50"
          >
            <XCircle className="size-4" />
            ยกเลิกการจอง
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Confirmation for a customer-initiated cancellation. The deposit is forfeited
 * with no exceptions, so the warning is stated plainly and confirming takes a
 * deliberate second click.
 */
function CancelBookingDialog({
  bookingId,
  onOpenChange,
  onConfirm,
  isPending,
}: {
  bookingId: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isPending: boolean;
}) {
  return (
    <Dialog
      open={bookingId !== null}
      onOpenChange={(open) => {
        // Never let a backdrop click close the dialog mid-request.
        if (!isPending) onOpenChange(open);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-1 flex size-12 items-center justify-center rounded-full bg-rose-100">
            <TriangleAlert className="size-6 text-rose-600" />
          </div>
          <DialogTitle className="text-center">ยืนยันการยกเลิกการจอง</DialogTitle>
          <DialogDescription className="text-center">
            รหัสการจอง{" "}
            <span className="font-semibold text-foreground">{bookingId}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4 text-center text-sm text-rose-700">
          เมื่อยกเลิกการจอง <span className="font-bold">จะไม่มีการคืนมัดจำทุกกรณี</span>
          <br />
          คุณยังยืนยันการทำรายการหรือไม่
        </div>

        <DialogFooter className="sm:justify-center">
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
          >
            ไม่ใช่ตอนนี้
          </Button>
          <Button
            className="w-full gap-1.5 bg-rose-600 text-white hover:bg-rose-700 sm:w-auto"
            disabled={isPending}
            onClick={onConfirm}
          >
            {isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <XCircle className="size-4" />
            )}
            ยืนยันยกเลิกการจอง
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function TrackingPage() {
  const router = useRouter();
  const {
    data,
    isPending,
    isError,
    error,
    refetch,
    isFetching,
    dataUpdatedAt,
  } = useBookingsQuery();

  const bookings = useMemo(() => (data ?? []).map(dtoToRow), [data]);
  const isUnauthed =
    isError && error instanceof BookingsError && error.status === 401;
  const isLoadError = isError && !isUnauthed;
  const isReady = !isPending && !isError;

  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  // Booking code awaiting cancellation confirmation (null = dialog closed).
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const cancelBooking = useCancelBookingMutation();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);

  const lastUpdated = useMemo(
    () => (dataUpdatedAt ? new Date(dataUpdatedAt) : new Date()),
    [dataUpdatedAt],
  );

  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return bookings;
    const query = searchQuery.toLowerCase();
    return bookings.filter((row) =>
      [row.bookingId, row.concertName, row.showTime, row.zone, row.status]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [bookings, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const clampedPage = Math.min(currentPage, totalPages);
  const paginatedRows = useMemo(() => {
    const start = (clampedPage - 1) * PAGE_SIZE;
    return filteredRows.slice(start, start + PAGE_SIZE);
  }, [clampedPage, filteredRows]);

  const showingFrom = filteredRows.length
    ? (clampedPage - 1) * PAGE_SIZE + 1
    : 0;
  const showingTo = filteredRows.length
    ? Math.min(clampedPage * PAGE_SIZE, filteredRows.length)
    : 0;
  const formattedLastUpdated = useMemo(
    () =>
      new Intl.DateTimeFormat("th-TH", {
        dateStyle: "long",
        timeStyle: "short",
      }).format(lastUpdated),
    [lastUpdated],
  );

  const handleRefresh = () => {
    setCurrentPage(1);
    refetch();
  };

  const handleConfirmCancel = () => {
    if (!cancelTarget) return;
    cancelBooking.mutate(cancelTarget, {
      onSuccess: () => {
        toast.success(`ยกเลิกการจอง ${cancelTarget} เรียบร้อยแล้ว`);
        setCancelTarget(null);
      },
      onError: (err) => {
        toast.error(
          err instanceof Error ? err.message : "ยกเลิกการจองไม่สำเร็จ",
        );
        // Keep the dialog open so the customer can read the reason and retry.
      },
    });
  };

  const checkScrollButtons = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const { scrollLeft, scrollWidth, clientWidth } = container;
    setShowLeftArrow(scrollLeft > 0);
    setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 10);
  }, []);

  useEffect(() => {
    checkScrollButtons();
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener("scroll", checkScrollButtons);
      window.addEventListener("resize", checkScrollButtons);
      return () => {
        container.removeEventListener("scroll", checkScrollButtons);
        window.removeEventListener("resize", checkScrollButtons);
      };
    }
  }, [checkScrollButtons]);

  const scroll = (direction: "left" | "right") => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const scrollAmount = 400;
    container.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  const urgentPayments = useMemo(() => {
    const now = new Date();
    return bookings.filter((row) => {
      if (!row.paymentDeadline) return false;

      if (row.status === TrackingStatus.WAIT_SERVICE_FEE) {
        return true;
      }

      if (row.status === TrackingStatus.WAIT_FULL_PAYMENT) {
        const daysUntilDeadline = Math.ceil(
          (row.paymentDeadline.getTime() - now.getTime()) /
            (1000 * 60 * 60 * 24),
        );
        return daysUntilDeadline <= 3 && daysUntilDeadline >= 0;
      }

      return false;
    });
  }, [bookings]);

  return (
    <main className="min-h-screen px-3 py-4 sm:px-4">
      {isPending && <Loading />}
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="text-center space-y-2 px-2">
          <p className="text-xs sm:text-sm uppercase tracking-[0.3em] text-muted-foreground">
            Tracking
          </p>
          <h1 className="text-2xl sm:text-3xl font-black text-foreground">
            ติดตามสถานะการจองของคุณ
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
            ตรวจสอบสถานะล่าสุดของคำสั่งซื้อและการชำระเงิน
          </p>
        </div>

        {isUnauthed && (
          <div className="rounded-3xl border border-border/60 bg-background/80 shadow-sm p-8 text-center space-y-4">
            <h2 className="text-lg font-semibold">
              กรุณาเข้าสู่ระบบด้วย LINE
            </h2>
            <p className="text-muted-foreground text-sm max-w-md mx-auto">
              เข้าสู่ระบบเพื่อดูสถานะการจองของคุณ
            </p>
            <Button
              size="lg"
              onClick={() => {
                window.location.href = `/api/auth/line/login?returnTo=${encodeURIComponent(
                  "/tracking",
                )}`;
              }}
            >
              เข้าสู่ระบบด้วย LINE
            </Button>
          </div>
        )}

        {isLoadError && (
          <div className="rounded-3xl border border-rose-200 bg-rose-50/60 shadow-sm p-8 text-center space-y-4">
            <h2 className="text-lg font-semibold text-rose-700">
              {error?.message ?? "ไม่สามารถโหลดข้อมูลการจองได้"}
            </h2>
            <Button variant="outline" size="lg" onClick={() => refetch()}>
              ลองอีกครั้ง
            </Button>
          </div>
        )}

        {isReady && (
          <>
        {urgentPayments.length > 0 && (
          <div className="relative">
            {showLeftArrow && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute left-5 top-1/2 -translate-y-1/2 z-10 size-10 rounded-full bg-background/90 shadow-lg backdrop-blur-sm hover:bg-background animate-bounce-left"
                onClick={() => scroll("left")}
              >
                <ChevronLeft className="size-5" />
              </Button>
            )}
            {showRightArrow && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-5 top-1/2 -translate-y-1/2 z-10 size-10 rounded-full bg-background/90 shadow-lg backdrop-blur-sm hover:bg-background animate-bounce-right"
                onClick={() => scroll("right")}
              >
                <ChevronRight className="size-5" />
              </Button>
            )}
            <div
              ref={scrollContainerRef}
              className="flex gap-4 overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-2"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            >
              {urgentPayments.map((row) => {
                const formattedDeadline = row.paymentDeadline
                  ? new Intl.DateTimeFormat("th-TH", {
                      dateStyle: "long",
                    }).format(row.paymentDeadline)
                  : "";
                const payHref =
                  row.status === TrackingStatus.WAIT_SERVICE_FEE
                    ? `/payments/${row.bookingId}`
                    : row.status === TrackingStatus.WAIT_FULL_PAYMENT
                      ? `/payments/ticket/${row.bookingId}`
                      : "/bookings";

                return (
                  <Card
                    key={row.bookingId}
                    className="py-4 px-4 relative flex-shrink-0 w-full sm:w-[380px] overflow-hidden border-2 border-amber-500 bg-gradient-to-br from-amber-50 via-orange-50 to-amber-50 shadow-lg shadow-amber-500/20 snap-start"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-amber-400/10 via-orange-400/10 to-amber-400/10 animate-gradient-slow" />
                    <div className="relative flex flex-col h-full justify-between space-y-4">
                      {/* Topic: Concert Name */}
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <div className="flex-shrink-0 size-8 rounded-full bg-amber-500 flex items-center justify-center shadow-md">
                            <CreditCard className="size-4 text-white" />
                          </div>
                          <span className="text-amber-500 font-bold ">
                            โปรดชำระค่าบัตร
                          </span>
                        </div>
                        <h3 className="text-lg font-black text-amber-900 ">
                          {row.concertName}
                        </h3>
                      </div>

                      {/* Info Grid: Date & Price */}
                      <div className="grid grid-cols-2 gap-3 border-t border-amber-500/20 pt-3">
                        <div>
                          <p className="text-[10px] text-amber-800/70 font-medium">
                            ภายในวันที่
                          </p>
                          <p className="text-sm font-bold text-amber-900">
                            {formattedDeadline}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-amber-800/70 font-medium">
                            ยอดที่ต้องชำระ
                          </p>
                          <p className="text-xl font-black text-amber-600">
                            ฿{row.totalPrice.toLocaleString()}
                          </p>
                        </div>
                      </div>

                      {/* Pay Button */}
                      <Button
                        size="sm"
                        className="w-full gap-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold shadow-md shadow-amber-500/20"
                        asChild
                      >
                        <Link href={payHref}>
                          <CreditCard className="size-4" />
                          ชำระเงินทันที
                        </Link>
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        <div className="rounded-3xl border border-border/60 bg-background/80 shadow-sm p-4 sm:p-6 space-y-4">
          {bookings.length === 0 ? (
            <div className="text-center space-y-4 py-16">
              <h2 className="text-lg font-semibold">
                ยังไม่มีข้อมูลการจองคิวของท่าน
              </h2>
              <p className="text-muted-foreground text-sm">
                เริ่มต้นจองคิวเพื่อดูสถานะที่นี่
              </p>
              <Button size="lg" asChild>
                <Link href="/bookings">จองคิว</Link>
              </Button>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-4 text-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 w-full">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1);
                    }}
                    placeholder="ค้นหารหัสการจอง คอนเสิร์ต หรือสถานะ"
                    className="w-full rounded-2xl border border-border/60 bg-white/80 px-4 py-2 text-sm shadow-inner focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
                <div className="flex flex-col gap-2 text-xs sm:text-sm sm:flex-row sm:items-center sm:justify-end">
                  <span className="text-muted-foreground">
                    อัปเดตล่าสุด: {formattedLastUpdated}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full sm:w-auto"
                    onClick={handleRefresh}
                  >
                    <RefreshCcw
                      className={`mr-1.5 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`}
                    />
                    รีเฟรช
                  </Button>
                </div>
              </div>

              {/* Mobile stacked cards */}
              <div className="space-y-3 sm:hidden">
                {paginatedRows.map((row) => {
                  const needsPayment =
                    row.status === TrackingStatus.WAIT_FULL_PAYMENT ||
                    row.status === TrackingStatus.WAIT_SERVICE_FEE;
                  const canFillDeepInfo =
                    (row.status === TrackingStatus.BOOKING_CONFIRMED ||
                      row.status === TrackingStatus.WAIT_BOOKING_INFO) &&
                    !row.haveDeepInfo;
                  // Service fee (ค่ากด) and ฝากจ่าย ticket payment each have
                  // their own per-booking Omise page.
                  const payHref =
                    row.status === TrackingStatus.WAIT_SERVICE_FEE
                      ? `/payments/${row.bookingId}`
                      : row.status === TrackingStatus.WAIT_FULL_PAYMENT
                        ? `/payments/ticket/${row.bookingId}`
                        : "/bookings";
                  return (
                    <div
                      key={row.bookingId}
                      className="rounded-2xl border border-border/40 bg-white/90 p-4 shadow-sm"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs text-muted-foreground">
                            รหัสการจอง
                          </p>
                          <p className="text-base font-bold">{row.bookingId}</p>
                        </div>
                        <span
                          className={`inline-flex items-center justify-center rounded-full px-3 py-1 text-[11px] font-semibold ${STATUS_METADATA[row.status].colorClass}`}
                        >
                          {row.status}
                        </span>
                      </div>
                      <div className="mt-3 space-y-1 text-sm">
                        <p className="font-medium text-foreground">
                          {row.concertName}
                        </p>
                        <p className="text-muted-foreground">{row.showTime}</p>
                        <p className="text-muted-foreground">โซน: {row.zone}</p>
                        {row.status === TrackingStatus.WAIT_FULL_PAYMENT &&
                          row.paymentDeadline && (
                            <p className="text-xs text-amber-700 font-medium">
                              ⏰ ชำระก่อน:{" "}
                              {new Intl.DateTimeFormat("th-TH", {
                                dateStyle: "medium",
                              }).format(row.paymentDeadline)}
                            </p>
                          )}
                      </div>
                      {canFillDeepInfo && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="mt-3 w-full gap-1.5 btn-glow-border rounded-xl font-semibold text-foreground"
                          asChild
                        >
                          <Link href={`/bookings/${row.bookingId}?edit=1`}>
                            <ClipboardPen className="size-3.5" />
                            กรอกข้อมูลการจองเพิ่มเติม
                          </Link>
                        </Button>
                      )}
                      {row.status === TrackingStatus.WAIT_REFUND && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="mt-2 w-full gap-1.5 btn-glow-border rounded-xl font-semibold text-foreground"
                          asChild
                        >
                          <Link href={`/refund/${row.bookingId}`}>
                            <Landmark className="size-3.5" />
                            {row.haveRefundInfo
                              ? "แก้ไขข้อมูลคืนเงิน"
                              : "เพิ่มข้อมูลคืนเงิน"}
                          </Link>
                        </Button>
                      )}
                      {needsPayment && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="mt-2 w-full gap-1.5 btn-glow-border rounded-xl font-semibold text-foreground"
                          asChild
                        >
                          <Link href={payHref}>
                            <CreditCard className="size-3.5" />
                            ชำระเงิน
                          </Link>
                        </Button>
                      )}
                      {row.canCancel && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="mt-2 w-full gap-1.5 rounded-xl font-semibold text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                          onClick={() => setCancelTarget(row.bookingId)}
                        >
                          <XCircle className="size-3.5" />
                          ยกเลิกการจอง
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="hidden sm:block overflow-hidden rounded-2xl border border-border/50">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>รหัสการจอง</TableHead>
                      <TableHead>คอนเสิร์ต</TableHead>
                      <TableHead>รอบการแสดง</TableHead>
                      <TableHead>โซน</TableHead>
                      <TableHead className="text-right">สถานะ</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedRows.map((row) => {
                      const needsPayment =
                        row.status === TrackingStatus.WAIT_FULL_PAYMENT ||
                        row.status === TrackingStatus.WAIT_SERVICE_FEE;
                      const canFillDeepInfo =
                        (row.status === TrackingStatus.BOOKING_CONFIRMED ||
                          row.status === TrackingStatus.WAIT_BOOKING_INFO) &&
                        !row.haveDeepInfo;
                      // Service fee (ค่ากด) → dedicated Omise page;
                      // ฝากจ่าย ticket payment → its own Omise page.
                      const payHref =
                        row.status === TrackingStatus.WAIT_SERVICE_FEE
                          ? `/payments/${row.bookingId}`
                          : row.status === TrackingStatus.WAIT_FULL_PAYMENT
                            ? `/payments/ticket/${row.bookingId}`
                            : "/bookings";
                      return (
                        <TableRow
                          key={row.bookingId}
                          className="cursor-pointer transition-colors hover:bg-muted/50"
                          onClick={() =>
                            router.push(`/bookings/${row.bookingId}`)
                          }
                        >
                          <TableCell className="font-semibold text-base">
                            {row.bookingId}
                          </TableCell>
                          <TableCell>
                            <div>
                              <p>{row.concertName}</p>
                              {row.status ===
                                TrackingStatus.WAIT_FULL_PAYMENT &&
                                row.paymentDeadline && (
                                  <p className="text-xs text-amber-700 font-medium mt-1">
                                    ⏰ ชำระก่อน:{" "}
                                    {new Intl.DateTimeFormat("th-TH", {
                                      dateStyle: "medium",
                                    }).format(row.paymentDeadline)}
                                  </p>
                                )}
                            </div>
                          </TableCell>
                          <TableCell>{row.showTime}</TableCell>
                          <TableCell>{row.zone}</TableCell>
                          <TableCell className="text-right">
                            <div
                              className="flex items-center justify-end gap-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {canFillDeepInfo && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="gap-1.5 text-xs btn-glow-border rounded-xl font-semibold text-foreground"
                                  asChild
                                >
                                  <Link href={`/bookings/${row.bookingId}?edit=1`}>
                                    <ClipboardPen className="size-3.5" />
                                    กรอกข้อมูลเพิ่มเติม
                                  </Link>
                                </Button>
                              )}
                              {row.status === TrackingStatus.WAIT_REFUND && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="gap-1.5 text-xs btn-glow-border rounded-xl font-semibold text-foreground"
                                  asChild
                                >
                                  <Link href={`/refund/${row.bookingId}`}>
                                    <Landmark className="size-3.5" />
                                    {row.haveRefundInfo
                                      ? "แก้ไขข้อมูลคืนเงิน"
                                      : "เพิ่มข้อมูลคืนเงิน"}
                                  </Link>
                                </Button>
                              )}
                              {needsPayment && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="gap-1.5 text-xs btn-glow-border rounded-xl font-semibold text-foreground"
                                  asChild
                                >
                                  <Link href={payHref}>
                                    <CreditCard className="size-3.5" />
                                    ชำระเงิน
                                  </Link>
                                </Button>
                              )}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span
                                    className={`inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-semibold ${STATUS_METADATA[row.status].colorClass}`}
                                  >
                                    {row.status}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent
                                  side="left"
                                  className="max-w-xs text-left"
                                >
                                  {STATUS_METADATA[row.status].description}
                                </TooltipContent>
                              </Tooltip>
                            </div>
                          </TableCell>
                          <TableCell
                            className="text-right"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <BookingRowMenu
                              bookingId={row.bookingId}
                              canCancel={row.canCancel}
                              onCancel={() => setCancelTarget(row.bookingId)}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-sm text-muted-foreground"
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <p>
                            แสดง {showingFrom}-{showingTo} จาก {bookings.length}{" "}
                            รายการ
                          </p>
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full sm:w-auto"
                              disabled={clampedPage === 1}
                              onClick={() =>
                                setCurrentPage((prev) => Math.max(1, prev - 1))
                              }
                            >
                              ก่อนหน้า
                            </Button>
                            <span className="font-semibold text-foreground text-center">
                              หน้า {clampedPage} / {totalPages}
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full sm:w-auto"
                              disabled={clampedPage === totalPages}
                              onClick={() =>
                                setCurrentPage((prev) =>
                                  Math.min(totalPages, prev + 1),
                                )
                              }
                            >
                              ถัดไป
                            </Button>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>

              {/* Pagination helper for mobile */}
              <div className="sm:hidden space-y-2 text-sm text-center text-muted-foreground">
                <p>
                  แสดง {showingFrom}-{showingTo} จาก {bookings.length} รายการ
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={clampedPage === 1}
                    onClick={() =>
                      setCurrentPage((prev) => Math.max(1, prev - 1))
                    }
                  >
                    ก่อนหน้า
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={clampedPage === totalPages}
                    onClick={() =>
                      setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                    }
                  >
                    ถัดไป
                  </Button>
                </div>
                <p className="font-semibold text-foreground">
                  หน้า {clampedPage} / {totalPages}
                </p>
              </div>
            </>
          )}
        </div>
          </>
        )}
      </div>

      <CancelBookingDialog
        bookingId={cancelTarget}
        onOpenChange={(open) => {
          if (!open) setCancelTarget(null);
        }}
        onConfirm={handleConfirmCancel}
        isPending={cancelBooking.isPending}
      />
    </main>
  );
}
