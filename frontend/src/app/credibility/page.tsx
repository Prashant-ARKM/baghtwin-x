"use client";

import { useMemo, useState } from "react";
import { Card, ErrorCard, Skeleton } from "@/components/ui";
import { fetchCredibility, type CredibilityResponse } from "@/lib/api";
import { useAsync } from "@/lib/useAsync";

type Obj = Record<string, unknown>;

const TH = "px-2.5 py-1.5 text-left font-medium text-muted";
const TD = "px-2.5 py-1.5 tabular-nums";

function n(o: Obj | undefined, k: string): number | null {
  const v = o?.[k];
  return typeof v === "number" ? v : null;
}
function s(o: Obj | undefined, k: string): string {
  const v = o?.[k];
  return typeof v === "string" ? v : "";
}
function obj(o: Obj | undefined, k: string): Obj | undefined {
  const v = o?.[k];
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : undefined;
}
function f(v: number | null, digits = 1, suffix = ""): string {
  return v === null ? "—" : `${v.toFixed(digits)}${suffix}`;
}
function pct(v: number | null, digits = 0): string {
  return v === null ? "—" : `${(v * 100).toFixed(digits)}%`;
}
function label(k: string): string {
  return k.replace(/_/g, " ");
}

function Stat({ name, value, hint }: { name: string; value: string; hint?: string }) {
  return (
    <div>
      <dt className="text-[11px] text-muted">{name}</dt>
      <dd className="text-base font-semibold tabular-nums">{value}</dd>
      {hint && <div className="text-[10px] text-muted">{hint}</div>}
    </div>
  );
}

function MetricCard({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-3">{children}</div>
      {note && <p className="mt-3 text-[11px] leading-snug text-muted">{note}</p>}
    </Card>
  );
}

const STATUS_STYLE = (status: string): string => {
  if (status.startsWith("Modelled")) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status.startsWith("Assumed")) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-line bg-page text-muted";
};

const TAG_STYLE: Record<string, string> = {
  Known: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Estimated: "border-blue-200 bg-blue-50 text-blue-700",
  Assumed: "border-amber-200 bg-amber-50 text-amber-700",
};

