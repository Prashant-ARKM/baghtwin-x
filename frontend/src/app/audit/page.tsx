"use client";

import { Fragment, useState } from "react";
import { Card, ErrorCard, Skeleton } from "@/components/ui";
import { fetchRecommendations, type AuditEntry } from "@/lib/api";
import { useAsync } from "@/lib/useAsync";

const TH = "px-2.5 py-1.5 text-left font-medium text-muted";

function localTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function Detail({ e }: { e: AuditEntry }) {
  const r = e.receipt;
  const a = r.recommended_action;
  return (
    <div className="grid grid-cols-1 gap-4 bg-page px-4 py-3 text-xs md:grid-cols-2">
      <div>
        <h4 className="font-semibold uppercase tracking-wide text-muted">Why</h4>
        <ol className="mt-1.5 list-decimal space-y-1 pl-5 leading-relaxed text-ink">
          {r.why.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ol>
      </div>
      <div className="space-y-3">
        <div>
          <h4 className="font-semibold uppercase tracking-wide text-muted">Recommended action</h4>
          <p className="mt-1.5 leading-relaxed text-ink">{a.schedule_text}</p>
          {a.css_changes.length > 0 && (
            <p className="mt-1 text-ink">
              Steam design: {a.css_changes.map((c) => `${c.variable.replace(/_/g, " ")} ${c.from} → ${c.to} ${c.unit}`).join("; ")}
            </p>
          )}
        </div>
        <div>
          <h4 className="font-semibold uppercase tracking-wide text-muted">Confidence</h4>
          <p className="mt-1.5 text-ink">
            <span className="font-semibold uppercase">{r.confidence.level}</span>. {r.confidence.basis}
          </p>
        </div>
        <p className="text-[11px] text-muted">{e.autonomy_level}</p>
      </div>
    </div>
  );
}

export default function AuditPage() {
  const { data, error, loading, reload } = useAsync(() => fetchRecommendations(), []);
  const [open, setOpen] = useState<number | null>(null);
  const entries = data ? [...data.entries].reverse() : [];

  return (
    <div className="space-y-4">
      <div className="page-heading">
        <div><p className="eyebrow">Governance / Decision history</p><h1>Every decision, accounted for<span className="heading-dot">.</span></h1><p>Human decisions, recorded reasons and the engineering evidence behind them.</p></div>
        <button
          onClick={reload}
          disabled={loading}
          className="ml-auto rounded-md border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink hover:bg-page disabled:opacity-50"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error && <ErrorCard message={error} onRetry={reload} retrying={loading} />}
      {loading && !data && <Skeleton className="h-40" />}

      {data && entries.length === 0 && (
        <Card>
          <p className="text-sm text-muted">
            No decisions yet. Approve or reject a recommendation on the Optimizer tab.
          </p>
        </Card>
      )}

      {data && entries.length > 0 && (
        <Card className="!p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-page">
                <tr>
                  <th className={TH}>#</th>
                  <th className={TH}>Time</th>
                  <th className={TH}>Decision</th>
                  <th className={TH}>Reason</th>
                  <th className={TH}>Cycle</th>
                  <th className={TH}>Mode</th>
                  <th className={TH}></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line bg-white">
                {entries.map((e) => (
                  <Fragment key={e.id}>
                    <tr>
                      <td className="px-2.5 py-2 tabular-nums">{e.id}</td>
                      <td className="px-2.5 py-2 tabular-nums">{localTime(e.timestamp_utc)}</td>
                      <td className="px-2.5 py-2">
                        <span
                          className={`inline-block rounded-full border px-2 py-px text-[10px] font-semibold uppercase tracking-wide ${
                            e.decision === "approve"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-red-200 bg-red-50 text-red-700"
                          }`}
                        >
                          {e.decision === "approve" ? "approved" : "rejected"}
                        </span>
                      </td>
                      <td className="px-2.5 py-2">{e.reason || "—"}</td>
                      <td className="px-2.5 py-2 tabular-nums">{e.receipt.audit_stub.cycle}</td>
                      <td className="px-2.5 py-2">
                        {e.receipt.audit_stub.mode === "joint" ? "Steam + pump" : "Pump only"}
                      </td>
                      <td className="px-2.5 py-2 text-right">
                        <button
                          onClick={() => setOpen(open === e.id ? null : e.id)}
                          className="rounded-md border border-line bg-white px-2.5 py-1 text-[11px] font-semibold text-accent hover:bg-page"
                        >
                          {open === e.id ? "Hide receipt" : "Open receipt"}
                        </button>
                      </td>
                    </tr>
                    {open === e.id && (
                      <tr>
                        <td colSpan={7} className="p-0">
                          <Detail e={e} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
