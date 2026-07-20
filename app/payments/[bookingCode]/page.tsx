"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import Loading from "@/components/Loading";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckCircle2, ChevronLeft } from "lucide-react";
import { useServiceFeeInfoQuery } from "@/lib/queries";
import { PaymentAuthError } from "@/lib/api";
import ServiceFeePayment from "./ServiceFeePayment";

export default function ServiceFeePaymentPage() {
  const params = useParams<{ bookingCode: string }>();
  const bookingCode = decodeURIComponent(params.bookingCode ?? "");

  const { data, isPending, isError, error } =
    useServiceFeeInfoQuery(bookingCode);

  const isUnauthed = isError && error instanceof PaymentAuthError;

  return (
    <main className="min-h-screen px-3 py-6 sm:px-4">
      {isPending && <Loading />}
      <div className="mx-auto max-w-lg space-y-5">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/tracking">
            <ChevronLeft className="size-4" /> กลับหน้าติดตามสถานะ
          </Link>
        </Button>

        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
            Payment
          </p>
          <h1 className="text-2xl font-black text-foreground">ชำระค่ากดบัตร</h1>
          <p className="text-sm text-muted-foreground">
            รหัสการจอง {bookingCode}
          </p>
        </div>

        {isUnauthed && (
          <Card className="p-6 text-center space-y-4">
            <h2 className="text-lg font-semibold">กรุณาเข้าสู่ระบบด้วย LINE</h2>
            <p className="text-sm text-muted-foreground">
              เข้าสู่ระบบเพื่อยืนยันว่าเป็นเจ้าของรายการจองนี้
            </p>
            <Button
              size="lg"
              onClick={() => {
                window.location.href = `/api/auth/line/login?returnTo=${encodeURIComponent(
                  `/payments/${bookingCode}`
                )}`;
              }}
            >
              เข้าสู่ระบบด้วย LINE
            </Button>
          </Card>
        )}

        {isError && !isUnauthed && (
          <Card className="p-6 text-center space-y-3 border-rose-200 bg-rose-50/60">
            <h2 className="text-lg font-semibold text-rose-700">
              {error instanceof Error
                ? error.message
                : "ไม่พบข้อมูลการจอง"}
            </h2>
            <Button variant="outline" asChild>
              <Link href="/tracking">กลับหน้าติดตามสถานะ</Link>
            </Button>
          </Card>
        )}

        {data && data.alreadyPaid && (
          <Card className="p-6 text-center space-y-3 border-emerald-200 bg-emerald-50/60">
            <CheckCircle2 className="mx-auto size-8 text-emerald-600" />
            <h2 className="text-lg font-semibold text-emerald-700">
              ชำระค่ากดเรียบร้อยแล้ว
            </h2>
            <Button variant="outline" asChild>
              <Link href="/tracking">กลับหน้าติดตามสถานะ</Link>
            </Button>
          </Card>
        )}

        {data && !data.alreadyPaid && !data.payable && (
          <Card className="p-6 text-center space-y-3">
            <h2 className="text-lg font-semibold">
              รายการนี้ยังไม่ต้องชำระค่ากด
            </h2>
            <p className="text-sm text-muted-foreground">
              เมื่อมีรายชื่อและถึงขั้นตอนชำระค่ากด ปุ่มชำระเงินจะแสดงที่นี่
            </p>
            <Button variant="outline" asChild>
              <Link href="/tracking">กลับหน้าติดตามสถานะ</Link>
            </Button>
          </Card>
        )}

        {data && data.payable && (
          <>
            <Card className="p-5 space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">งาน</p>
                <p className="font-semibold text-foreground">{data.eventName}</p>
              </div>
              <div className="flex items-center justify-between border-t border-border/50 pt-3 text-sm">
                <span className="text-muted-foreground">
                  ค่ากด × {data.quantity} รายชื่อ
                </span>
                <span className="text-foreground">
                  ฿{data.feePerEntry.toLocaleString()} / รายชื่อ
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-border/50 pt-3">
                <span className="font-semibold text-foreground">ยอดที่ต้องชำระ</span>
                <span className="text-2xl font-black text-primary">
                  ฿{data.amountBaht.toLocaleString()}
                </span>
              </div>
            </Card>

            <ServiceFeePayment
              bookingCode={data.bookingCode}
              amountBaht={data.amountBaht}
            />
          </>
        )}
      </div>
    </main>
  );
}
