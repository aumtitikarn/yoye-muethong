"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useBookingDetailQuery } from "@/lib/queries";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import Loading from "@/components/Loading";
import {
  ArrowLeft,
  CalendarDays,
  CreditCard,
  MapPin,
  Minus,
  Plus,
  Receipt,
  StickyNote,
  Ticket,
  User,
  Users,
} from "lucide-react";
import { EEventTypes } from "../types/enum";

// ── Types ──────────────────────────────────────────────

type ZoneOption = {
  id: number;
  name: string;
  price: number;
  available: boolean;
};

type BookingDetail = {
  bookingCode: string;
  eventName: string;
  poster: string;
  showTime: string;
  zone: string;
  eventTypes: EEventTypes;
  quantity: number;
  total: number;
  serviceFee: number;
  price: number;
  note?: string;
  zones: ZoneOption[];
};

type PaymentMethod = "store_pay" | "self_pay";

// ── Component ──────────────────────────────────────────

export default function BookingDetailPage() {
  const params = useParams();
  const bookingId = params.id as string;

  const { data: detail, isPending, isError, error } =
    useBookingDetailQuery(bookingId);

  const [selectedZoneId, setSelectedZoneId] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>("store_pay");
  const [adjustedQuantity, setAdjustedQuantity] = useState(1);
  const [extraValues, setExtraValues] = useState<Record<number, string>>({});
  const [isEditingZone, setIsEditingZone] = useState(false);

  // Sync editable state once the real booking loads.
  useEffect(() => {
    if (!detail) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedZoneId(
      detail.zones.find((z) => z.name === detail.zone)?.id ?? null,
    );
    setAdjustedQuantity(Math.max(1, detail.quantity));
  }, [detail]);

  if (isPending) return <Loading />;

  if (isError || !detail) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-lg font-semibold text-foreground">
          {error?.message ?? "ไม่พบข้อมูลการจอง"}
        </p>
        <Button asChild variant="outline">
          <Link href="/tracking">กลับหน้าติดตามสถานะ</Link>
        </Button>
      </div>
    );
  }

  const booking: BookingDetail = {
    ...detail,
    eventTypes:
      detail.eventTypes === "form" ? EEventTypes.form : EEventTypes.ticket,
  };
  const extraFields = detail.fields;

  const selectedZone = booking.zones.find((z) => z.id === selectedZoneId);
  const ticketsToCharge = Math.min(adjustedQuantity, booking.quantity);

  // Calculate unit price for fallback (e.g. form type without zones)
  const baseUnitPrice =
    booking.quantity > 0 ? booking.total / booking.quantity : 0;
  const unitTotal = baseUnitPrice + (booking.serviceFee || 0);

  const updatedTotal = selectedZone
    ? (selectedZone.price + (booking.serviceFee || 0)) * ticketsToCharge
    : unitTotal * ticketsToCharge;

  // Prefer the event-level price when set: total = price × จำนวนรายชื่อ/ใบ.
  const displayTotal = booking.price
    ? booking.price * ticketsToCharge
    : updatedTotal;

  const isFormType = booking.eventTypes === EEventTypes.form;
  const totalLabel = isFormType ? "ค่าฟอร์ม" : "ยอดค่าบัตรรวม";

  const extraFieldsValid = extraFields.every(
    (f) => !f.isRequired || (extraValues[f.id] ?? "").trim().length > 0,
  );
  const canSubmit = selectedZoneId !== null && extraFieldsValid;

  return (
    <div className="min-h-screen py-4 px-3 sm:px-4">
      <div className="max-w-4xl mx-auto space-y-4">
        {/* Back */}
        <Button variant="ghost" size="sm" asChild className="text-primary">
          <Link href="/bookings" className="gap-1.5">
            <ArrowLeft className="size-4" />
            กลับหน้าจอง
          </Link>
        </Button>

        {/* Header */}
        <div className="text-center space-y-1">
          <p className="text-xs sm:text-sm uppercase tracking-[0.3em] text-muted-foreground">
            Booking Detail
          </p>
          <h1 className="text-xl sm:text-2xl font-black text-foreground">
            รายละเอียดการจอง
          </h1>
          <p className="text-sm text-muted-foreground font-mono">{bookingId}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* ── Left: Event Info ── */}
          <div className="lg:col-span-1 space-y-4">
            <Card className="overflow-hidden pt-0">
              <div className="relative aspect-[3/4] w-full">
                <Image
                  src={booking.poster}
                  alt={booking.eventName}
                  fill
                  className="object-cover"
                />
              </div>
              <div className="p-4 space-y-3">
                <h2 className="text-lg font-bold leading-tight">
                  {booking.eventName}
                </h2>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Receipt className="size-4 shrink-0" />
                    <span className="font-mono font-semibold text-foreground">
                      {booking.bookingCode}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <CalendarDays className="size-4 shrink-0" />
                    <span>{booking.showTime}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="size-4 shrink-0" />
                    <span>{booking.zone}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Ticket className="size-4 shrink-0" />
                    <span>{booking.quantity} ใบ</span>
                  </div>
                  {booking.note && (
                    <div className="flex items-start gap-2 text-muted-foreground">
                      <StickyNote className="size-4 shrink-0 mt-0.5" />
                      <span className="text-xs">{booking.note}</span>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          </div>

          {/* ── Right: Update Form ── */}
          <div className="lg:col-span-2 space-y-4">
            {/* Zone Selection */}
            <Card className="p-5 space-y-4">
              {booking.eventTypes === EEventTypes.form ? (
                /* ── Form Type: Quantity Selection ── */
                <>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <Users className="size-5 text-primary mt-0.5" />
                      <div className="space-y-1">
                        <h3 className="text-base font-bold">จำนวนรายชื่อ</h3>
                        <p className="text-gray-500 text-xs text-muted-foreground w-full max-w-[220px] xs:max-w-none leading-tight">
                          ***
                          กรณีลดจำนวนรายชื่อภายหลังทางร้านขอสงวนสิทธิ์ไม่คืนเงินมัดจำในส่วนที่ลดลง
                          ***
                        </p>
                      </div>
                    </div>
                    {!isEditingZone ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs shrink-0"
                        onClick={() => setIsEditingZone(true)}
                      >
                        เปลี่ยนจำนวนรายชื่อ
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="h-8 text-xs shrink-0"
                        onClick={() => setIsEditingZone(false)}
                      >
                        บันทึก
                      </Button>
                    )}
                  </div>

                  <div className="mt-2">
                    {!isEditingZone ? (
                      <div className="flex items-center gap-4 p-4 py-2 border rounded-xl bg-background/50">
                        <div className="size-10 flex items-center justify-center bg-primary/10 rounded-full shrink-0">
                          <Users className="size-5 text-primary" />
                        </div>
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">
                            จำนวนที่เลือก
                          </p>
                          <p className="text-lg text-primary">
                            {ticketsToCharge} รายชื่อ
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 border-2 border-primary bg-primary/5 rounded-xl space-y-4">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm font-semibold text-foreground">
                            ปรับจำนวนรายชื่อ
                          </Label>
                          <span className="text-[10px] text-amber-600 font-medium">
                            ⚠️ ลดได้เท่านั้น ไม่สามารถเพิ่มได้
                          </span>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="inline-flex items-center rounded-xl border border-border/70 bg-background px-2 py-1.5 shadow-sm">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-9 rounded-lg hover:bg-muted"
                              onClick={() =>
                                setAdjustedQuantity((prev) =>
                                  Math.max(1, prev - 1),
                                )
                              }
                              disabled={adjustedQuantity === 1}
                            >
                              <Minus className="size-4" />
                            </Button>
                            <div className="min-w-[60px] text-center">
                              <p className="text-2xl font-black leading-none text-primary">
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
                                  Math.min(booking.quantity, prev + 1),
                                )
                              }
                              disabled={adjustedQuantity === booking.quantity}
                            >
                              <Plus className="size-4" />
                            </Button>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            <p>จากจำนวนเดิม</p>
                            <div className="flex items-center gap-1 font-semibold">
                              <Users className="size-3" />
                              {booking.quantity} รายชื่อ
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                /* ── Ticket Type: Zone Selection ── */
                <>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <MapPin className="size-5 text-primary mt-0.5" />
                      <div className="space-y-1">
                        <h3 className="text-base font-bold">โซน / ราคาบัตร</h3>
                        <p className="text-gray-500 text-xs text-muted-foreground w-full max-w-[220px] xs:max-w-none leading-tight">
                          ***
                          กรณีลดจำนวนบัตรภายหลังทางร้านขอสงวนสิทธิ์ไม่คืนเงินมัดจำในส่วนที่ลดลง
                          ***
                        </p>
                      </div>
                    </div>
                    {!isEditingZone ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs shrink-0"
                        onClick={() => setIsEditingZone(true)}
                      >
                        เปลี่ยนราคาบัตรหลัก
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="h-8 text-xs shrink-0"
                        onClick={() => setIsEditingZone(false)}
                      >
                        บันทึก
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(isEditingZone
                      ? booking.zones
                      : booking.zones.filter((z) => z.id === selectedZoneId)
                    ).map((zone) => (
                      <div
                        key={zone.id}
                        className={`relative rounded-xl border-2 p-4 transition-all duration-200 ${
                          selectedZoneId === zone.id
                            ? "border-primary bg-primary/5 shadow-md"
                            : zone.available
                              ? "border-border/60"
                              : "border-border/30 opacity-50"
                        }`}
                      >
                        <button
                          type="button"
                          disabled={!zone.available || !isEditingZone}
                          onClick={() => setSelectedZoneId(zone.id)}
                          className="w-full text-left"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-sm">
                              {zone.name}
                            </span>
                            {!zone.available && (
                              <span className="text-[10px] font-semibold text-destructive bg-destructive/10 px-2 py-0.5 rounded-full">
                                เต็ม
                              </span>
                            )}
                          </div>
                          <p className="text-lg font-black text-primary mt-1">
                            ฿{zone.price.toLocaleString()}
                            <span className="text-xs text-muted-foreground font-normal ml-1">
                              + ( ค่ากดบัตร{" "}
                              {booking.serviceFee.toLocaleString()}
                              /ใบ )
                            </span>
                          </p>
                        </button>
                        {selectedZoneId === zone.id && isEditingZone && (
                          <div className="mt-3 pt-3 border-t border-primary/20 space-y-2">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs font-semibold text-muted-foreground">
                                ปรับจำนวนบัตร
                              </Label>
                              <span className="text-[10px] text-amber-600 font-medium">
                                ⚠️ ลดได้เท่านั้น ไม่สามารถเพิ่มได้
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
                                      Math.min(booking.quantity, prev + 1),
                                    );
                                  }}
                                  disabled={
                                    adjustedQuantity === booking.quantity
                                  }
                                >
                                  <Plus className="size-3.5" />
                                </Button>
                              </div>
                              <p className="text-[10px] text-muted-foreground">
                                จำนวนเดิม {booking.quantity} ใบ
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </Card>

            {/* Payment Method */}
            <Card className="p-5 space-y-4">
              <div className="flex items-center gap-2">
                <CreditCard className="size-5 text-primary" />
                <h3 className="text-base font-bold">วิธีการชำระ</h3>
              </div>
              <RadioGroup
                value={paymentMethod}
                onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}
                className="grid grid-cols-1 sm:grid-cols-2 gap-3"
              >
                <label
                  htmlFor="store_pay"
                  className={`flex items-center gap-3 rounded-xl border-2 p-4 cursor-pointer transition-all duration-200 ${
                    paymentMethod === "store_pay"
                      ? "border-primary bg-primary/5 shadow-md"
                      : "border-border/60 hover:border-primary/40"
                  }`}
                >
                  <RadioGroupItem value="store_pay" id="store_pay" />
                  <div>
                    <p className="font-semibold text-sm">ฝากร้านจ่าย</p>
                    <p className="text-xs text-muted-foreground">
                      โอนค่าบัตรให้ร้าน ก่อนวันกด 1 วัน
                    </p>
                  </div>
                </label>
                <label
                  htmlFor="self_pay"
                  className={`flex items-center gap-3 rounded-xl border-2 p-4 cursor-pointer transition-all duration-200 ${
                    paymentMethod === "self_pay"
                      ? "border-primary bg-primary/5 shadow-md"
                      : "border-border/60 hover:border-primary/40"
                  }`}
                >
                  <RadioGroupItem value="self_pay" id="self_pay" />
                  <div>
                    <p className="font-semibold text-sm">จ่ายเอง</p>
                    <p className="text-xs text-muted-foreground">
                      ลูกค้าชำระค่าบัตรด้วยตนเอง
                    </p>
                  </div>
                </label>
              </RadioGroup>
            </Card>

            {/* Extra Fields from Backend */}
            <Card className="p-5 space-y-4">
              <div className="flex items-center gap-2">
                <User className="size-5 text-primary" />
                <h3 className="text-base font-bold">ข้อมูลเพิ่มเติม</h3>
              </div>
              {extraFields.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  งานนี้ไม่มีข้อมูลเพิ่มเติมที่ต้องกรอก
                </p>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {extraFields.map((field) => (
                    <div key={field.id} className="space-y-1.5">
                      <Label
                        htmlFor={`extra-${field.id}`}
                        className="text-sm font-medium"
                      >
                        {field.label}
                        {field.isRequired && (
                          <span className="text-destructive ml-1">*</span>
                        )}
                      </Label>
                      <Input
                        id={`extra-${field.id}`}
                        placeholder={field.label}
                        value={extraValues[field.id] ?? ""}
                        onChange={(e) =>
                          setExtraValues((prev) => ({
                            ...prev,
                            [field.id]: e.target.value,
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Price Summary & Submit */}
            <Card className="p-5 space-y-4">
              {paymentMethod === "store_pay" && (
                <div className="relative overflow-hidden rounded-2xl">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5 rounded-2xl" />
                  <div className="relative p-5 backdrop-blur-sm bg-background/80 border-2 border-primary/30 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          {totalLabel}
                        </div>
                        <div className="text-3xl font-black text-primary">
                          ฿{displayTotal.toLocaleString()}
                        </div>
                      </div>
                      <div className="text-right space-y-1">
                        <div className="text-xs text-muted-foreground font-medium">
                          {selectedZone?.name ?? booking.zone}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {booking.price ? (
                            <>
                              {ticketsToCharge} × ฿
                              {booking.price.toLocaleString()}
                            </>
                          ) : (
                            <>
                              {ticketsToCharge} ใบ × (฿
                              {(selectedZone?.price ?? 0).toLocaleString()} +{" "}
                              {booking.serviceFee.toLocaleString()})
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="pt-2 border-t border-primary/20">
                      <p className="text-[11px] text-amber-600 font-medium leading-relaxed">
                        ⚠️ ราคานี้ยังไม่รวมภาษีมูลค่าเพิ่ม 7%
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <Button className="w-full h-11" disabled={!canSubmit} asChild>
                <Link href="/tracking">ยืนยันข้อมูล</Link>
              </Button>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
