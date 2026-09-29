"use client";

import { useMemo, useState } from "react";
import ChartCard from "@/components/ChartCard";
import { HeadlineCard } from "@/components/Delta";
import { PumpScheduleTable } from "@/components/OptimizerTables";
import { Card, ErrorCard, KpiCard, Skeleton } from "@/components/ui";
import { fetchReplay, type OptimizePlan } from "@/lib/api";
import {
  fillageOverlay,
  floatOverlay,
  peakLoadOverlay,
  spmOverlay,
} from "@/lib/optimizer-figures";
import { replayPredictionFigure } from "@/lib/screen-figures";
import { useAsync } from "@/lib/useAsync";

function pct(v: number, digits = 0): string {
  return `${(v * 100).toFixed(digits)}%`;
}

function PlantCard({ title, plan }: { title: string; plan: OptimizePlan }) {
  const ok = plan.feasible && plan.violations.length === 0;
  return (
    <div
      className={`rounded-lg border p-3 ${
        ok ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"
      }`}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
        {title}
      </div>
      <div
        className={`mt-1 text-sm font-semibold ${ok ? "text-emerald-800" : "text-red-800"}`}
      >
        {ok
          ? "All hard limits respected"
          : `${plan.violations.length} hard limit${plan.violations.length === 1 ? "" : "s"} breached`}
      </div>
      {!ok && (
        <div className="mt-0.5 text-xs text-red-700">
          {plan.violations.map((v) => v.replace(/_/g, " ")).join(", ")}
        </div>
      )}
      <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-muted">Max float prob.</dt>
          <dd className="font-semibold tabular-nums">{pct(plan.max_float_probability)}</dd>
        </div>
        <div>
          <dt className="text-muted">Min fillage</dt>
          <dd className="font-semibold tabular-nums">{pct(plan.min_fillage)}</dd>
        </div>
        <div>
          <dt className="text-muted">Peak load</dt>
          <dd className="font-semibold tabular-nums">
            {plan.max_peak_load_kn.toFixed(0)} kN
          </dd>
        </div>
      </dl>
    </div>
  );
}