function Content({ c }: { c: CredibilityResponse }) {
  const m = c.metrics;
  const pe = m.prediction_error_held_out;
  const cal = m.calibration;
  const te = m.temperature_estimation;
  const fd = m.float_detector;
  const cr = m.card_rules;
  const ct = m.constraint_violation_test;

  const [tag, setTag] = useState<string>("All");
  const [query, setQuery] = useState("");
  const params = useMemo(
    () =>
      c.parameters.filter(
        (p) =>
          (tag === "All" || p.tag === tag) &&
          (query.trim() === "" ||
            p.name.toLowerCase().includes(query.toLowerCase()) ||
            p.note.toLowerCase().includes(query.toLowerCase()))
      ),
    [c.parameters, tag, query]
  );

  const scales = obj(cal, "scales");
  const sds = obj(cal, "sd");
  const rec = obj(cal, "recovered_vs_synthetic_truth");
  const confusion = obj(cr, "confusion_truth_by_predicted");
  const flagCounts = obj(te, "flag_counts");
  const bounds = Object.entries(c.validity_bounds).filter(
    ([, v]) => v && typeof v === "object"
  ) as [string, Obj][];
  const passed = s(ct, "status") === "passed";
  const cols = ["normal", "fluid_pound", "float_and_pound"];

  return (
    <>
      {/* constraint banner */}
      <div
        className={`flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 ${
          passed ? "border-emerald-200 bg-emerald-50" : "border-line bg-white"
        }`}
      >
        <span
          className={`inline-block h-2.5 w-2.5 rounded-full ${passed ? "bg-emerald-500" : "bg-slate-400"}`}
        />
        <div>
          <div className={`text-sm font-semibold ${passed ? "text-emerald-800" : "text-ink"}`}>
            {passed
              ? `Constraint test passed: ${n(ct, "violations_found") ?? 0} violations in ${n(ct, "plans_rechecked_with_full_twin") ?? "?"} plans re-checked`
              : "Constraint test pending: run the backend tests to generate it"}
          </div>
          {passed && (
            <div className="text-xs text-emerald-700">
              {n(ct, "scenarios_run")} scenarios (both modes, several cycles, weight sets and decision days). Every
              recommended and Pareto plan was re-simulated with the full twin against the margin-free limits.
            </div>
          )}
        </div>
      </div>

      {/* metrics grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <MetricCard title="Prediction error on the held-out cycle" note={s(pe, "note")}>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat name="MAE" value={f(n(pe, "mae_bpd"), 2, " bbl/d")} />
            <Stat name="RMSE" value={f(n(pe, "rmse_bpd"), 2, " bbl/d")} />
            <Stat name="MAPE" value={f(n(pe, "mape_pct"), 1, "%")} />
            <Stat name="90% band coverage" value={pct(n(pe, "interval_coverage_90"))} hint="target 90%" />
            <Stat name="Before calibration" value={f(n(pe, "mae_uncalibrated_bpd"), 2, " bbl/d")} hint="MAE" />
            <Stat name="Points scored" value={f(n(pe, "n_points"), 0)} />
          </dl>
        </MetricCard>

        <MetricCard title="Calibration (fitted on cycles 1-3)" note={s(cal, "note")}>
          <div className="overflow-x-auto rounded-md border border-line">
            <table className="w-full text-xs">
              <thead className="bg-page">
                <tr>
                  <th className={TH}>Parameter</th>
                  <th className={TH}>Fitted scale</th>
                  <th className={TH}>Uncertainty</th>
                  <th className={TH}>Error vs synthetic truth</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line bg-white">
                {scales &&
                  Object.keys(scales).map((k) => (
                    <tr key={k}>
                      <td className="px-2.5 py-1.5">{label(k)}</td>
                      <td className={TD}>x{f(n(scales, k), 3)}</td>
                      <td className={TD}>± {f(n(sds, k), 3)}</td>
                      <td className={TD}>{f(n(obj(rec, k), "error_pct"), 1, "%")}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-muted">
            Reduced chi-square {f(n(cal, "reduced_chi2"), 2)} (near 1 means the misfit matches the noise).
          </p>
        </MetricCard>

        <MetricCard
          title="Temperature estimation with bad sensor data"
          note="Kalman filter on the temperature record, scored against the synthetic truth. Stuck, dropped and spiked samples are flagged and skipped."
        >
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat name="Raw sensor error" value={f(n(te, "rmse_raw_sensor_c"), 2, " °C")} hint="RMSE" />
            <Stat name="After Kalman filter" value={f(n(te, "rmse_kalman_c"), 2, " °C")} hint="RMSE" />
            <Stat name="Flagged samples" value={f(n(te, "flagged_samples"), 0)} />
          </dl>
          {flagCounts && (
            <p className="mt-3 text-xs text-muted">
              {Object.entries(flagCounts)
                .map(([k, v]) => `${label(k)}: ${String(v)}`)
                .join(" · ")}
            </p>
          )}
        </MetricCard>

        <MetricCard title="Rod-float early warning" note={s(fd, "note")}>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat name="Precision" value={pct(n(fd, "precision"))} />
            <Stat name="Recall" value={pct(n(fd, "recall"))} />
            <Stat name="Mean lead time" value={f(n(fd, "mean_lead_time_days"), 1, " d")} hint={`min ${f(n(fd, "min_lead_time_days"), 0, " d")}`} />
            <Stat name="Caught" value={`${n(fd, "true_positive") ?? "—"} of ${n(fd, "scenarios") ?? "—"}`} />
            <Stat name="False alarms" value={f(n(fd, "false_alarm"), 0)} />
            <Stat name="Missed" value={f(n(fd, "false_negative"), 0)} />
          </dl>
        </MetricCard>

        <MetricCard title="Dynamometer card rules" note={s(cr, "note")}>
          <dl className="grid grid-cols-2 gap-3">
            <Stat name="Accuracy" value={pct(n(cr, "accuracy"), 1)} />
            <Stat name="Cards scored" value={f(n(cr, "n_cards"), 0)} />
          </dl>
          {confusion && (
            <div className="mt-3 overflow-x-auto rounded-md border border-line">
              <table className="w-full text-xs">
                <thead className="bg-page">
                  <tr>
                    <th className={TH}>True class</th>
                    {cols.map((cName) => (
                      <th key={cName} className={TH}>predicted {label(cName)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line bg-white">
                  {cols.map((truth) => (
                    <tr key={truth}>
                      <td className="px-2.5 py-1.5 font-medium">{label(truth)}</td>
                      {cols.map((pred) => (
                        <td key={pred} className={`${TD} ${truth === pred ? "font-semibold" : "text-muted"}`}>
                          {n(obj(confusion, truth), pred) ?? 0}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </MetricCard>
      </div>

      {/* modelled vs assumed */}
      <Card>
        <h3 className="text-sm font-semibold">What is modelled and what is assumed</h3>
        <div className="mt-3 overflow-x-auto rounded-md border border-line">
          <table className="w-full text-xs">
            <thead className="bg-page">
              <tr>
                <th className={TH}>Component</th>
                <th className={TH}>Method</th>
                <th className={TH}>Status</th>
                <th className={TH}>Limitation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line bg-white align-top">
              {c.modelled_vs_assumed.map((r) => (
                <tr key={r.component}>
                  <td className="px-2.5 py-1.5 font-medium">{r.component}</td>
                  <td className="px-2.5 py-1.5">{r.method}</td>
                  <td className="px-2.5 py-1.5">
                    <span className={`inline-block whitespace-nowrap rounded-full border px-2 py-px text-[10px] font-semibold ${STATUS_STYLE(r.status)}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-2.5 py-1.5 text-muted">{r.limitation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* parameters */}
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="mr-auto text-sm font-semibold">Parameters ({params.length})</h3>
          {["All", "Known", "Estimated", "Assumed"].map((tg) => (
            <button
              key={tg}
              onClick={() => setTag(tg)}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                tag === tg ? "border-accent bg-accent/10 text-accent" : "border-line bg-white text-muted hover:bg-page"
              }`}
            >
              {tg}
            </button>
          ))}
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search parameters…"
            className="w-48 rounded-md border border-line bg-white px-2.5 py-1 text-xs"
          />
        </div>
        <div className="mt-3 max-h-96 overflow-auto rounded-md border border-line">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-page">
              <tr>
                <th className={TH}>Name</th>
                <th className={TH}>Value</th>
                <th className={TH}>Unit</th>
                <th className={TH}>Tag</th>
                <th className={TH}>Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line bg-white align-top">
              {params.map((p) => (
                <tr key={p.name}>
                  <td className="px-2.5 py-1.5 font-medium">{p.name}</td>
                  <td className={TD}>
                    {Number.isInteger(p.value) ? p.value : p.value.toPrecision(4)}
                    {p.fitted_scale !== undefined && (
                      <span className="ml-1 text-[10px] text-accent">fitted x{p.fitted_scale.toFixed(3)}</span>
                    )}
                  </td>
                  <td className="px-2.5 py-1.5 text-muted">{p.unit}</td>
                  <td className="px-2.5 py-1.5">
                    <span className={`inline-block rounded-full border px-2 py-px text-[10px] font-semibold ${TAG_STYLE[p.tag] ?? ""}`}>
                      {p.tag}
                    </span>
                  </td>
                  <td className="px-2.5 py-1.5 text-muted">{p.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* validity bounds */}
      <Card>
        <h3 className="text-sm font-semibold">Validity bounds</h3>
        <div className="mt-3 overflow-x-auto rounded-md border border-line">
          <table className="w-full text-xs">
            <thead className="bg-page">
              <tr>
                <th className={TH}>Variable</th>
                <th className={TH}>Min</th>
                <th className={TH}>Max</th>
                <th className={TH}>Unit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line bg-white">
              {bounds.map(([k, v]) => (
                <tr key={k}>
                  <td className="px-2.5 py-1.5">{label(k)}</td>
                  <td className={TD}>{String(v.min ?? "—")}</td>
                  <td className={TD}>{String(v.max ?? "—")}</td>
                  <td className="px-2.5 py-1.5 text-muted">{String(v.unit ?? "")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-muted">{s(c.validity_bounds, "note")}</p>
      </Card>

      {c.caveats && c.caveats.length > 0 && (
        <Card>
          <h3 className="text-sm font-semibold">Caveats</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-ink">
            {c.caveats.map((cv) => (
              <li key={cv}>{cv}</li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

export default function CredibilityPage() {
  const { data, error, loading, reload } = useAsync(() => fetchCredibility(), []);
  return (
    <div className="space-y-4">
      <div className="page-heading"><div><p className="eyebrow">Model assurance / Evidence</p><h1>Confidence, with context<span className="heading-dot">.</span></h1><p>What the twin models, what it assumes and how well it performs.</p></div></div>
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
        All metrics below are computed on <b>synthetic</b> data. They show that the method is consistent, not that it is accurate on Baghewala.
      </div>
      {error && <ErrorCard message={error} onRetry={reload} retrying={loading} />}
      {loading && !data && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      )}
      {data && <Content c={data} />}
    </div>
  );
}
