"use client";

import { useMemo, useState } from "react";
import ChartCard from "@/components/ChartCard";
import EventsList from "@/components/EventsList";
import { Card, ErrorCard, KpiCard, RiskChip } from "@/components/ui";
import { fetchCredibility, fetchState, fetchTimeline } from "@/lib/api";
import {
  riskDriversFigure,
  riskFillageFigure,
  riskProbabilityFigure,
} from "@/lib/screen-figures";
import { useAsync } from "@/lib/useAsync";

function num(o: Record<string, unknown> | undefined, k: string): number | null {
  const v = o?.[k];
  return typeof v === "number" ? v : null;
}

function pctOf(v: number | null): string {
  return v === null ? "—" : `${(v * 100).toFixed(0)}%`;
}

export default function RiskPage() {
  const [cycle, setCycle] = useState(4);
  const [pickedDay, setPickedDay] = useState<number | null>(null);

  const tl = useAsync(() => fetchTimeline(cycle), [cycle]);
  const t = tl.data;
  const lastDay = t ? t.days[t.days.length - 1] : 220;
  const day = pickedDay ?? t?.alert_day ?? 110;

  const st = useAsync(() => fetchState(cycle, day), [cycle, day]);
  const cred = useAsync(() => fetchCredibility(), []);

  const probFig = useMemo(() => (t ? riskProbabilityFigure(t) : null), [t]);
  const driverFig = useMemo(() => (t ? riskDriversFigure(t) : null), [t]);
  const fillFig = useMemo(() => (t ? riskFillageFigure(t) : null), [t]);

  const firstBreach = useMemo(() => {
    if (!t) return null;
    const days = t.events
      .filter((e) => e.type === "fluid_pound" || e.type === "load_limit" || e.type === "rod_float")
      .map((e) => e.day);
    return days.length ? Math.min(...days) : null;
  }, [t]);

  const lead =
    t && t.alert_day !== null && t.float_event_day !== null
      ? t.float_event_day - t.alert_day
      : null;
  const det = cred.data?.metrics?.float_detector;
  const leadMean = num(det, "mean_lead_time_days");

  return (
    <div className="space-y-4">
      <div className="page-heading"><div><p className="eyebrow">Risk intelligence / Well A</p><h1>Anticipate the limit<span className="heading-dot">.</span></h1><p>Understand when risk rises, what drives it and where intervention matters.</p></div></div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs text-muted">
          Cycle
          <select
            value={cycle}
            onChange={(e) => {
              setCycle(Number(e.target.value));
              setPickedDay(null);
            }}
            className="rounded-md border border-line bg-white px-2 py-1 text-xs text-ink"
          >
            {[1, 2, 3, 4].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <span className="text-xs text-muted">
          Fixed pump settings (6 SPM x 2.7 m). Early warning of rod float and fluid pound.
        </span>
      </div>

      {tl.error && <ErrorCard message={tl.error} onRetry={tl.reload} retrying={tl.loading} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Float alert (10%)"
          value={t ? (t.alert_day !== null ? `day ${t.alert_day}` : "none") : "…"}
        />
        <KpiCard
          label="Float event"
          value={t ? (t.float_event_day !== null ? `day ${t.float_event_day}` : "none") : "…"}
        />
        <KpiCard
          label="Warning lead time"
          value={t ? (lead !== null ? `${lead}` : "—") : "…"}
          unit={lead !== null ? "days" : undefined}
          footer={<span className="text-[11px] text-muted">alert to float</span>}
        />
        <KpiCard
          label="First limit breach"
          value={t ? (firstBreach !== null ? `day ${firstBreach}` : "none") : "…"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Failure probabilities"
          caption="Blue: chance the rods stop falling freely (float). Amber: chance the pump slams into fluid (fluid pound). Dashed vertical lines mark the alert (amber) and the float event (red)."
          figure={probFig}
          loading={tl.loading || !probFig}
        />
        <ChartCard
          title="Why it rises: rod margin vs oil thickness"
          caption="As the near-wellbore heat fades, oil in the tubing gets thicker (grey, right axis). Drag on the downstroke then pulls the minimum rod load (blue) toward zero, which is a float."
          figure={driverFig}
          loading={tl.loading || !driverFig}
        />
        <ChartCard
          title="Pump fillage"
          caption="How full the pump barrel is each stroke. Below 45% the pump hits fluid on the downstroke."
          figure={fillFig}
          loading={tl.loading || !fillFig}
        />

        <Card>
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-sm font-semibold">What the twin says on day {day}</h3>
            {st.data && <RiskChip level={st.data.risk_level} />}
          </div>
          <input
            type="range"
            min={0}
            max={lastDay}
            value={day}
            onChange={(e) => setPickedDay(Number(e.target.value))}
            className="mt-3 w-full accent-accent"
            aria-label="Day"
          />
          {st.error ? (
            <p className="mt-2 text-xs text-red-700">{st.error}</p>
          ) : st.data ? (
            <>
              <p className="mt-2 text-xs leading-relaxed text-ink">{st.data.risk_reason}</p>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <dt className="text-muted">Float probability</dt>
                  <dd className="font-semibold tabular-nums">
                    {(st.data.float_probability * 100).toFixed(0)}%
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Fillage</dt>
                  <dd className="font-semibold tabular-nums">
                    {st.data.fillage === null ? "—" : `${(st.data.fillage * 100).toFixed(0)}%`}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Oil in tubing</dt>
                  <dd className="font-semibold tabular-nums">
                    {st.data.tubing_viscosity_cp.toFixed(0)} cP
                  </dd>
                </div>
              </dl>
            </>
          ) : (
            <p className="mt-2 text-xs text-muted">Loading…</p>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <EventsList events={t?.events ?? []} onJump={(d) => setPickedDay(d)} />

        <Card>
          <h3 className="text-sm font-semibold">Warning track record (synthetic)</h3>
          {det ? (
            <>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                <div>
                  <dt className="text-muted">Precision</dt>
                  <dd className="text-base font-semibold tabular-nums">{pctOf(num(det, "precision"))}</dd>
                </div>
                <div>
                  <dt className="text-muted">Recall</dt>
                  <dd className="text-base font-semibold tabular-nums">{pctOf(num(det, "recall"))}</dd>
                </div>
                <div>
                  <dt className="text-muted">Mean lead time</dt>
                  <dd className="text-base font-semibold tabular-nums">
                    {leadMean === null ? "—" : `${leadMean.toFixed(1)} d`}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">False alarms</dt>
                  <dd className="text-base font-semibold tabular-nums">
                    {num(det, "false_alarm") ?? "—"} of {num(det, "scenarios") ?? "—"}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 text-[11px] leading-snug text-muted">
                {typeof det.note === "string" ? det.note : ""} Scored on synthetic
                data: this shows the method is consistent, not that it is accurate
                on Baghewala.
              </p>
            </>
          ) : (
            <p className="mt-2 text-xs text-muted">
              {cred.error ?? "Loading detector metrics…"}
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
