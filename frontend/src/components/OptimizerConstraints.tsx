"use client";

import type { ConstraintMargin } from "@/lib/api";

export default function OptimizerConstraints({
  margins,
  activeConstraints,
}: {
  margins: ConstraintMargin[];
  activeConstraints: string[];
}) {
  return (
    <section className="rounded-lg border border-line bg-white p-4 shadow-card">
      <h3 className="text-sm font-semibold">Constraints (recommended plan)</h3>
      <p className="mt-0.5 text-xs text-muted">
        Room left before each engineering limit. Red = exceeded, amber = within
        the 5% safety margin.
      </p>
      <ul className="mt-3 space-y-2.5">
        {margins.map((m) => {
          const isActive = activeConstraints.includes(m.name);
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
                <span className="flex items-center gap-1.5 truncate capitalize">
                  {m.name.replace(/_/g, " ")}
                  {isActive && (
                    <span className="shrink-0 rounded-full border border-accent/30 bg-accent/10 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-accent">
                      active
                    </span>
                  )}
                </span>
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
    </section>
  );
}
