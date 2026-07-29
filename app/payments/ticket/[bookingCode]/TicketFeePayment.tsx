"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Script from "next/script";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { CheckCircle2, CreditCard, Loader2, LogIn, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  createTicketFeeCharge,
  confirmTicketFeeCharge,
  getOmiseChargeStatus,
  PaymentAuthError,
  type OmiseChargeStatus,
} from "@/lib/api";

// ── OmiseCard (Omise.js) typings ───────────────────────────────────
interface OmiseCardOpenOptions {
  amount: number;
  currency: string;
  defaultPaymentMethod?: string;
  otherPaymentMethods?: string[];
  frameLabel?: string;
  submitLabel?: string;
  buttonLabel?: string;
  onCreateTokenSuccess: (nonce: string) => void;
  onFormClosed?: () => void;
}
interface OmiseCardApi {
  configure: (opts: { publicKey: string }) => void;
  open: (opts: OmiseCardOpenOptions) => void;
}
declare global {
  interface Window {
    OmiseCard?: OmiseCardApi;
  }
}

const PUBLIC_KEY = process.env.NEXT_PUBLIC_OMISE_PUBLIC_KEY ?? "";

const OTHER_METHODS = [
  "credit_card",
  "internet_banking",
  "mobile_banking",
  "truemoney",
  "rabbit_linepay",
  "shopeepay",
  "alipay",
  "wechat_pay",
];

const PENDING_KEY = "yoye_omise_pending_ticket_fee";
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000; // 10 min

type Phase =
  | { kind: "idle" }
  | { kind: "processing" }
  | { kind: "needLogin" }
  | { kind: "promptpay"; qrUri: string; chargeId: string }
  | { kind: "polling"; chargeId: string }
  | { kind: "success" }
  | { kind: "failed"; message: string };

interface TicketFeePaymentProps {
  readonly bookingCode: string;
  readonly amountBaht: number;
}

