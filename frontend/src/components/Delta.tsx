"use client";

import { Card } from "@/components/ui";

export type Direction = "lower" | "higher";

function fmtSigned(value: number, digits = 1): string {
  return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(digits)}`;
}

/** Delta chip: green when the metric moved the good way, red when the bad way, grey when it is a wash. */
export function DeltaChip({
  deltaPct,
  direction,
}: {
  deltaPct: number | null;
  direction: Direction;
}) {
  if (deltaPct === null || Math.abs(deltaPct) < 0.5) {
    return (
      <span className="inline-flex items-center rounded-full border border-line bg-page px-1.5 py-px text-[11px] font-semibold text-muted">
        no change
      </span>
    );
  }
  const better = direction === "lower" ? deltaPct < 0 : deltaPct > 0;
  const cls = better
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-red-200 bg-red-50 text-red-700";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-px text-[11px] font-semibold tabular-nums ${cls}`}
    >
      {fmtSigned(deltaPct)}%
    </span>
  );
}

export function HeadlineCard({
  title,
  unit,
  baseline,
  recommended,
  deltaPct,
  direction,
  digits = 1,
}: {
  title: string;
  unit: string;
  baseline: number;
  recommended: number;
  deltaPct: number | null;
  direction: Direction;
  digits?: number;
}) {
  return (
    <Card className="!p-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted">
        {title}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-[#325578]">{recommended.toFixed(digits)}</div>
      <div className="mt-1 text-[10px] text-muted">{unit} <span className="text-slate-300">·</span> from {baseline.toFixed(digits)}</div>
      <div className="mt-1.5">
        <DeltaChip deltaPct={deltaPct} direction={direction} />
      </div>
    </Card>
  );
}