export default function ReplayPage() {
  const [cycle, setCycle] = useState(4);
  const { data, error, loading, reload } = useAsync(() => fetchReplay(cycle), [cycle]);

  const predFig = useMemo(() => (data ? replayPredictionFigure(data) : null), [data]);
  const spmFig = useMemo(() => (data ? spmOverlay(data.baseline, data.recommended) : null), [data]);
  const floatFig = useMemo(() => (data ? floatOverlay(data.baseline, data.recommended) : null), [data]);
  const fillFig = useMemo(() => (data ? fillageOverlay(data.baseline, data.recommended) : null), [data]);
  const loadFig = useMemo(() => (data ? peakLoadOverlay(data.baseline, data.recommended) : null), [data]);

  const d = data?.headline_deltas;

  return (
    <div className="space-y-4">
      <div className="page-heading"><div><p className="eyebrow">Validation workspace / Cycle replay</p><h1>Prediction meets evidence<span className="heading-dot">.</span></h1><p>Replay a cycle against synthetic observations and inspect the alternative plan.</p></div></div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs text-muted">
          Cycle
          <select
            value={cycle}
            onChange={(e) => setCycle(Number(e.target.value))}
            className="rounded-md border border-line bg-white px-2 py-1 text-xs text-ink"
          >
            {[1, 2, 3, 4].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        {data && (
          <span
            className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
              data.held_out
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-line bg-page text-muted"
            }`}
          >
            {data.held_out
              ? "Held out: not used for calibration"
              : "Used for calibration"}
          </span>
        )}
        <span className="ml-auto text-[11px] text-muted">
          {data ? data.label : "SIMULATED: synthetic history"}
        </span>
      </div>

      {error && <ErrorCard message={error} onRetry={reload} retrying={loading} />}

      {/* Prediction accuracy */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard label="MAE" value={data ? data.mae.toFixed(2) : "…"} unit="bbl/d" />
        <KpiCard label="RMSE" value={data ? data.rmse.toFixed(2) : "…"} unit="bbl/d" />
        <KpiCard label="MAPE" value={data ? data.mape_pct.toFixed(1) : "…"} unit="%" />
        <KpiCard
          label="90% band coverage"
          value={data ? pct(data.interval_coverage) : "…"}
          footer={<span className="text-[11px] text-muted">target 90%</span>}
        />
        <KpiCard
          label="Calibration effect"
          value={data ? `${data.mae_uncalibrated_bpd.toFixed(1)} → ${data.mae.toFixed(1)}` : "…"}
          unit="bbl/d MAE"
          footer={<span className="text-[11px] text-muted">uncalibrated → calibrated</span>}
        />
      </div>

      <ChartCard
        title="Twin prediction vs synthetic actual"
        caption="Blue line and band: what the calibrated twin predicted for this cycle (90% band). Grey dots: the synthetic sensor record, which the twin never saw for a held-out cycle."
        figure={predFig}
        loading={loading || !predFig}
        height={300}
      />

      {/* Baseline vs recommended */}
      <div>
        <h2 className="text-sm font-semibold">Fixed settings vs twin-recommended schedule</h2>
        <p className="mt-0.5 text-xs text-muted">
          Grey: the cycle as it was operated (fixed pump settings). Blue: the pump
          schedule the twin would have recommended for the same steam job.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Pump speed (SPM)"
          caption="The recommendation slows the pump as the oil thickens."
          figure={spmFig}
          loading={loading || !spmFig}
        />
        <ChartCard
          title="Rod-float probability"
          caption="Grey crosses the 20% limit; blue stays below the 10% alert."
          figure={floatFig}
          loading={loading || !floatFig}
        />
        <ChartCard
          title="Pump fillage"
          caption="Grey drops under the 45% minimum (fluid pound); blue keeps the pump filling."
          figure={fillFig}
          loading={loading || !fillFig}
        />
        <ChartCard
          title="Peak rod load"
          caption="Grey passes the 60 kN limit; blue stays inside it."
          figure={loadFig}
          loading={loading || !loadFig}
        />
      </div>

      {/* Headline deltas (plant proxy) */}
      <div>
        <h2 className="text-sm font-semibold">Headline result on a plant the twin does not know exactly</h2>
        <p className="mt-0.5 text-xs text-muted">
          {data
            ? data.plant_proxy_check.description
            : "The recommendation is scored on a different synthetic plant, so the optimizer is not grading itself."}
        </p>
      </div>

      {loading || !d ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <HeadlineCard title="Oil" unit="bbl" digits={0} direction="higher"
            baseline={d.oil_bbl.baseline} recommended={d.oil_bbl.recommended} deltaPct={d.oil_bbl.delta_pct} />
          <HeadlineCard title="SOR" unit="steam/oil" digits={2} direction="lower"
            baseline={d.sor.baseline} recommended={d.sor.recommended} deltaPct={d.sor.delta_pct} />
          <HeadlineCard title="Energy" unit="kWh/bbl" digits={0} direction="lower"
            baseline={d.energy_kwh_per_bbl.baseline} recommended={d.energy_kwh_per_bbl.recommended} deltaPct={d.energy_kwh_per_bbl.delta_pct} />
          <HeadlineCard title="Failure risk" unit="failures/cycle" digits={2} direction="lower"
            baseline={d.risk.baseline} recommended={d.risk.recommended} deltaPct={d.risk.delta_pct} />
          <HeadlineCard title="Value / cycle-day" unit="USD/d" digits={0} direction="higher"
            baseline={d.value_per_cycle_day.baseline} recommended={d.value_per_cycle_day.recommended} deltaPct={d.value_per_cycle_day.delta_pct} />
        </div>
      )}

      {data && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <PlantCard title="Fixed settings (as operated)" plan={data.plant_proxy_check.baseline} />
          <PlantCard title="Twin-recommended schedule" plan={data.plant_proxy_check.recommended} />
        </div>
      )}

      {data && (
        <Card>
          <PumpScheduleTable schedule={data.recommended_schedule} />
        </Card>
      )}
    </div>
  );
}
