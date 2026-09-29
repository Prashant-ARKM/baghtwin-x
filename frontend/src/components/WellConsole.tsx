"use client";

import ChartCard from "@/components/ChartCard";
import { Card, RiskChip, Skeleton } from "@/components/ui";
import { fetchState, fetchTimeline } from "@/lib/api";
import { cardFigure } from "@/lib/figures";
import { useAsync } from "@/lib/useAsync";

const CYCLE = 4;
const NOW = 100;

function Tile({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="min-w-[110px] flex-1 border-l border-line px-4 py-2 first:border-l-0">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">
        {value}
        {unit && <span className="ml-1 text-xs font-normal text-muted">{unit}</span>}
      </div>
    </div>
  );
}

function dot(type: string): string {
  if (type === "rod_float" || type === "load_limit") return "bg-red-500";
  if (type === "float_alert" || type === "fluid_pound") return "bg-amber-500";
  return "bg-slate-400";
}

export default function WellConsole() {
  const st = useAsync(() => fetchState(CYCLE, NOW), []);
  const tl = useAsync(() => fetchTimeline(CYCLE), []);
  const s = st.data;
  const events = (tl.data?.events ?? []).filter((e) => e.day >= NOW - 5);
  const level = s?.risk_level ?? "low";
  const border =
    level === "high" ? "border-l-red-500" : level === "elevated" ? "border-l-amber-500" : "border-l-emerald-500";

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
        Well console · Baghewala well A · cycle {CYCLE} · day {NOW}
      </h2>

      {/* status strip */}
      <div className={`flex flex-wrap items-center rounded-lg border border-line border-l-4 bg-white shadow-card ${border}`}>
        {!s ? (
          <Skeleton className="m-3 h-10 w-full" />
        ) : (
          <>
            <div className="px-4 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">Status</div>
              <div className="mt-1">
                <RiskChip level={s.risk_level} />
              </div>
            </div>
            <Tile label="Phase" value={s.phase} />
            <Tile label="Near-wellbore temp" value={s.temperature_c.toFixed(0)} unit="°C" />
            <Tile label="Oil in tubing" value={s.tubing_viscosity_cp.toFixed(0)} unit="cP" />
            <Tile label="Oil rate" value={s.oil_rate_bpd !== null ? s.oil_rate_bpd.toFixed(1) : "—"} unit="bbl/d" />
            <Tile label="Pump" value={`${s.spm.toFixed(1)} × ${s.stroke_m.toFixed(1)}`} unit="SPM × m" />
            <Tile label="Pump fill" value={s.fillage !== null ? `${Math.round(s.fillage * 100)}` : "—"} unit="%" />
            <Tile label="Float probability" value={`${Math.round(s.float_probability * 100)}`} unit="%" />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* alarms */}
        <Card className="lg:col-span-2">
          <h3 className="text-sm font-semibold">Alarms and forecast</h3>
          <p className="mt-0.5 text-xs text-muted">If the pump stays on today&apos;s fixed settings.</p>
          {tl.loading && !tl.data ? (
            <Skeleton className="mt-3 h-24 w-full" />
          ) : events.length === 0 ? (
            <p className="mt-3 text-xs text-muted">No alarms expected.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {events.map((e, i) => {
                const d = e.day - NOW;
                return (
                  <li key={`${e.day}-${e.type}-${i}`} className="flex items-start gap-3 py-2.5">
                    <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dot(e.type)}`} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold capitalize">{e.type.replace(/_/g, " ")}</div>
                      <div className="text-xs text-muted">{e.message}</div>
                    </div>
                    <div className="shrink-0 text-right text-xs tabular-nums">
                      <div className="font-semibold">day {e.day}</div>
                      <div className="text-muted">{d > 0 ? `in ${d} d` : d === 0 ? "today" : `${-d} d ago`}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* dynamometer card */}
        <div className="lg:col-span-3">
          <ChartCard
            title="Surface dynamometer card (simulated)"
            caption="The load on the polished rod over one pump stroke. A card that dips toward zero on the way down means the rods are close to floating."
            height={300}
            figure={s ? cardFigure(s) : null}
            loading={!s}
          />
        </div>
      </div>
    </section>
  );
}
