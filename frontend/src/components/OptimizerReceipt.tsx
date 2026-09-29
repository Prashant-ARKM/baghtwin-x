"use client";

import { PumpScheduleTable } from "@/components/OptimizerTables";
import type { EngineeringReceipt } from "@/lib/api";

const CONFIDENCE_STYLES = {
  high: "border-emerald-200 bg-emerald-50 text-emerald-700",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  low: "border-red-200 bg-red-50 text-red-700",
} as const;

function CurrentState({ r }: { r: EngineeringReceipt }) {
  const cs = r.current_state;
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
        Current state (day {cs.day})
      </h4>
      <p className="mt-1.5 text-xs leading-relaxed text-ink">
        {cs.phase} phase · {cs.temperature_c.toFixed(0)} °C near-wellbore · oil in
        the tubing {cs.tubing_viscosity_cp.toFixed(0)} cP · producing{" "}
        {cs.oil_rate_bpd.toFixed(1)} bbl/d at {cs.spm.toFixed(1)} SPM ×{" "}
        {cs.stroke_m.toFixed(1)} m. Pump {Math.round(cs.fillage * 100)}% full,
        rod-float risk {(cs.float_probability * 100).toFixed(0)}% (
        <span
          className={
            cs.risk_level === "high"
              ? "text-red-700 font-medium"
              : cs.risk_level === "elevated"
                ? "text-amber-700 font-medium"
                : "text-emerald-700 font-medium"
          }
        >
          {cs.risk_level}
        </span>
        ).
      </p>
    </div>
  );
}

function PredictionNoAction({ r }: { r: EngineeringReceipt }) {
  const p = r.prediction_no_action;
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
        If nothing is done
      </h4>
      <ul className="mt-1.5 space-y-1 text-xs leading-relaxed text-ink">
        <li>
          {p.violations.length === 0
            ? "No hard limits breached."
            : `${p.violations.length} hard limit${p.violations.length > 1 ? "s" : ""} breached: ${p.violations.map((v) => v.replace(/_/g, " ")).join(", ")}.`}
        </li>
        <li>
          Float probability reaches {(p.max_float_probability * 100).toFixed(0)}%
          (event day {p.float_event_day ?? "—"}), pump fillage falls to{" "}
          {Math.round(p.min_fillage * 100)}%, peak load {p.max_peak_load_kn.toFixed(0)}{" "}
          kN.
        </li>
        <li>Oil for the cycle: {p.oil_bbl.toFixed(0)} bbl.</li>
      </ul>
    </div>
  );
}

function RecommendedAction({ r }: { r: EngineeringReceipt }) {
  const a = r.recommended_action;
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
        Recommended action
      </h4>
      <div className="mt-2"><PumpScheduleTable schedule={a.schedule} /></div>
      {a.next_setpoint && (
        <p className="mt-1 text-xs text-ink">
          First change: <b>{a.next_setpoint.spm.toFixed(1)} SPM × {a.next_setpoint.stroke_m.toFixed(1)} m</b>{" "}
          from day {a.next_setpoint.from_day}.
        </p>
      )}
      <p className="mt-1.5 text-[11px] text-muted">{a.autonomy}</p>
    </div>
  );
}

