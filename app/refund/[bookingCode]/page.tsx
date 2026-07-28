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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

const OTHER_BANK = "__other__";

// Bilingual bank list for the refund account. "Other" lets the customer type a
// bank not in the list; PromptPay is a first-class option.
const BANK_OPTIONS = [
  "พร้อมเพย์ (PromptPay)",
  "กสิกรไทย / Kasikornbank (KBank)",
  "ไทยพาณิชย์ / Siam Commercial Bank (SCB)",
  "กรุงเทพ / Bangkok Bank (BBL)",
  "กรุงไทย / Krung Thai Bank (KTB)",
  "ออมสิน / Government Savings Bank (GSB)",
  "ทีทีบี / ttb bank (formerly TMBThanachart)",
  "ยูโอบี / United Overseas Bank (UOB)",
  "ซีไอเอ็มบี ไทย / CIMB Thai Bank",
  "แลนด์ แอนด์ เฮ้าส์ / Land and Houses Bank (LH Bank)",
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

  const [bankSelect, setBankSelect] = useState("");
  const [bankOther, setBankOther] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [amount, setAmount] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const isUnauthed =
    isError && error instanceof BookingsError && error.status === 401;

  const bankName =
    bankSelect === OTHER_BANK ? bankOther.trim() : bankSelect.trim();
  const digits = accountNumber.replace(/\D/g, "");
  const amountNum = Number(amount);

  const canSubmit =
    bankName.length > 0 &&
    accountHolder.trim().length > 0 &&
    digits.length >= 6 &&
    Number.isFinite(amountNum) &&
    amountNum > 0 &&
    confirmed &&
    !submitRefund.isPending;

  const handleSubmit = () => {
    submitRefund.mutate(
      {
        bankName,
        accountNumber: digits,
        accountHolder: accountHolder.trim(),
        amount: amountNum,
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

            <Card className="space-y-5 p-5">
              <div className="flex items-center gap-2 font-semibold text-foreground">
                <Landmark className="size-4 text-primary" /> บัญชีสำหรับรับเงินคืน
              </div>

              {/* Bank name */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">
                  ชื่อธนาคาร / Bank Name{" "}
                  <span className="text-destructive">*</span>
                </Label>
                <Select value={bankSelect} onValueChange={setBankSelect}>
                  <SelectTrigger className="h-11 rounded-xl">
                    <SelectValue placeholder="เลือกธนาคาร / Select bank" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={OTHER_BANK}>
                      Other (Please specify bank name)
                    </SelectItem>
                    {BANK_OPTIONS.map((b) => (
                      <SelectItem key={b} value={b}>
                        {b}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {bankSelect === OTHER_BANK && (
                  <Input
                    placeholder="ระบุชื่อธนาคาร / Specify bank name"
                    value={bankOther}
                    onChange={(e) => setBankOther(e.target.value)}
                    className="mt-2 h-11 rounded-xl"
                  />
                )}
              </div>

              {/* Account number / PromptPay ID */}
              <div className="space-y-1.5">
                <Label htmlFor="accountNumber" className="text-sm font-medium">
                  เลขบัญชี / Account Number หรือ เบอร์โทรศัพท์ / เลขบัตรประชาชน
                  (PromptPay ID){" "}
                  <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="accountNumber"
                  inputMode="numeric"
                  placeholder="กรอกเฉพาะตัวเลข / Numbers only"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  className="h-11 rounded-xl"
                />
                <div className="space-y-0.5 text-xs text-muted-foreground">
                  <p>กรุณากรอกเลขบัญชีให้ครบทุกตัว (ไม่เว้นวรรค / ไม่ใส่ขีด)</p>
                  <p>
                    หากเลือก PromptPay กรุณากรอก เบอร์โทรศัพท์ หรือ
                    เลขบัตรประชาชน เท่านั้น
                  </p>
                  <p>Please enter the full account number (no spaces / no dashes).</p>
                  <p>
                    If you selected PromptPay, please enter your mobile number or
                    national ID only.
                  </p>
                </div>
                <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                  <p>⚠️ หากกรอกข้อมูลไม่ถูกต้อง ร้านไม่สามารถโอนคืนได้</p>
                  <p>⚠️ If the information is incorrect, the shop cannot process the refund.</p>
                </div>
              </div>

              {/* Account holder */}
              <div className="space-y-1.5">
                <Label htmlFor="accountHolder" className="text-sm font-medium">
                  ชื่อเจ้าของบัญชี / Account Holder Name{" "}
                  <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="accountHolder"
                  placeholder="ชื่อ-นามสกุล / Full name"
                  value={accountHolder}
                  onChange={(e) => setAccountHolder(e.target.value)}
                  className="h-11 rounded-xl"
                />
                <div className="space-y-0.5 text-xs text-muted-foreground">
                  <p>กรุณากรอกชื่อเจ้าของบัญชีให้ตรงกับบัญชีจริง</p>
                  <p>
                    Please enter the account holder&rsquo;s name exactly as shown
                    on the bank account.
                  </p>
                </div>
              </div>

              {/* Refund amount */}
              <div className="space-y-1.5">
                <Label htmlFor="amount" className="text-sm font-medium">
                  ยอดเงินคืน / Refund Amount{" "}
                  <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="amount"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="h-11 rounded-xl"
                />
                <div className="space-y-0.5 text-xs text-muted-foreground">
                  <p>กรุณากรอก ยอดเงินคืนตามที่ร้านแจ้งเท่านั้น</p>
                  <p>Please enter the refund amount exactly as confirmed by the shop.</p>
                </div>
              </div>

              {/* Confirmation */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">
                  ✅ ยืนยันความถูกต้องของข้อมูล / Confirmation{" "}
                  <span className="text-destructive">*</span>
                </Label>
                <label
                  htmlFor="confirm"
                  className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/60 p-3 text-xs text-muted-foreground"
                >
                  <Checkbox
                    id="confirm"
                    checked={confirmed}
                    onCheckedChange={(v) => setConfirmed(v === true)}
                    className="mt-0.5"
                  />
                  <span>
                    ข้าพเจ้ายืนยันว่าข้อมูลบัญชีทั้งหมดถูกต้อง หากกรอกผิด
                    ร้านขอสงวนสิทธิ์ไม่รับผิดชอบ / I confirm that all bank details
                    are correct. The shop is not responsible for errors caused by
                    incorrect information.
                  </span>
                </label>
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
                  "บันทึกข้อมูลคืนเงิน / Submit"
                )}
              </Button>
            </Card>
          </>
        )}
      </div>
    </main>
  );
}
