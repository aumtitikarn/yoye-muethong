"use client";

import { useState } from "react";
import Image from "next/image";
import { motion } from "motion/react";
import {
  Search,
  Calendar,
  Receipt,
  StickyNote,
  Tag,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardFooter } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import StepBooking from "./stepBooking";
import { Input } from "@/components/ui/input";
import { useEventsQuery } from "@/lib/queries";
import { EZoneStatus, EEventTypes } from "../types/enum";
import type { BookingEvent } from "@/mockData/event.data";

export type { BookingEvent } from "@/mockData/event.data";

export interface EventProps {
  readonly onBack: () => void;
  readonly onSelect: (event: BookingEvent) => void;
}

export default function Event({ onBack, onSelect }: EventProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<BookingEvent | null>(null);

  const { data: events = [], isPending, isError, error } = useEventsQuery();

  const filteredEvents = events.filter((event) =>
    event.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="min-h-screen py-4 px-4">
      <div className="max-w-6xl mx-auto space-y-3">
        <StepBooking currentStep={1} />

        {/* Search Bar */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="ค้นหางานที่ต้องการ..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-4 rounded-md border-2 border-border/60 bg-white"
            />
          </div>
        </motion.div>

        {/* Loading state */}
        {isPending && (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-muted-foreground">
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="text-sm">กำลังโหลดรายการงาน...</p>
          </div>
        )}

        {/* Error state */}
        {isError && (
          <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
            <AlertCircle className="size-10 text-destructive" />
            <p className="text-lg font-semibold text-foreground">
              {error?.message ?? "โหลดรายการงานไม่สำเร็จ"}
            </p>
            <Button variant="outline" onClick={() => window.location.reload()}>
              ลองอีกครั้ง
            </Button>
          </div>
        )}

        {/* Event Grid - poster & name only */}
        {!isPending && !isError && (
        <div className="grid gap-7 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredEvents.map((event, index) => {
            const isQueueAvailable = event.statusEvent?.includes(
              EZoneStatus.AVAILABLE,
            );
            const statusLabel = isQueueAvailable ? "คิวว่าง" : "คิวเต็ม";
            const statusStyle = isQueueAvailable
              ? "bg-emerald-500 text-white border border-emerald-500/30 font-semibold px-4 py-2 text-sm"
              : "bg-rose-500 text-white border border-rose-500/30 font-semibold px-4 py-2 text-sm";

            return (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1, duration: 0.5 }}
                className="h-full"
              >
                <Card
                  className={`h-full flex flex-col overflow-hidden hover:shadow-xl duration-300 border-2 py-0 ${
                    isQueueAvailable
                      ? "cursor-pointer hover:border-primary/50"
                      : "opacity-70 cursor-not-allowed"
                  }`}
                  onClick={() => {
                    if (isQueueAvailable) {
                      setSelectedEvent(event);
                    }
                  }}
                >
                  {/* Poster */}
                  <div className="relative">
                    <Image
                      src={event.poster || "/con.jpeg"}
                      alt={event.name}
                      width={600}
                      height={400}
                      className="object-cover w-full h-auto"
                      priority={index === 0}
                    />
                    <span
                      className={`absolute top-3 right-3 text-xs px-3 py-1 rounded-full whitespace-nowrap shadow-sm ${statusStyle}`}
                    >
                      {statusLabel}
                    </span>
                  </div>

                  <div className="space-y-2 p-5 pt-0 flex-1 flex flex-col">
                    <h3 className="font-bold text-lg text-foreground line-clamp-2 leading-tight">
                      {event.name}
                    </h3>
                    <CardFooter className="flex gap-2 w-full p-0 mt-auto">
                      <Button
                        variant="outline"
                        className="flex-1"
                        disabled={!isQueueAvailable}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isQueueAvailable) {
                            setSelectedEvent(event);
                          }
                        }}
                      >
                        ดูรายละเอียดงาน
                      </Button>
                      <Button
                        className="flex-1"
                        disabled={!isQueueAvailable}
                        aria-disabled={!isQueueAvailable}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isQueueAvailable) {
                            onSelect(event);
                          }
                        }}
                      >
                        {isQueueAvailable ? "เลือกงานนี้" : "คิวเต็ม"}
                      </Button>
                    </CardFooter>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
        )}

        {!isPending && !isError && filteredEvents.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-20"
          >
            <div className="text-6xl mb-4">🔍</div>
            <p className="text-xl text-muted-foreground">
              {events.length === 0
                ? "ยังไม่มีงานเปิดให้จองในขณะนี้"
                : "ไม่พบงานที่ตรงกับการค้นหา"}
            </p>
          </motion.div>
        )}

        {/* Event Detail Modal */}
        <Dialog
          open={!!selectedEvent}
          onOpenChange={(open) => !open && setSelectedEvent(null)}
        >
          <DialogContent className="sm:max-w-5xl max-h-[90vh] p-0 sm:p-0">
            {selectedEvent && (
              <div className="flex h-full max-h-[90vh] flex-col">
                <DialogHeader className="border-b px-6 py-6">
                  <DialogTitle className="text-2xl font-black text-foreground pr-4">
                    {selectedEvent.name}
                  </DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto px-6 py-6">
                  <div className="grid gap-6 md:grid-cols-2 md:gap-8">
                    <div className="space-y-4 text-foreground">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-3">
                          <Tag className="w-5 h-5 text-primary" />
                          <div>
                            <p className="text-sm text-muted-foreground">
                              ประเภทงาน
                            </p>
                            <p className="font-semibold">
                              {selectedEvent.eventTypes === EEventTypes.form
                                ? "งานฟอร์ม"
                                : "งานกดบัตร"}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Calendar className="w-5 h-5 text-primary" />
                        <div>
                          <p className="text-sm text-muted-foreground">
                            {selectedEvent.eventTypes === EEventTypes.form
                              ? "วันที่กรอกฟอร์ม"
                              : "รอบการแสดง"}
                          </p>
                          <p className="font-semibold">
                            {selectedEvent.showTime}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Receipt className="w-5 h-5 text-primary" />
                        <div>
                          <p className="text-sm text-muted-foreground">
                            {selectedEvent.eventTypes === EEventTypes.form
                              ? "ค่ากด/รายชื่อ"
                              : "ราคาประมาณค่ากด"}
                          </p>
                          <p className="font-semibold">
                            {selectedEvent.eventTypes === EEventTypes.form
                              ? selectedEvent.servicePriceForm
                              : "2,500 - 6,500"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <StickyNote className="w-5 h-5 text-primary" />
                        <div>
                          <p className="text-sm text-muted-foreground">
                            หมายเหตุ
                          </p>
                          <p className="font-semibold">{selectedEvent.note}</p>
                        </div>
                      </div>
                    </div>
                    {selectedEvent.eventTypes !== EEventTypes.form && (
                      <div className="space-y-3 overflow-y-auto max-h-[400px] pr-2">
                        {selectedEvent.showTimeOptions?.[0]?.zones.map(
                          (zone) => {
                            let statusColor = "bg-green-500";
                            let statusShadow = "shadow-green-500/50";
                            let borderColor = "border-green-500/20";
                            let bgGradient = "from-green-500/5 to-transparent";
                            let remainingTextColor = "text-green-600";

                            if (zone.status === EZoneStatus.SOLD_OUT) {
                              statusColor = "bg-red-500";
                              statusShadow = "shadow-red-500/50";
                              borderColor = "border-red-500/20";
                              bgGradient = "from-red-500/5 to-transparent";
                            } else if (zone.status === EZoneStatus.TEMP_FULL) {
                              statusColor = "bg-amber-500";
                              statusShadow = "shadow-amber-500/50";
                              borderColor = "border-amber-500/20";
                              bgGradient = "from-amber-500/5 to-transparent";
                              remainingTextColor = "text-amber-600";
                            }
                            const zoneStatusLabel = {
                              [EZoneStatus.AVAILABLE]: "คิวว่าง",
                              [EZoneStatus.TEMP_FULL]: "รอยืนยัน",
                              [EZoneStatus.SOLD_OUT]: (
                                <span className="text-red-600">คิวเต็ม</span>
                              ),
                            }[zone.status];

                            return (
                              <div
                                key={zone.id}
                                className={`
                              relative group overflow-hidden rounded-xl transition-all duration-300
                              border-2 ${borderColor}
                              ${zone.remaining === 0 ? "opacity-60" : ""}
                            `}
                              >
                                <div
                                  className={`absolute inset-0 bg-gradient-to-br ${bgGradient} opacity-50`}
                                />

                                <div className="relative p-3 backdrop-blur-sm bg-background/50">
                                  <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-2">
                                      <div
                                        className={`w-2 h-2 rounded-full ${statusColor} ${statusShadow}`}
                                      />
                                      <h3 className="font-bold text-base truncate text-foreground">
                                        {zone.name} (฿
                                        {zone.ticketPrice.toLocaleString()})
                                      </h3>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2">
                                      <div className="px-3 py-1 rounded-xl">
                                        <p className="font-bold text-sm text-primary">
                                          ฿
                                          {zone.servicePrice?.toLocaleString() ??
                                            0}
                                        </p>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <div
                                          className={`w-1 h-1 rounded-full ${statusColor}`}
                                        />
                                        <p
                                          className={`text-xs font-medium ${remainingTextColor}`}
                                        >
                                          {zone.remaining > 0
                                            ? `เหลือ ${zone.remaining} คิว`
                                            : zoneStatusLabel}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          },
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <DialogFooter className="border-t px-6 py-4">
                  <Button
                    className="w-full"
                    onClick={() => {
                      if (selectedEvent) {
                        onSelect(selectedEvent);
                        setSelectedEvent(null);
                      }
                    }}
                  >
                    เลือกงานนี้
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
