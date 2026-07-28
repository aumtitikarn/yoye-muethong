"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import Loading from "@/components/Loading";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CheckCircle2,
  ChevronLeft,
  Landmark,
  Loader2,
  LogIn,
} from "lucide-react";
import {
  useBookingsQuery,
  useSubmitRefundMutation,
  BookingsError,
} from "@/lib/queries";
import { TrackingStatus } from "@/app/tracking/types/enum";

// Common Thai banks + PromptPay — offered as a datalist for convenience
// (free text still allowed).
const THAI_BANKS = [
  "พร้อมเพย์ (PromptPay)",
  "ธนาคารกสิกรไทย",
  "ธนาคารไทยพาณิชย์",
  "ธนาคารกรุงเทพ",
  "ธนาคารกรุงไทย",
  "ธนาคารกรุงศรีอยุธยา",
  "ธนาคารทหารไทยธนชาต (ttb)",
  "ธนาคารออมสิน",
  "ธนาคารเกียรตินาคินภัทร",
  "ธนาคารซีไอเอ็มบี ไทย",
  "ธนาคารยูโอบี",
];

export default function RefundInfoPage() {
  const params = useParams<{ bookingCode: string }>();
  const bookingCode = decodeURIComponent(params.bookingCode ?? "");
  const router = useRouter();

  const { data, isPending, isError, error } = useBookingsQuery();
  const submitRefund = useSubmitRefundMutation(bookingCode);

  const row = useMemo(
    () => (data ?? []).find((b) => b.bookingId === bookingCode),
    [data, bookingCode],
  );

  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountHolder, setAccountHolder] = useState("");

  const isUnauthed =
    isError && error instanceof BookingsError && error.status === 401;

  const digits = accountNumber.replace(/\D/g, "");
  const canSubmit =
    bankName.trim().length > 0 &&
    accountHolder.trim().length > 0 &&
    digits.length >= 6 &&
    !submitRefund.isPending;

  const handleSubmit = () => {
    submitRefund.mutate(
      {
        bankName: bankName.trim(),
        accountNumber: digits,
        accountHolder: accountHolder.trim(),
      },
      {
        onSuccess: () => {
          toast.success("บันทึกข้อมูลคืนเงินเรียบร้อย");
          router.push("/tracking");
        },
        onError: (e) =>
          toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"),
      },
    );
  };

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
            Refund
          </p>
          <h1 className="text-2xl font-black text-foreground">
            ข้อมูลบัญชีรับเงินคืน
          </h1>
          <p className="text-sm text-muted-foreground">
            รหัสการจอง {bookingCode}
          </p>
        </div>

        {isUnauthed && (
          <Card className="p-6 text-center space-y-4">
            <h2 className="text-lg font-semibold">กรุณาเข้าสู่ระบบด้วย LINE</h2>
            <p className="text-sm text-muted-foreground">
              เพื่อยืนยันว่าเป็นเจ้าของรายการจองนี้
            </p>
            <Button
              onClick={() => {
                window.location.href = `/api/auth/line/login?returnTo=${encodeURIComponent(
                  `/refund/${bookingCode}`,
                )}`;
              }}
            >
              <LogIn className="size-4" /> เข้าสู่ระบบด้วย LINE
            </Button>
          </Card>
        )}

        {!isPending && !isUnauthed && !row && (
          <Card className="p-6 text-center space-y-3">
            <h2 className="text-lg font-semibold">ไม่พบรายการจอง</h2>
            <Button variant="outline" asChild>
              <Link href="/tracking">กลับหน้าติดตามสถานะ</Link>
            </Button>
          </Card>
        )}

        {row && row.status !== TrackingStatus.WAIT_REFUND && (
          <Card className="p-6 text-center space-y-3">
            <h2 className="text-lg font-semibold">
              รายการนี้ยังไม่อยู่ในสถานะรอคืนเงิน
            </h2>
            <Button variant="outline" asChild>
              <Link href="/tracking">กลับหน้าติดตามสถานะ</Link>
            </Button>
          </Card>
        )}

        {row && row.status === TrackingStatus.WAIT_REFUND && (
          <>
            {row.haveRefundInfo && (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                <CheckCircle2 className="size-4 shrink-0" />
                เคยส่งข้อมูลบัญชีไว้แล้ว — บันทึกอีกครั้งเพื่ออัปเดตข้อมูล
              </div>
            )}

            <Card className="p-5 space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">งาน</p>
                <p className="font-semibold text-foreground">
                  {row.concertName}
                </p>
              </div>
            </Card>

            <Card className="space-y-4 p-5">
              <div className="flex items-center gap-2 font-semibold text-foreground">
                <Landmark className="size-4 text-primary" /> บัญชีสำหรับรับเงินคืน
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="bankName" className="text-sm font-medium">
                  ธนาคาร <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="bankName"
                  list="bank-list"
                  placeholder="เช่น ธนาคารกสิกรไทย"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className="h-11 rounded-xl"
                />
                <datalist id="bank-list">
                  {THAI_BANKS.map((b) => (
                    <option key={b} value={b} />
                  ))}
                </datalist>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="accountNumber" className="text-sm font-medium">
                  เลขบัญชี / PromptPay / เลขบัตรประชาชน{" "}
                  <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="accountNumber"
                  inputMode="numeric"
                  placeholder="เลขบัญชี, เบอร์ PromptPay หรือเลขบัตรประชาชน"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  className="h-11 rounded-xl"
                />
                <p className="text-xs text-muted-foreground">
                  กรอกอย่างใดอย่างหนึ่ง — เลขบัญชีธนาคาร, เบอร์พร้อมเพย์
                  หรือเลขบัตรประชาชน (เฉพาะตัวเลข)
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="accountHolder" className="text-sm font-medium">
                  ชื่อเจ้าของบัญชี <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="accountHolder"
                  placeholder="ชื่อ-นามสกุล เจ้าของบัญชี"
                  value={accountHolder}
                  onChange={(e) => setAccountHolder(e.target.value)}
                  className="h-11 rounded-xl"
                />
              </div>

              <Button
                className="w-full"
                size="lg"
                disabled={!canSubmit}
                onClick={handleSubmit}
              >
                {submitRefund.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> กำลังบันทึก...
                  </>
                ) : (
                  "บันทึกข้อมูลคืนเงิน"
                )}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                ทางร้านจะโอนเงินคืนเข้าบัญชีนี้ กรุณาตรวจสอบข้อมูลให้ถูกต้อง
              </p>
            </Card>
          </>
        )}
      </div>
    </main>
  );
}
