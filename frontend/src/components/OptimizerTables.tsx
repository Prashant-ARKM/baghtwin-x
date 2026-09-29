"use client";

import type { CssChange, ScheduleBlock } from "@/lib/api";

const TH = "px-2.5 py-1.5 text-left font-medium text-muted";
const TD = "px-2.5 py-1.5 tabular-nums";

export function PumpScheduleTable({ schedule }: { schedule: ScheduleBlock[] }) {
  if (schedule.length === 0) return null;
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
        Pump schedule (recommended)
      </h4>
      <div className="mt-2 overflow-x-auto rounded-md border border-line">
        <table className="w-full text-xs">
          <thead className="bg-page">
            <tr>
              <th className={TH}>From day</th>
              <th className={TH}>To day</th>
              <th className={TH}>SPM</th>
              <th className={TH}>Stroke (m)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line bg-white">
            {schedule.map((b, i) => (
              <tr key={i}>
                <td className={TD}>{b.start_day}</td>
                <td className={TD}>{b.end_day}</td>
                <td className={TD}>{b.spm.toFixed(1)}</td>
                <td className={TD}>{b.stroke_m.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function CssChangesTable({ changes }: { changes: CssChange[] }) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
        Steam design changes (recommended)
      </h4>
      {changes.length === 0 ? (
        <p className="mt-2 text-xs text-muted">No steam design change.</p>
      ) : (
        <div className="mt-2 overflow-x-auto rounded-md border border-line">
          <table className="w-full text-xs">
            <thead className="bg-page">
              <tr>
                <th className={TH}>Variable</th>
                <th className={TH}>Baseline</th>
                <th className={TH}>Recommended</th>
                <th className={TH}>Unit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line bg-white">
              {changes.map((c) => (
                <tr key={c.variable}>
                  <td className="px-2.5 py-1.5 capitalize">{c.variable.replace(/_/g, " ")}</td>
                  <td className={TD}>{c.from}</td>
                  <td className={`${TD} font-semibold`}>{c.to}</td>
                  <td className={TD}>{c.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
