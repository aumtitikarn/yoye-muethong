"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  BadgeCheck,
  Banknote,
  ExternalLink,
  Landmark,
  Loader2,
  LogIn,
  Pencil,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useRefundInfoQuery, useSubmitRefundMutation } from "@/lib/queries";
import { PaymentAuthError } from "@/lib/api";
import type { RefundAccountDTO } from "@/lib/api";
import { StepIntro, baht } from "./wizard-blocks";

const OTHER_BANK = "__other__";

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

const thaiDateTime = new Intl.DateTimeFormat("th-TH", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function StepRefund({ bookingCode }: { bookingCode: string }) {
  const { data, isPending, error } = useRefundInfoQuery(bookingCode);
  const [editOpen, setEditOpen] = useState(false);

  if (error instanceof PaymentAuthError) {
    return (
      <div className="space-y-4">
        <StepIntro step={3} title="การคืนเงิน" />
        <Card className="space-y-4 p-6 text-center">
          <h2 className="text-lg font-semibold">กรุณาเข้าสู่ระบบด้วย LINE</h2>
          <p className="text-sm text-muted-foreground">
            เพื่อดูข้อมูลการคืนเงินของรายการนี้
          </p>
          <Button
            className="mx-auto"
            onClick={() => {
              window.location.href = `/api/auth/line/login?returnTo=${encodeURIComponent(
                `/bookings/${bookingCode}?step=3`,
              )}`;
            }}
          >
            <LogIn className="size-4" /> เข้าสู่ระบบด้วย LINE
          </Button>
        </Card>
      </div>
    );
  }

  const account = data?.account ?? null;
  const editable = Boolean(data?.editable);
  const transactions = data?.transactions ?? [];
  const refundAmount = data?.refundAmount ?? 0;

  return (
    <div className="space-y-4">
      <StepIntro
        step={3}
        title="การคืนเงิน"
        subtitle="ตรวจสอบบัญชีรับเงินคืน และประวัติการคืนเงินจากร้าน"
      />

      {/* Refund amount summary */}
      <Card className="flex items-center gap-4 p-5">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/25 to-primary/5 text-accent">
          <Wallet className="size-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground">
            ยอดเงินที่ร้านจะคืน
          </p>
          <p className="text-2xl font-black text-accent">
            {refundAmount > 0 ? baht(refundAmount) : "รอร้านแจ้งยอด"}
          </p>
        </div>
        {data?.trackingStatus && (
          <span className="shrink-0 rounded-full bg-muted px-3 py-1 text-[11px] font-semibold text-muted-foreground">
            {data.trackingStatus}
          </span>
        )}
      </Card>

      {/* Bank account for the refund */}
      <Card className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/25 to-primary/5 text-accent">
              <Landmark className="size-5" />
            </div>
            <div>
              <h3 className="text-base font-bold leading-tight">
                ข้อมูลบัญชีรับเงินคืน
              </h3>
              <p className="text-xs text-muted-foreground">
                บัญชีที่ร้านจะใช้โอนเงินคืนให้คุณ
              </p>
            </div>
          </div>
          {editable && (
            <Button
              variant={account ? "outline" : "default"}
              size="sm"
              className="h-8 shrink-0 gap-1.5 text-xs"
              onClick={() => setEditOpen(true)}
            >
              <Pencil className="size-3.5" />
              {account ? "แก้ไข" : "เพิ่มบัญชี"}
            </Button>
          )}
        </div>

        {isPending ? (
          <div className="h-20 animate-pulse rounded-2xl bg-muted/50" />
        ) : account ? (
          <div className="grid grid-cols-1 gap-3 rounded-2xl border border-border/60 bg-secondary/10 p-4 sm:grid-cols-3">
            <Field label="ธนาคาร" value={account.bankName} />
            <Field label="เลขบัญชี / PromptPay" value={account.accountNumber} mono />
            <Field label="ชื่อบัญชี" value={account.accountHolder} />
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border/70 bg-secondary/10 p-6 text-center">
            <p className="text-sm text-muted-foreground">
              {editable
                ? "ยังไม่ได้กรอกบัญชีรับเงินคืน — กด “เพิ่มบัญชี” เพื่อกรอกข้อมูล"
                : "ยังไม่มีข้อมูลบัญชีรับเงินคืน"}
            </p>
          </div>
        )}
      </Card>

      {/* Refund payout transactions */}
      <Card className="space-y-4 p-5">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/25 to-primary/5 text-accent">
            <Banknote className="size-5" />
          </div>
          <div>
            <h3 className="text-base font-bold leading-tight">
              ประวัติการคืนเงิน
            </h3>
            <p className="text-xs text-muted-foreground">
              รายการที่ร้านโอนเงินคืนให้คุณแล้ว
            </p>
          </div>
        </div>

        {transactions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/70 bg-secondary/10 p-6 text-center">
            <p className="text-sm text-muted-foreground">
              ยังไม่มีรายการคืนเงิน
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>วันที่คืน</TableHead>
                  <TableHead className="text-right">จำนวน</TableHead>
                  <TableHead className="text-center">สถานะ</TableHead>
                  <TableHead className="text-right">สลิป</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {thaiDateTime.format(new Date(tx.paidAt))}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-accent">
                      {baht(tx.amount)}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600">
                        <BadgeCheck className="size-3.5" />
                        คืนแล้ว
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {tx.payoutSlipUrl ? (
                        <a
                          href={tx.payoutSlipUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
                        >
                          ดูสลิป
                          <ExternalLink className="size-3.5" />
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <RefundAccountDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        bookingCode={bookingCode}
        account={account}
        defaultAmount={refundAmount}
      />
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={
          mono
            ? "break-all font-mono text-sm font-semibold text-foreground"
            : "break-words text-sm font-semibold text-foreground"
        }
      >
        {value}
      </p>
    </div>
  );
}

function RefundAccountDialog({
  open,
  onOpenChange,
  bookingCode,
  account,
  defaultAmount,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  bookingCode: string;
  account: RefundAccountDTO | null;
  defaultAmount: number;
}) {
  const submitRefund = useSubmitRefundMutation(bookingCode);

  const [bankSelect, setBankSelect] = useState("");
  const [bankOther, setBankOther] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [amount, setAmount] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  // Prefill from the saved account each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    const known = account && BANK_OPTIONS.includes(account.bankName);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBankSelect(account ? (known ? account.bankName : OTHER_BANK) : "");
    setBankOther(account && !known ? account.bankName : "");
    setAccountNumber(account?.accountNumber ?? "");
    setAccountHolder(account?.accountHolder ?? "");
    setAmount(
      account?.amount
        ? String(account.amount)
        : defaultAmount > 0
          ? String(defaultAmount)
          : "",
    );
    setConfirmed(false);
  }, [open, account, defaultAmount]);

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
          onOpenChange(false);
        },
        onError: (e) =>
          toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>ข้อมูลบัญชีรับเงินคืน</DialogTitle>
          <DialogDescription>
            กรอกบัญชีให้ถูกต้อง หากกรอกผิดร้านไม่สามารถโอนคืนได้
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Bank name */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              ชื่อธนาคาร <span className="text-destructive">*</span>
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
                placeholder="ระบุชื่อธนาคาร"
                value={bankOther}
                onChange={(e) => setBankOther(e.target.value)}
                className="mt-2 h-11 rounded-xl"
              />
            )}
          </div>

          {/* Account number */}
          <div className="space-y-1.5">
            <Label htmlFor="refund-account" className="text-sm font-medium">
              เลขบัญชี / PromptPay <span className="text-destructive">*</span>
            </Label>
            <Input
              id="refund-account"
              inputMode="numeric"
              placeholder="กรอกเฉพาะตัวเลข"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              className="h-11 rounded-xl"
            />
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
              ⚠️ หากกรอกข้อมูลไม่ถูกต้อง ร้านไม่สามารถโอนคืนได้
            </div>
          </div>

          {/* Account holder */}
          <div className="space-y-1.5">
            <Label htmlFor="refund-holder" className="text-sm font-medium">
              ชื่อเจ้าของบัญชี <span className="text-destructive">*</span>
            </Label>
            <Input
              id="refund-holder"
              placeholder="ชื่อ-นามสกุล"
              value={accountHolder}
              onChange={(e) => setAccountHolder(e.target.value)}
              className="h-11 rounded-xl"
            />
          </div>

          {/* Refund amount */}
          <div className="space-y-1.5">
            <Label htmlFor="refund-amount" className="text-sm font-medium">
              ยอดเงินคืน <span className="text-destructive">*</span>
            </Label>
            <Input
              id="refund-amount"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-11 rounded-xl"
            />
            <p className="text-xs text-muted-foreground">
              กรุณากรอกยอดเงินคืนตามที่ร้านแจ้งเท่านั้น
            </p>
          </div>

          {/* Confirmation */}
          <label
            htmlFor="refund-confirm"
            className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/60 p-3 text-xs text-muted-foreground"
          >
            <Checkbox
              id="refund-confirm"
              checked={confirmed}
              onCheckedChange={(v) => setConfirmed(v === true)}
              className="mt-0.5"
            />
            <span>
              ข้าพเจ้ายืนยันว่าข้อมูลบัญชีทั้งหมดถูกต้อง หากกรอกผิด
              ร้านขอสงวนสิทธิ์ไม่รับผิดชอบ
            </span>
          </label>

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
        </div>
      </DialogContent>
    </Dialog>
  );
}
