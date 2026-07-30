"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  ClipboardList,
  CreditCard,
  Loader2,
  MapPin,
  Minus,
  Pencil,
  Plus,
  Receipt,
  StickyNote,
  Ticket,
  User,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSaveDeepInfoMutation } from "@/lib/queries";
import type { BookingDetailDTO } from "@/lib/api";
import { CautionNote, InfoRow, SectionHeader, StepIntro, baht } from "./wizard-blocks";

type PaymentMethod = "store_pay" | "self_pay";

export function StepDetails({
  detail,
  allowEdit,
}: {
  detail: BookingDetailDTO;
  allowEdit: boolean;
}) {
  const router = useRouter();
  const saveDeepInfo = useSaveDeepInfoMutation(detail.bookingCode);

  const isFormType = detail.eventTypes === "form";

  const [selectedZoneId, setSelectedZoneId] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("store_pay");
  const [adjustedQuantity, setAdjustedQuantity] = useState(1);
  const [extraValues, setExtraValues] = useState<Record<number, string>>({});
  const [isEditingZone, setIsEditingZone] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Sync editable state once the real booking loads.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedZoneId(
      detail.zones.find((z) => z.name === detail.zone)?.id ?? null,
    );
    setAdjustedQuantity(Math.max(1, detail.quantity));
    setExtraValues(
      Object.fromEntries(
        detail.fields.filter((f) => f.value).map((f) => [f.id, f.value]),
      ),
    );
  }, [detail]);

  const extraFields = detail.fields;
  const selectedZone = detail.zones.find((z) => z.id === selectedZoneId);
  const ticketsToCharge = Math.min(adjustedQuantity, detail.quantity);

  const baseUnitPrice =
    detail.quantity > 0 ? detail.total / detail.quantity : 0;
  const unitTotal = baseUnitPrice + (detail.serviceFee || 0);
  const updatedTotal = selectedZone
    ? (selectedZone.price + (detail.serviceFee || 0)) * ticketsToCharge
    : unitTotal * ticketsToCharge;
  const displayTotal = detail.feePerEntry
    ? detail.feePerEntry * ticketsToCharge
    : updatedTotal;

  const totalLabel = isFormType ? "ค่าฟอร์ม" : "ยอดค่าบัตรรวม";
  const unitWord = isFormType ? "รายชื่อ" : "ใบ";
  const TypeIcon = isFormType ? ClipboardList : Ticket;
  const typeLabel = isFormType ? "ฟอร์มรายชื่อ" : "บัตรคอนเสิร์ต";

  const extraFieldsValid = extraFields.every(
    (f) => !f.isRequired || (extraValues[f.id] ?? "").trim().length > 0,
  );
  const canSubmit = selectedZoneId !== null && extraFieldsValid;
  const canConfirm = isFormType ? extraFieldsValid : canSubmit;

  const hasSavedDeepInfo = extraFields.some((f) => f.value.trim().length > 0);
  const isSaving = saveDeepInfo.isPending || saveDeepInfo.isSuccess;

  const handleSaveDeepInfo = () => {
    saveDeepInfo.mutate(
      extraFields.map((f) => ({
        fieldId: f.id,
        value: (extraValues[f.id] ?? "").trim(),
      })),
      { onSuccess: () => router.push("/tracking") },
    );
  };

  const handleConfirm = () => {
    setConfirmOpen(false);
    if (extraFields.length > 0 && !hasSavedDeepInfo) {
      handleSaveDeepInfo();
    } else {
      router.push("/tracking");
    }
  };

  const ctaClass =
    "h-12 w-full gap-2 rounded-xl bg-gradient-to-r from-[#fe8516] to-[#fe5e2a] text-base font-bold text-white shadow-lg shadow-accent/25 hover:opacity-95";

  return (
    <div className="space-y-4">
      <StepIntro
        step={1}
        title="รายละเอียดการจอง"
        subtitle="ตรวจสอบข้อมูลงาน โซน จำนวน และข้อมูลเพิ่มเติมของคุณ"
      />

      {/* Premium ticket stub hero */}
      <Card className="relative gap-0 overflow-hidden rounded-[28px] border-primary/20 p-0 shadow-xl">
        <div className="relative aspect-[16/9] w-full sm:aspect-[3/1]">
          <Image
            src={detail.poster}
            alt={detail.eventName}
            fill
            className="object-cover"
            sizes="(max-width: 1024px) 100vw, 60vw"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 space-y-2 p-5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold text-accent shadow-sm backdrop-blur">
              <TypeIcon className="size-3.5" />
              {typeLabel}
            </span>
            <h2 className="text-2xl font-black leading-tight text-white drop-shadow-lg">
              {detail.eventName}
            </h2>
          </div>
        </div>

        {/* Perforated seam */}
        <div className="relative h-6 bg-card">
          <span className="absolute top-1/2 -left-3 size-6 -translate-y-1/2 rounded-full bg-background" />
          <span className="absolute top-1/2 -right-3 size-6 -translate-y-1/2 rounded-full bg-background" />
          <div className="absolute inset-x-6 top-1/2 -translate-y-1/2 border-t-2 border-dashed border-border/70" />
        </div>

        <div className="grid grid-cols-1 gap-3 px-5 pb-5 sm:grid-cols-2">
          <div className="flex items-center gap-3 rounded-2xl border border-border/50 bg-secondary/10 p-3 sm:col-span-2">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-accent">
              <Receipt className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Booking No.
              </p>
              <p className="truncate font-mono text-sm font-bold text-foreground">
                {detail.bookingCode}
              </p>
            </div>
          </div>

          <InfoRow icon={CalendarDays} label="รอบการแสดง" value={detail.showTime} />
          <InfoRow icon={MapPin} label="โซน" value={detail.zone} />
          <InfoRow
            icon={Ticket}
            label="จำนวน"
            value={`${detail.quantity} ${unitWord}`}
          />
          {detail.note && (
            <InfoRow
              icon={StickyNote}
              label="หมายเหตุ"
              value={
                <span className="text-xs font-normal text-muted-foreground">
                  {detail.note}
                </span>
              }
            />
          )}
        </div>
      </Card>

      {/* Zone / quantity selection */}
      <Card className="space-y-4 p-5">
        {isFormType ? (
          <>
            <SectionHeader
              icon={Users}
              title="จำนวนรายชื่อ"
              action={
                allowEdit ? (
                  <Button
                    variant={isEditingZone ? "default" : "outline"}
                    size="sm"
                    className="h-8 shrink-0 gap-1.5 text-xs"
                    onClick={() => setIsEditingZone((v) => !v)}
                  >
                    {isEditingZone ? (
                      <>
                        <BadgeCheck className="size-3.5" />
                        เสร็จสิ้น
                      </>
                    ) : (
                      <>
                        <Pencil className="size-3.5" />
                        เปลี่ยนจำนวน
                      </>
                    )}
                  </Button>
                ) : undefined
              }
            />

            {allowEdit && isEditingZone ? (
              <div className="space-y-4 rounded-2xl border-2 border-primary bg-primary/5 p-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold text-foreground">
                    ปรับจำนวนรายชื่อ
                  </Label>
                  <span className="text-[10px] font-medium text-amber-600">
                    ⚠️ ลดได้เท่านั้น
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="inline-flex items-center rounded-2xl border border-border/70 bg-background px-2 py-1.5 shadow-sm">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-9 rounded-lg hover:bg-muted"
                      onClick={() =>
                        setAdjustedQuantity((prev) => Math.max(1, prev - 1))
                      }
                      disabled={adjustedQuantity === 1}
                    >
                      <Minus className="size-4" />
                    </Button>
                    <div className="min-w-[60px] text-center">
                      <p className="text-2xl font-black leading-none text-accent">
                        {adjustedQuantity}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-9 rounded-lg hover:bg-muted"
                      onClick={() =>
                        setAdjustedQuantity((prev) =>
                          Math.min(detail.quantity, prev + 1),
                        )
                      }
                      disabled={adjustedQuantity === detail.quantity}
                    >
                      <Plus className="size-4" />
                    </Button>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <p>จากจำนวนเดิม</p>
                    <div className="flex items-center gap-1 font-semibold text-foreground">
                      <Users className="size-3" />
                      {detail.quantity} รายชื่อ
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-4 rounded-2xl border border-border/60 bg-secondary/20 p-4">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/15 text-accent">
                  <Users className="size-6" />
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    จำนวนที่เลือก
                  </p>
                  <p className="text-2xl font-black text-accent">
                    {ticketsToCharge}
                    <span className="ml-1 text-sm font-semibold text-muted-foreground">
                      รายชื่อ
                    </span>
                  </p>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <SectionHeader
              icon={MapPin}
              title="โซน / ราคาบัตร"
              action={
                allowEdit ? (
                  <Button
                    variant={isEditingZone ? "default" : "outline"}
                    size="sm"
                    className="h-8 shrink-0 gap-1.5 text-xs"
                    onClick={() => setIsEditingZone((v) => !v)}
                  >
                    {isEditingZone ? (
                      <>
                        <BadgeCheck className="size-3.5" />
                        เสร็จสิ้น
                      </>
                    ) : (
                      <>
                        <Pencil className="size-3.5" />
                        เปลี่ยนโซน
                      </>
                    )}
                  </Button>
                ) : undefined
              }
            />

            {allowEdit && (
              <CautionNote>
                กรณีลดจำนวนบัตรภายหลัง
                ทางร้านขอสงวนสิทธิ์ไม่คืนเงินมัดจำในส่วนที่ลดลง
              </CautionNote>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(isEditingZone
                ? detail.zones
                : detail.zones.filter((z) => z.id === selectedZoneId)
              ).map((zone) => {
                const isSelected = selectedZoneId === zone.id;
                return (
                  <div
                    key={zone.id}
                    className={cn(
                      "relative rounded-2xl border-2 p-4 transition-all duration-200",
                      isSelected
                        ? "border-primary bg-primary/5 shadow-md"
                        : zone.available
                          ? "border-border/60 hover:border-primary/40"
                          : "border-border/30 opacity-50",
                    )}
                  >
                    <button
                      type="button"
                      disabled={!zone.available || !isEditingZone}
                      onClick={() => setSelectedZoneId(zone.id)}
                      className="w-full text-left"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">
                          {zone.name}
                        </span>
                        {isSelected ? (
                          <BadgeCheck className="size-4 text-accent" />
                        ) : (
                          !zone.available && (
                            <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                              เต็ม
                            </span>
                          )
                        )}
                      </div>
                      <p className="mt-1 text-lg font-black text-accent">
                        {baht(zone.price)}
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          + ค่ากดบัตร {detail.serviceFee.toLocaleString()}/ใบ
                        </span>
                      </p>
                    </button>
                    {isSelected && isEditingZone && (
                      <div className="mt-3 space-y-2 border-t border-primary/20 pt-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-semibold text-muted-foreground">
                            ปรับจำนวนบัตร
                          </Label>
                          <span className="text-[10px] font-medium text-amber-600">
                            ⚠️ ลดได้เท่านั้น
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="inline-flex items-center rounded-xl border border-border/70 bg-background px-1.5 py-1 shadow-sm">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-7 rounded-lg"
                              onClick={(e) => {
                                e.stopPropagation();
                                setAdjustedQuantity((prev) =>
                                  Math.max(1, prev - 1),
                                );
                              }}
                              disabled={adjustedQuantity === 1}
                            >
                              <Minus className="size-3.5" />
                            </Button>
                            <div className="min-w-[48px] text-center">
                              <p className="text-xl font-black leading-none">
                                {adjustedQuantity}
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-7 rounded-lg"
                              onClick={(e) => {
                                e.stopPropagation();
                                setAdjustedQuantity((prev) =>
                                  Math.min(detail.quantity, prev + 1),
                                );
                              }}
                              disabled={adjustedQuantity === detail.quantity}
                            >
                              <Plus className="size-3.5" />
                            </Button>
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            จำนวนเดิม {detail.quantity} ใบ
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Card>

      {/* Payment method — hidden for form-type events, edit flow only */}
      {!isFormType && allowEdit && (
        <Card className="space-y-4 p-5">
          <SectionHeader icon={CreditCard} title="วิธีการชำระ" />
          <RadioGroup
            value={paymentMethod}
            onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}
            className="grid grid-cols-1 gap-3 sm:grid-cols-2"
          >
            <label
              htmlFor="store_pay"
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-2xl border-2 p-4 transition-all duration-200",
                paymentMethod === "store_pay"
                  ? "border-primary bg-primary/5 shadow-md"
                  : "border-border/60 hover:border-primary/40",
              )}
            >
              <RadioGroupItem value="store_pay" id="store_pay" />
              <div>
                <p className="text-sm font-semibold">ฝากร้านจ่าย</p>
                <p className="text-xs text-muted-foreground">
                  โอนค่าบัตรให้ร้าน ก่อนวันกด 1 วัน
                </p>
              </div>
            </label>
            <label
              htmlFor="self_pay"
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-2xl border-2 p-4 transition-all duration-200",
                paymentMethod === "self_pay"
                  ? "border-primary bg-primary/5 shadow-md"
                  : "border-border/60 hover:border-primary/40",
              )}
            >
              <RadioGroupItem value="self_pay" id="self_pay" />
              <div>
                <p className="text-sm font-semibold">จ่ายเอง</p>
                <p className="text-xs text-muted-foreground">
                  ลูกค้าชำระค่าบัตรด้วยตนเอง
                </p>
              </div>
            </label>
          </RadioGroup>
        </Card>
      )}

      {/* Extra fields (deep info) */}
      <Card className="space-y-4 p-5">
        <SectionHeader
          icon={User}
          title="ข้อมูลเพิ่มเติม"
          hint={
            extraFields.length > 0
              ? "กรอกข้อมูลให้ครบเพื่อยืนยันการจอง"
              : undefined
          }
          action={
            hasSavedDeepInfo ? (
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-600">
                <BadgeCheck className="size-3.5" />
                บันทึกแล้ว
              </span>
            ) : undefined
          }
        />

        {extraFields.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/70 bg-secondary/10 p-6 text-center">
            <p className="text-sm text-muted-foreground">
              งานนี้ไม่มีข้อมูลเพิ่มเติมที่ต้องกรอก
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {extraFields.map((field) => (
              <div key={field.id} className="space-y-1.5">
                <Label
                  htmlFor={`extra-${field.id}`}
                  className="text-sm font-medium"
                >
                  {field.label}
                  {field.isRequired && (
                    <span className="ml-1 text-destructive">*</span>
                  )}
                </Label>
                <Input
                  id={`extra-${field.id}`}
                  placeholder={field.label}
                  value={extraValues[field.id] ?? ""}
                  disabled={hasSavedDeepInfo || !allowEdit}
                  className="h-11 rounded-xl text-foreground disabled:opacity-100 disabled:text-foreground"
                  onChange={(e) => {
                    if (saveDeepInfo.isSuccess) saveDeepInfo.reset();
                    setExtraValues((prev) => ({
                      ...prev,
                      [field.id]: e.target.value,
                    }));
                  }}
                />
              </div>
            ))}
          </div>
        )}

        {allowEdit &&
          extraFields.length > 0 &&
          !hasSavedDeepInfo &&
          !extraFieldsValid && (
            <p className="pt-1 text-center text-xs text-muted-foreground">
              กรุณากรอกช่องที่มีเครื่องหมาย{" "}
              <span className="text-destructive">*</span> ให้ครบ
            </p>
          )}
      </Card>

      {/* Price summary & confirm CTA — only in edit mode */}
      {allowEdit && (
        <Card className="space-y-4 p-5">
          {!isFormType && paymentMethod === "store_pay" && (
            <div className="relative overflow-hidden rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {totalLabel}
                  </div>
                  <div className="text-3xl font-black text-accent">
                    {baht(displayTotal)}
                  </div>
                </div>
                <div className="space-y-1 text-right">
                  <div className="text-xs font-medium text-foreground">
                    {selectedZone?.name ?? detail.zone}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {detail.feePerEntry ? (
                      <>
                        {ticketsToCharge} × {baht(detail.feePerEntry)}
                      </>
                    ) : (
                      <>
                        {ticketsToCharge} ใบ × ({baht(selectedZone?.price ?? 0)} +{" "}
                        {detail.serviceFee.toLocaleString()})
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-3 border-t border-primary/20 pt-2">
                <p className="text-[11px] font-medium leading-relaxed text-amber-600">
                  ⚠️ ราคานี้ยังไม่รวมภาษีมูลค่าเพิ่ม 7%
                </p>
              </div>
            </div>
          )}

          <Button
            className={ctaClass}
            disabled={!canConfirm || isSaving}
            onClick={() => setConfirmOpen(true)}
          >
            {isSaving ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                กำลังบันทึก...
              </>
            ) : (
              <>
                ยืนยันข้อมูล
                <ArrowRight className="size-4" />
              </>
            )}
          </Button>
          {!canConfirm && (
            <p className="text-center text-xs text-muted-foreground">
              {isFormType
                ? "กรุณากรอกข้อมูลให้ครบก่อนยืนยัน"
                : "กรุณาเลือกโซนและกรอกข้อมูลให้ครบก่อนยืนยัน"}
            </p>
          )}
          {saveDeepInfo.isError && (
            <p className="text-center text-sm text-destructive">
              {saveDeepInfo.error instanceof Error
                ? saveDeepInfo.error.message
                : "บันทึกข้อมูลไม่สำเร็จ"}
            </p>
          )}
        </Card>
      )}

      {/* Confirm dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>ยืนยันข้อมูลการจอง</DialogTitle>
            <DialogDescription>
              กรุณาตรวจสอบข้อมูลให้ถูกต้องก่อนยืนยัน หลังจากยืนยันแล้วจะไม่สามารถแก้ไขได้
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 rounded-xl border border-border/60 bg-secondary/10 p-4 text-sm">
            <div className="flex items-start justify-between gap-3">
              <span className="text-muted-foreground">งาน</span>
              <span className="text-right font-semibold">{detail.eventName}</span>
            </div>
            {!isFormType && (
              <div className="flex items-start justify-between gap-3">
                <span className="text-muted-foreground">โซน</span>
                <span className="text-right font-semibold">
                  {selectedZone?.name ?? detail.zone}
                </span>
              </div>
            )}
            <div className="flex items-start justify-between gap-3">
              <span className="text-muted-foreground">จำนวน</span>
              <span className="text-right font-semibold">
                {ticketsToCharge} {unitWord}
              </span>
            </div>
            <div className="flex items-start justify-between gap-3 border-t border-border/60 pt-2">
              <span className="text-muted-foreground">{totalLabel}</span>
              <span className="text-right text-base font-black text-accent">
                {baht(displayTotal)}
              </span>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setConfirmOpen(false)}
            >
              ยกเลิก
            </Button>
            <Button className="flex-1" onClick={handleConfirm}>
              ยืนยัน
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