export default function OptimizerReceipt({
  receipt,
  reason,
  decisionBusy,
  decisionError,
  decisionResult,
  onReasonChange,
  onApprove,
  onReject,
}: {
  receipt: EngineeringReceipt;
  reason: string;
  decisionBusy: boolean;
  decisionError: string | null;
  decisionResult: { id?: string | number; timestamp_utc?: string; decision?: string; status?: string } | null;
  onReasonChange: (reason: string) => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const c = receipt.confidence;
  return (
    <section className="rounded-xl border border-line bg-white p-6 shadow-card">
      <div className="flex items-center justify-between">
        <div><p className="eyebrow mb-2">Evidence & decision</p><h3 className="text-lg font-semibold">Engineering receipt</h3></div>
        <span className="rounded-full border border-line bg-page px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
          uncertainty margin {(receipt.uncertainty_margin_frac * 100).toFixed(0)}%
        </span>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-3">
        <CurrentState r={receipt} />
        <PredictionNoAction r={receipt} />
        <RecommendedAction r={receipt} />
      </div>

      {/* Why — numbered list */}
      <div className="mt-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
          Why
        </h4>
        <ol className="mt-1.5 list-decimal space-y-1.5 pl-5 text-xs leading-relaxed text-ink">
          {receipt.why.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ol>
      </div>

      {/* Confidence */}
      <div className="mt-4 rounded-md border border-line bg-page p-3">
        <span className="flex items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${CONFIDENCE_STYLES[c.level]}`}
          >
            {c.level} confidence
          </span>
          <span className="text-[11px] text-muted">
            simulated draws: p50 oil {c.recommended.oil_bbl_p50.toFixed(0)} bbl
            (p05–p95 {c.recommended.oil_bbl_p05.toFixed(0)}–
            {c.recommended.oil_bbl_p95.toFixed(0)}) · no-action violation
            fraction {(c.no_action.violation_fraction * 100).toFixed(0)}%
          </span>
        </span>
        <p className="mt-1.5 text-[11px] leading-snug text-muted">{c.basis}</p>
      </div>

      {/* What-if table */}
      <div className="mt-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
          What-if alternatives
        </h4>
        <div className="mt-2 overflow-x-auto rounded-md border border-line">
          <table className="w-full text-xs">
            <thead className="bg-page">
              <tr>
                <th className="px-2.5 py-1.5 text-left font-medium text-muted">Plan</th>
                <th className="px-2.5 py-1.5 text-left font-medium text-muted">Oil (bbl)</th>
                <th className="px-2.5 py-1.5 text-left font-medium text-muted">SOR</th>
                <th className="px-2.5 py-1.5 text-left font-medium text-muted">Energy</th>
                <th className="px-2.5 py-1.5 text-left font-medium text-muted">Max float</th>
                <th className="px-2.5 py-1.5 text-left font-medium text-muted">Min fill</th>
                <th className="px-2.5 py-1.5 text-left font-medium text-muted">Breaches</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line bg-white">
              {receipt.what_if.map((row, i) => (
                <tr key={i}>
                  <td className="px-2.5 py-1.5">{row.label}</td>
                  <td className="px-2.5 py-1.5 tabular-nums">{row.oil_bbl.toFixed(0)}</td>
                  <td className="px-2.5 py-1.5 tabular-nums">{row.sor.toFixed(2)}</td>
                  <td className="px-2.5 py-1.5 tabular-nums">{row.energy.toFixed(0)}</td>
                  <td className="px-2.5 py-1.5 tabular-nums">
                    {(row.max_float_probability * 100).toFixed(0)}%
                  </td>
                  <td className="px-2.5 py-1.5 tabular-nums">
                    {Math.round(row.min_fillage * 100)}%
                  </td>
                  <td className="px-2.5 py-1.5">
                    {row.violations.length === 0 ? (
                      <span className="font-medium text-emerald-700">none</span>
                    ) : (
                      <span className="font-medium text-red-700">
                        {row.violations.map((v) => v.replace(/_/g, " ")).join(", ")}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Approve / Reject */}
      <div className="mt-4 border-t border-line pt-4">
        <p className="text-xs font-medium text-ink">
          Recommend-only (L2). A human must approve. Nothing is sent to the well.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            placeholder="Reason (required)…"
            aria-label="Decision reason (required)"
            className="min-w-48 flex-1 rounded-md border border-line bg-white px-2.5 py-1.5 text-xs"
          />
          <button
            onClick={onApprove}
            disabled={decisionBusy || reason.trim().length === 0}
            className="rounded-md bg-ok px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40"
          >
            Approve
          </button>
          <button
            onClick={onReject}
            disabled={decisionBusy || reason.trim().length === 0}
            className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40"
          >
            Reject
          </button>
        </div>
        {decisionError && (
          <p className="mt-2 text-xs text-red-700">{decisionError}</p>
        )}
        {decisionResult && (
          <p className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-800">
            Decision recorded: <b>{decisionResult.decision ?? decisionResult.status}</b>
            {decisionResult.id !== undefined ? ` · #${decisionResult.id}` : ""}
            {decisionResult.timestamp_utc ? ` · ${new Date(decisionResult.timestamp_utc).toLocaleString()}` : ""}
          </p>
        )}
      </div>
    </section>
  );
}
