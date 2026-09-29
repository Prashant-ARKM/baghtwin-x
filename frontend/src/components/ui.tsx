"use client";

/**
 * Small shared UI primitives for the light professional theme.
 * White cards, thin slate borders, one blue accent; risk colours
 * green/amber/red come straight from the API's risk_level.
 */

import { API_BASE_URL } from "@/lib/api";

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-line bg-white p-4 shadow-card ${className}`}
    >
      {children}
    </section>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-line ${className}`} />;
}

export function KpiCard({
  label,
  value,
  unit,
  footer,
}: {
  label: string;
  /** Pre-formatted value string; "—" when the API returned null. */
  value: string;
  unit?: string;
  footer?: React.ReactNode;
}) {
  return (
    <Card className="!p-3.5">
      <div className="text-[10px] font-bold uppercase tracking-[0.11em] text-muted">
        {label}
      </div>
      {value === "…" ? (
        <Skeleton className="mt-1.5 h-5 w-16" />
      ) : (
        <div className="mt-1 text-xl font-semibold tracking-tight tabular-nums">
          {value}
          {unit && (
            <span className="ml-1 text-xs font-normal text-muted">{unit}</span>
          )}
        </div>
      )}
      {footer && <div className="mt-1.5">{footer}</div>}
    </Card>
  );
}

const RISK_STYLES = {
  low: {
    chip: "border-emerald-200 bg-emerald-50 text-emerald-700",
    dot: "bg-emerald-500",
  },
  elevated: {
    chip: "border-amber-200 bg-amber-50 text-amber-700",
    dot: "bg-amber-500",
  },
  high: {
    chip: "border-red-200 bg-red-50 text-red-700",
    dot: "bg-red-500",
  },
} as const;

export function RiskChip({ level }: { level: "low" | "elevated" | "high" }) {
  const s = RISK_STYLES[level];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ${s.chip}`}
    >
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {level} risk
    </span>
  );
}

export function ErrorCard({
  message,
  onRetry,
  retrying = false,
}: {
  message: string;
  onRetry: () => void;
  retrying?: boolean;
}) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-5" role="alert">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-red-800">
            Cannot reach the backend
          </h3>
          <p className="mt-1 break-words text-sm text-red-700">{message}</p>
          <p className="mt-1 text-xs text-red-600">
            Expected API at{" "}
            <code className="font-semibold">{API_BASE_URL}</code> — start it with{" "}
            <code className="font-semibold">
              uvicorn api.main:app --port 8000
            </code>{" "}
            (docs at {API_BASE_URL}/docs).
          </p>
        </div>
        <button
          onClick={onRetry}
          disabled={retrying}
          className="ml-auto shrink-0 rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
        >
          {retrying ? "Retrying…" : "Retry"}
        </button>
      </div>
    </div>
  );
}
