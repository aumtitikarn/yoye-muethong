"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Gift, Ticket, Sparkles, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRewardsQuery, useSubmitRewardRequestMutation } from "@/lib/queries";
import { LEDGER_REASON_LABELS, REQUEST_STATUS_LABELS } from "@/lib/rewards";

const thaiDateTime = new Intl.DateTimeFormat("th-TH-u-ca-buddhist", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Bangkok",
});

const fmtDate = (iso: string) => thaiDateTime.format(new Date(iso));

const MAX_PROOF_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];

const statusTone: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700 border-amber-200",
  APPROVED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  REJECTED: "bg-rose-50 text-rose-700 border-rose-200",
};

export default function RewardsPage() {
  const { data, isLoading, isFetching, refetch } = useRewardsQuery();
  const submit = useSubmitRewardRequestMutation();

  const [bookingCode, setBookingCode] = useState("");
  const [reviewLink, setReviewLink] = useState("");
  const [notes, setNotes] = useState("");
  const [proofDataUrl, setProofDataUrl] = useState("");
  const [proofName, setProofName] = useState("");

  const summary = data?.ok ? data.summary : null;
  const isUnauthed = data?.ok === false && data.status === 401;
  const isLoadError = data?.ok === false && data.status !== 401;

  // แถบความคืบหน้าไปยังสิทธิถัดไป — คิดจากเศษของแต้มหารด้วยราคาสิทธิ
  const progressPct = useMemo(() => {
    if (!summary) return 0;
    const { currentPoints, redemptionCost } = summary;
    if (redemptionCost <= 0) return 0;
    return ((currentPoints % redemptionCost) / redemptionCost) * 100;
  }, [summary]);

  const handleProofFile = (file: File | undefined) => {
    if (!file) {
      setProofDataUrl("");
      setProofName("");
      return;
    }
    if (!ALLOWED_MIME.includes(file.type)) {
      toast.error("รองรับเฉพาะ JPG / PNG / WEBP");
      return;
    }
    if (file.size > MAX_PROOF_BYTES) {
      toast.error("ไฟล์ใหญ่เกิน 8MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setProofDataUrl(String(reader.result ?? ""));
      setProofName(file.name);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookingCode) {
      toast.error("กรุณาเลือกงานที่ต้องการรับแต้ม");
      return;
    }
    if (!reviewLink.trim()) {
      toast.error("กรุณาใส่ลิงก์รีวิว");
      return;
    }
    submit.mutate(
      {
        bookingCode,
        reviewLink: reviewLink.trim(),
        notes: notes.trim() || undefined,
        proofImageDataUrl: proofDataUrl || undefined,
      },
      {
        onSuccess: () => {
          toast.success("ส่งคำขอแล้ว รอแอดมินตรวจสอบนะคะ");
          setBookingCode("");
          setReviewLink("");
          setNotes("");
          setProofDataUrl("");
          setProofName("");
        },
        onError: (err: unknown) =>
          toast.error(err instanceof Error ? err.message : "ส่งคำขอไม่สำเร็จ"),
      },
    );
  };

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 space-y-6">
      <div className="text-center space-y-2">
        <p className="text-xs sm:text-sm uppercase tracking-[0.3em] text-muted-foreground">
          Rewards
        </p>
        <h1 className="text-2xl sm:text-3xl font-black text-foreground">บัตรสะสมแต้ม</h1>
        <p className="text-sm text-muted-foreground">
          จ้าง 1 งาน + รีวิว = 1 แต้ม · ครบ 5 แต้ม = ลัดคิวฟรี 1 งาน · แต้มไม่มีวันหมดอายุ
        </p>
      </div>

      {isUnauthed && (
        <Card className="p-8 text-center space-y-4">
          <h2 className="text-lg font-semibold">กรุณาเข้าสู่ระบบด้วย LINE</h2>
          <p className="text-muted-foreground text-sm">
            เข้าสู่ระบบเพื่อดูแต้มสะสมและสิทธิลัดคิวของคุณ
          </p>
          <Button
            size="lg"
            onClick={() => {
              window.location.href = `/api/auth/line/login?returnTo=${encodeURIComponent("/rewards")}`;
            }}
          >
            เข้าสู่ระบบด้วย LINE
          </Button>
        </Card>
      )}

      {isLoadError && (
        <Card className="p-8 text-center space-y-4 border-rose-200 bg-rose-50/60">
          <h2 className="text-lg font-semibold text-rose-700">
            {data?.ok === false ? data.error : "ไม่สามารถโหลดข้อมูลแต้มได้"}
          </h2>
          <Button variant="outline" onClick={() => refetch()}>
            ลองอีกครั้ง
          </Button>
        </Card>
      )}

      {isLoading && <Card className="p-8 text-center text-muted-foreground">กำลังโหลด...</Card>}

      {summary && (
        <>
          {/* การ์ดหลัก — "ใช้สิทธิลัดคิวได้กี่สิทธิ" คือเลขที่ลูกค้าตามหา จึงให้เด่นสุด */}
          <Card className="p-6 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">แต้มสะสมของคุณ</p>
                <p className="text-4xl font-black tabular-nums">
                  {summary.currentPoints.toLocaleString("th-TH")}
                  <span className="ml-1 text-base font-medium text-muted-foreground">แต้ม</span>
                </p>
              </div>
              <div className="rounded-2xl border bg-muted/40 px-4 py-3 text-center">
                <Ticket className="mx-auto h-5 w-5 text-muted-foreground" />
                <p className="mt-1 text-2xl font-black tabular-nums">
                  {summary.availableRedemptions}
                </p>
                <p className="text-xs text-muted-foreground">สิทธิลัดคิวที่ใช้ได้</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-foreground/80 transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {summary.pointsToNext === 0
                  ? `ครบแล้ว! แลกสิทธิลัดคิวได้ ${summary.availableRedemptions} งาน — แจ้งแอดมินทางไลน์ได้เลย`
                  : `อีก ${summary.pointsToNext} แต้ม จะได้สิทธิลัดคิวเพิ่มอีก 1 งาน`}
              </p>
            </div>

            <p className="rounded-xl bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <Sparkles className="mr-1 inline h-3.5 w-3.5" />
              การใช้สิทธิลัดคิวต้องแจ้งแอดมิน — ระบบจะหัก {summary.redemptionCost} แต้ม
              ต่อ 1 งาน และใช้ได้ 1 สิทธิต่อ 1 งานเท่านั้น
            </p>
          </Card>

          {summary.activeRedemptions.length > 0 && (
            <Card className="p-5 space-y-3">
              <h2 className="font-semibold">สิทธิลัดคิวที่ใช้ไปแล้ว</h2>
              <ul className="space-y-2">
                {summary.activeRedemptions.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm"
                  >
                    <span className="font-medium">{r.eventName}</span>
                    <span className="text-xs text-muted-foreground">{fmtDate(r.usedAt)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* ส่งลิงก์รีวิว — 1 งานส่งได้ครั้งเดียว งานที่ส่งแล้วจะหายจาก dropdown */}
          <Card className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Gift className="h-5 w-5 text-muted-foreground" />
              <h2 className="font-semibold">ส่งลิงก์รีวิวรับแต้ม</h2>
            </div>

            {summary.eligibleBookings.length === 0 ? (
              <p className="rounded-xl bg-muted/40 px-3 py-3 text-sm text-muted-foreground">
                ตอนนี้ยังไม่มีงานที่ส่งรีวิวรับแต้มได้
                — งานจะขึ้นที่นี่หลังจากร้านกดบัตรให้เรียบร้อยแล้ว (1 งาน รับได้สูงสุด 1 แต้ม)
              </p>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="rw-booking">งานที่รีวิว</Label>
                  <Select value={bookingCode} onValueChange={setBookingCode}>
                    <SelectTrigger id="rw-booking">
                      <SelectValue placeholder="เลือกงาน" />
                    </SelectTrigger>
                    <SelectContent>
                      {summary.eligibleBookings.map((b) => (
                        <SelectItem key={b.bookingCode} value={b.bookingCode}>
                          {b.eventName} · {b.bookingCode}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="rw-link">ลิงก์รีวิว (X / TikTok)</Label>
                  <Input
                    id="rw-link"
                    placeholder="https://..."
                    value={reviewLink}
                    onChange={(e) => setReviewLink(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    อย่าลืมติด #ยยมือทองกดบัตร + #ชื่องาน และแนบรูปหรือวิดีโอในโพสต์
                    · โพสต์ต้องเปิดสาธารณะให้แอดมินกดดูได้
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="rw-proof">แนบรูปหลักฐาน (ถ้ามี)</Label>
                  <Input
                    id="rw-proof"
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp"
                    onChange={(e) => handleProofFile(e.target.files?.[0])}
                  />
                  {proofName && (
                    <p className="text-xs text-emerald-700">แนบแล้ว: {proofName}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    เช่น สกรีนช็อตโพสต์รีวิว · JPG / PNG / WEBP ไม่เกิน 8MB
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="rw-notes">หมายเหตุ (ถ้ามี)</Label>
                  <Textarea
                    id="rw-notes"
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="อยากบอกอะไรแอดมินเพิ่มเติม"
                  />
                </div>

                <Button type="submit" className="w-full" disabled={submit.isPending}>
                  {submit.isPending ? "กำลังส่ง..." : "ส่งคำขอรับแต้ม"}
                </Button>
              </form>
            )}
          </Card>

          {summary.requests.length > 0 && (
            <Card className="p-5 space-y-3">
              <h2 className="font-semibold">คำขอรับแต้มของฉัน</h2>
              <ul className="space-y-2">
                {summary.requests.map((r) => (
                  <li key={r.id} className="rounded-xl border px-3 py-2.5 text-sm space-y-1">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium">{r.eventName}</span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs ${
                          statusTone[r.status] ?? "bg-muted text-muted-foreground"
                        }`}
                      >
                        {REQUEST_STATUS_LABELS[r.status] ?? r.status}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                      <a
                        href={r.reviewLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 underline underline-offset-2"
                      >
                        ดูรีวิว <ExternalLink className="h-3 w-3" />
                      </a>
                      <span>{fmtDate(r.createdAt)}</span>
                    </div>
                    {r.rejectionReason && (
                      <p className="text-xs text-rose-600">เหตุผล: {r.rejectionReason}</p>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {summary.ledger.length > 0 && (
            <Card className="p-5 space-y-3">
              <h2 className="font-semibold">ประวัติแต้ม</h2>
              <ul className="divide-y">
                {summary.ledger.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <div>
                      <p className="font-medium">
                        {LEDGER_REASON_LABELS[l.reason] ?? l.reason}
                        {l.eventName ? ` · ${l.eventName}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">{fmtDate(l.createdAt)}</p>
                      {l.note && <p className="text-xs text-muted-foreground">{l.note}</p>}
                    </div>
                    <span
                      className={`font-mono font-semibold tabular-nums ${
                        l.amount >= 0 ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {l.amount >= 0 ? "+" : ""}
                      {l.amount}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {isFetching && (
            <p className="text-center text-xs text-muted-foreground">กำลังอัปเดต...</p>
          )}
        </>
      )}
    </main>
  );
}
