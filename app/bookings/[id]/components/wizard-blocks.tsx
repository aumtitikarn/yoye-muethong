"use client";

import type { LucideIcon } from "lucide-react";
import { TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/** Format a number as Thai baht (฿1,234). */
export function baht(n: number): string {
  return `฿${(n ?? 0).toLocaleString()}`;
}

/** Icon + label + value row used across the wizard summary cards. */
export function InfoRow({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-accent">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p
          className={cn(
            "text-sm font-semibold break-words text-foreground",
            mono && "font-mono",
          )}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

/** Section heading with a gradient icon chip and an optional action slot. */
export function SectionHeader({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/25 to-primary/5 text-accent">
          <Icon className="size-5" />
        </div>
        <div className="space-y-0.5">
          <h3 className="text-base font-bold leading-tight">{title}</h3>
          {hint && (
            <p className="max-w-[240px] text-xs leading-snug text-muted-foreground sm:max-w-none">
              {hint}
            </p>
          )}
        </div>
      </div>
      {action}
    </div>
  );
}

/** Big step title shown at the top of each wizard step's content. */
export function StepIntro({
  step,
  title,
  subtitle,
}: {
  step: number;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-accent">
        ขั้นตอนที่ {step}
      </p>
      <h2 className="text-xl font-black leading-tight text-foreground sm:text-2xl">
        {title}
      </h2>
      {subtitle && (
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
}

/** Amber policy / caution note. */
export function CautionNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 rounded-xl border border-amber-200/70 bg-amber-50 p-2.5 text-[11px] leading-snug text-amber-700">
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}
