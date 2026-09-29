"use client";

import type { ConstraintMargin } from "@/lib/api";

function fmtName(name: string): string {
  return name.replace(/_/g, " ");
}

export default function ConstraintMargins({
  margins,
  loading,
}: {
  margins: ConstraintMargin[];
  loading: boolean;
}) {
  return (
    <section className="rounded-lg border border-line bg-white p-4 shadow-card">
      <h3 className="text-sm font-semibold">Constraint margins</h3>
      <p className="mt-0.5 text-xs text-muted">
        How much room is left before each engineering limit. Red = exceeded,
        amber = within 5%.
      </p>
      {loading ? (
        <div className="mt-3 space-y-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-page" />
          ))}
        </div>
      ) : margins.length === 0 ? (
        <p className="mt-3 text-xs text-muted">
          No constraints apply in this phase (well is not producing).
        </p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {margins.map((m) => {
            // Positive margin = room left. Width saturates at 50% for bar scaling.
            const width = Math.min(Math.max(m.margin_pct, 0), 50) * 2;
            const color = m.violated
              ? "bg-red-500"
              : m.active
                ? "bg-amber-500"
                : "bg-emerald-500";
            const textColor = m.violated
              ? "text-red-700"
              : m.active
                ? "text-amber-700"
                : "text-emerald-700";
            return (
              <li key={m.name}>
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="truncate capitalize">{fmtName(m.name)}</span>
                  <span className={`font-semibold tabular-nums ${textColor}`}>
                    {m.margin_pct < 0 ? "−" : "+"}
                    {Math.abs(m.margin_pct).toFixed(0)}%
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-page">
                  <div
                    className={`h-full rounded-full ${color}`}
                    style={{ width: `${width}%` }}
                  />
                </div>
                <div className="mt-0.5 text-[10px] text-muted tabular-nums">
                  value {m.value.toFixed(2)} · limit {m.limit.toFixed(2)}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