export default function TicketFeePayment({
  bookingCode,
  amountBaht,
}: TicketFeePaymentProps) {
  const router = useRouter();
  const [scriptReady, setScriptReady] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [pollChargeId, setPollChargeId] = useState<string | null>(null);
  const deadlineRef = useRef<number>(0);
  const succeededRef = useRef(false);

  const amountSatang = Math.round(amountBaht * 100);

  const markSuccess = useCallback(
    async (chargeId: string) => {
      if (succeededRef.current) return;
      succeededRef.current = true;
      setPollChargeId(null);
      try {
        localStorage.removeItem(PENDING_KEY);
      } catch {
        // ignore
      }
      // Settle the booking now (the webhook may also do this — it's idempotent).
      try {
        await confirmTicketFeeCharge(chargeId);
      } catch (err) {
        console.error("confirm ticket fee failed:", err);
      }
      setPhase({ kind: "success" });
      toast.success("ชำระค่าบัตรสำเร็จ");
      setTimeout(() => router.push("/tracking"), 1200);
    },
    [router]
  );

  const handleCharge = useCallback(
    (charge: OmiseChargeStatus) => {
      try {
        localStorage.setItem(PENDING_KEY, charge.id);
      } catch {
        // ignore
      }

      if (charge.paid && charge.status === "successful") {
        markSuccess(charge.id);
        return;
      }
      if (charge.authorizeUri) {
        window.location.href = charge.authorizeUri;
        return;
      }
      if (charge.promptpayQrUri) {
        deadlineRef.current = Date.now() + POLL_TIMEOUT_MS;
        setPhase({
          kind: "promptpay",
          qrUri: charge.promptpayQrUri,
          chargeId: charge.id,
        });
        setPollChargeId(charge.id);
        return;
      }
      if (charge.status === "pending") {
        deadlineRef.current = Date.now() + POLL_TIMEOUT_MS;
        setPhase({ kind: "polling", chargeId: charge.id });
        setPollChargeId(charge.id);
        return;
      }
      setPhase({
        kind: "failed",
        message: charge.failureMessage ?? "ชำระเงินไม่สำเร็จ",
      });
    },
    [markSuccess]
  );

  const chargeMutation = useMutation({
    mutationFn: (nonce: string) => createTicketFeeCharge({ nonce, bookingCode }),
    onSuccess: handleCharge,
    onError: (err: unknown) => {
      if (err instanceof PaymentAuthError) {
        setPhase({ kind: "needLogin" });
        return;
      }
      setPhase({
        kind: "failed",
        message: err instanceof Error ? err.message : "ชำระเงินไม่สำเร็จ",
      });
    },
  });

  // Poll async methods (PromptPay QR / offsite redirect) until settled.
  const statusQuery = useQuery({
    queryKey: ["omise-charge", pollChargeId],
    queryFn: ({ signal }) => getOmiseChargeStatus(pollChargeId as string, signal),
    enabled: pollChargeId !== null,
    staleTime: 0,
    gcTime: 0,
    refetchInterval: (query) => {
      const d = query.state.data;
      if (d?.paid && d.status === "successful") return false;
      if (d?.status === "failed" || d?.status === "expired") return false;
      if (Date.now() > deadlineRef.current) return false;
      return POLL_INTERVAL_MS;
    },
  });

  const status = statusQuery.data;
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!status || succeededRef.current) return;
    if (status.paid && status.status === "successful") {
      markSuccess(status.id);
    } else if (status.status === "failed" || status.status === "expired") {
      setPollChargeId(null);
      setPhase({
        kind: "failed",
        message: status.failureMessage ?? "ชำระเงินไม่สำเร็จ",
      });
    } else if (Date.now() > deadlineRef.current) {
      setPollChargeId(null);
      setPhase({ kind: "failed", message: "หมดเวลาการชำระเงิน กรุณาลองใหม่" });
    }
  }, [status, markSuccess]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const goLogin = useCallback(() => {
    window.location.href = `/api/auth/line/login?returnTo=${encodeURIComponent(
      `/payments/ticket/${bookingCode}`
    )}`;
  }, [bookingCode]);

  const openCheckout = useCallback(() => {
    if (!PUBLIC_KEY) {
      toast.error("ยังไม่ได้ตั้งค่า Omise (NEXT_PUBLIC_OMISE_PUBLIC_KEY)");
      return;
    }
    if (amountSatang <= 0) {
      toast.error("ยอดค่าบัตรไม่ถูกต้อง");
      return;
    }
    const OmiseCard = window.OmiseCard;
    if (!OmiseCard) {
      toast.error("ระบบชำระเงินยังโหลดไม่เสร็จ กรุณาลองอีกครั้ง");
      return;
    }
    OmiseCard.configure({ publicKey: PUBLIC_KEY });
    OmiseCard.open({
      amount: amountSatang,
      currency: "thb",
      defaultPaymentMethod: "promptpay",
      otherPaymentMethods: OTHER_METHODS,
      frameLabel: "ยยมือทอง (Yoye Muethong)",
      submitLabel: "ชำระค่าบัตร",
      onCreateTokenSuccess: (nonce: string) => {
        setPhase({ kind: "processing" });
        chargeMutation.mutate(nonce);
      },
    });
  }, [amountSatang, chargeMutation]);

  // Resume a pending charge after returning from an offsite redirect.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("omise_return") !== "1") return;
    let pending: string | null = null;
    try {
      pending = localStorage.getItem(PENDING_KEY);
    } catch {
      // ignore
    }
    if (pending) {
      deadlineRef.current = Date.now() + POLL_TIMEOUT_MS;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhase({ kind: "polling", chargeId: pending });
      setPollChargeId(pending);
    }
    url.searchParams.delete("omise_return");
    window.history.replaceState({}, "", url.toString());
  }, []);

  return (
    <div className="space-y-3">
      <Script
        src="https://cdn.omise.co/omise.js"
        strategy="afterInteractive"
        onLoad={() => setScriptReady(true)}
        onReady={() => setScriptReady(true)}
      />

      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm space-y-1">
        <div className="flex items-center gap-2 font-semibold text-primary">
          <ShieldCheck className="size-4" /> ชำระผ่าน Omise (Opn Payments)
        </div>
        <p className="text-muted-foreground">
          รองรับ PromptPay, บัตรเครดิต/เดบิต, โมบายแบงก์กิ้ง, TrueMoney และอื่น ๆ
          — ข้อมูลบัตรเข้ารหัสโดยตรงกับ Omise ร้านไม่เก็บเลขบัตร
        </p>
      </div>

      {phase.kind === "success" ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex items-center gap-2 text-emerald-700 font-semibold">
          <CheckCircle2 className="size-5" /> ชำระค่าบัตรสำเร็จ
          กำลังพาไปหน้าติดตามสถานะ...
        </div>
      ) : phase.kind === "needLogin" ? (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-center space-y-3">
          <p className="font-semibold">กรุณาเข้าสู่ระบบด้วย LINE ก่อนชำระเงิน</p>
          <p className="text-sm text-muted-foreground">
            เพื่อยืนยันว่าเป็นเจ้าของรายการจองนี้
          </p>
          <Button onClick={goLogin}>
            <LogIn className="size-4" /> เข้าสู่ระบบด้วย LINE
          </Button>
        </div>
      ) : phase.kind === "promptpay" ? (
        <div className="rounded-xl border border-primary/30 p-4 text-center space-y-3">
          <p className="font-semibold">สแกน QR เพื่อชำระผ่าน PromptPay</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={phase.qrUri}
            alt="PromptPay QR"
            className="mx-auto w-56 h-56 object-contain"
          />
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> กำลังรอการชำระเงิน...
          </div>
          <p className="text-xs text-muted-foreground">
            เมื่อชำระสำเร็จ ระบบจะอัปเดตสถานะและพาไปหน้าติดตามสถานะให้อัตโนมัติ
          </p>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/tracking">ไปหน้าติดตามสถานะ →</Link>
          </Button>
        </div>
      ) : phase.kind === "polling" ? (
        <div className="rounded-xl border border-border/60 p-4 flex flex-col items-center gap-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" /> กำลังตรวจสอบการชำระเงิน...
          </span>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/tracking">ไปหน้าติดตามสถานะ →</Link>
          </Button>
        </div>
      ) : (
        <>
          {phase.kind === "failed" && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {phase.message}
            </div>
          )}
          <Button
            size="lg"
            className="w-full"
            onClick={openCheckout}
            disabled={phase.kind === "processing" || !scriptReady}
          >
            {phase.kind === "processing" ? (
              <>
                <Loader2 className="size-4 animate-spin" /> กำลังดำเนินการ...
              </>
            ) : (
              <>
                <CreditCard className="size-4" /> ชำระค่าบัตร ฿
                {amountBaht.toLocaleString()}
              </>
            )}
          </Button>
          {!scriptReady && (
            <p className="text-center text-xs text-muted-foreground">
              กำลังโหลดระบบชำระเงิน...
            </p>
          )}
        </>
      )}
    </div>
  );
}
