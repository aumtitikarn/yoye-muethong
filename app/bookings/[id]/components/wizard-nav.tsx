"use client";

import Image from "next/image";
import { Check } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type WizardStep = {
  id: number;
  label: string;
  hint: string;
  icon: LucideIcon;
  done?: boolean;
};

/**
 * Free-navigation wizard rail. Renders a vertical, sticky sidebar on desktop and
 * a horizontal, scrollable stepper on mobile — every step is always clickable
 * (this is a detail/status page, not a gated flow).
 */
export function WizardNav({
  steps,
  active,
  onSelect,
  eventName,
  bookingCode,
  poster,
  typeLabel,
  typeIcon: TypeIcon,
}: {
  steps: WizardStep[];
  active: number;
  onSelect: (id: number) => void;
  eventName: string;
  bookingCode: string;
  poster: string;
  typeLabel: string;
  typeIcon: LucideIcon;
}) {
  return (
    <>
      {/* ── Mobile: horizontal stepper ── */}
      <nav className="lg:hidden">
        <ol className="flex gap-2 overflow-x-auto pb-1">
          {steps.map((s) => {
            const isActive = active === s.id;
            return (
              <li key={s.id} className="min-w-[140px] flex-1">
                <button
                  type="button"
                  onClick={() => onSelect(s.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-2xl border-2 p-3 text-left transition-all",
                    isActive
                      ? "border-primary bg-primary/5 shadow-md"
                      : "border-border/60 bg-card hover:border-primary/40",
                  )}
                >
                  <StepBadge step={s} isActive={isActive} />
                  <div className="min-w-0">
                    <p
                      className={cn(
                        "truncate text-xs font-bold",
                        isActive ? "text-accent" : "text-foreground",
                      )}
                    >
                      {s.label}
                    </p>
                  </div>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* ── Desktop: sticky vertical rail ── */}
      <aside className="hidden lg:block">
        <div className="sticky top-[156px] space-y-4">
          {/* Event mini-summary */}
          <div className="flex items-center gap-3 rounded-2xl border border-primary/20 bg-card p-3 shadow-sm">
            <div className="relative size-14 shrink-0 overflow-hidden rounded-xl">
              <Image
                src={poster}
                alt={eventName}
                fill
                className="object-cover"
                sizes="56px"
              />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold leading-tight text-foreground">
                {eventName}
              </p>
              <p className="truncate font-mono text-[11px] text-muted-foreground">
                {bookingCode}
              </p>
              <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-accent">
                <TypeIcon className="size-3" />
                {typeLabel}
              </span>
            </div>
          </div>

          {/* Steps */}
          <ol className="space-y-2">
            {steps.map((s) => {
              const isActive = active === s.id;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(s.id)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-2xl border-2 p-3.5 text-left transition-all",
                      isActive
                        ? "border-primary bg-primary/5 shadow-md"
                        : "border-border/60 bg-card hover:border-primary/40 hover:bg-primary/[0.03]",
                    )}
                  >
                    <StepBadge step={s} isActive={isActive} />
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "text-sm font-bold leading-tight",
                          isActive ? "text-accent" : "text-foreground",
                        )}
                      >
                        {s.label}
                      </p>
                      <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                        {s.hint}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </aside>
    </>
  );
}

function StepBadge({ step, isActive }: { step: WizardStep; isActive: boolean }) {
  const Icon = step.icon;
  return (
    <div
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-xl text-sm font-black transition-colors",
        isActive
          ? "bg-gradient-to-br from-[#fe8516] to-[#fe5e2a] text-white shadow-sm"
          : step.done
            ? "bg-emerald-100 text-emerald-600"
            : "bg-muted text-muted-foreground",
      )}
    >
      {step.done && !isActive ? (
        <Check className="size-4" />
      ) : (
        <Icon className="size-4" />
      )}
    </div>
  );
}
