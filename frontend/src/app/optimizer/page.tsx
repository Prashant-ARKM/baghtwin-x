"use client";

import { useCallback, useMemo, useState } from "react";
import ChartCard from "@/components/ChartCard";
import OptimizerControls from "@/components/OptimizerControls";
import { CssChangesTable, PumpScheduleTable } from "@/components/OptimizerTables";
import OptimizerConstraints from "@/components/OptimizerConstraints";
import OptimizerReceipt from "@/components/OptimizerReceipt";
import { Card, ErrorCard } from "@/components/ui";
import {
  approveRecommendation,
  postOptimize,
  type ApprovalResponse,
  type OptimizeMode,
  type OptimizeResponse,
  type OptimizeWeights,
} from "@/lib/api";
import {
  fillageOverlay,
  floatOverlay,
  paretoFigure,
  peakLoadOverlay,
  spmOverlay,
} from "@/lib/optimizer-figures";

const DEFAULT_WEIGHTS: OptimizeWeights = {
  oil: 1,
  sor: 1,
  energy: 1,
  failure: 1,
  risk: 1,
};

type Direction = "lower" | "higher";

function fmtSigned(value: number, digits = 1): string {
  return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(digits)}`;
}

/** Delta chip: green when the recommended plan moved the metric the good way. */
function DeltaChip({
  deltaPct,
  direction,
}: {
  deltaPct: number;
  direction: Direction;
}) {
  const better = direction === "lower" ? deltaPct < 0 : deltaPct > 0;
  const cls = better
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-red-200 bg-red-50 text-red-700";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-px text-[11px] font-semibold tabular-nums ${cls}`}
    >
      {fmtSigned(deltaPct)}%
    </span>
  );
}

function HeadlineCard({
  title,
  unit,
  baseline,
  recommended,
  deltaPct,
  direction,
  digits = 1,
}: {
  title: string;
  unit: string;
  baseline: number;
  recommended: number;
  deltaPct: number;
  direction: Direction;
  digits?: number;
}) {
  return (
    <Card className="!p-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted">
        {title}
      </div>
      <div className="mt-0.5 flex items-baseline gap-1.5 text-lg font-semibold tabular-nums">
        <span className="text-muted">{baseline.toFixed(digits)}</span>
        <span className="text-xs text-muted">→</span>
        <span>{recommended.toFixed(digits)}</span>
        <span className="text-xs font-normal text-muted">{unit}</span>
      </div>
      <div className="mt-1.5">
        <DeltaChip deltaPct={deltaPct} direction={direction} />
      </div>
    </Card>
  );
}

export default function OptimizerPage() {
  const [mode, setMode] = useState<OptimizeMode>("srp_only");
  const [weights, setWeights] = useState<OptimizeWeights>(DEFAULT_WEIGHTS);
  const [currentDay, setCurrentDay] = useState(100);

  const [result, setResult] = useState<OptimizeResponse | null>(null);
  const [solving, setSolving] = useState(false);
  const [solveError, setSolveError] = useState<string | null>(null);

  const [reason, setReason] = useState("");
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [decisionResult, setDecisionResult] = useState<ApprovalResponse | null>(null);

  const runOptimize = useCallback(async () => {
    setSolving(true);
    setSolveError(null);
    try {
      const data = await postOptimize({
        cycle: 4,
        mode,
        weights,
        current_day: currentDay,
      });
      setResult(data);
      setDecisionResult(null);
      setDecisionError(null);
    } catch (err) {
      setSolveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSolving(false);
    }
  }, [mode, weights, currentDay]);

  const decide = useCallback(
    async (decision: "approve" | "reject") => {
      if (!result) return;
      setDecisionBusy(true);
      setDecisionError(null);
      try {
        const resp = await approveRecommendation({
          receipt: result.receipt,
          decision,
          reason: reason.trim(),
        });
        setDecisionResult(resp);
      } catch (err) {
        setDecisionError(err instanceof Error ? err.message : String(err));
      } finally {
        setDecisionBusy(false);
      }
    },
    [result, reason]
  );

  // Charts ------------------------------------------------------------------
  const spmFig = useMemo(
    () =>
      result
        ? spmOverlay(result.trajectories.no_action, result.trajectories.with_action)
        : null,
    [result]
  );
  const floatFig = useMemo(
    () =>
      result
        ? floatOverlay(result.trajectories.no_action, result.trajectories.with_action)
        : null,
    [result]
  );
  const fillFig = useMemo(
    () =>
      result
        ? fillageOverlay(result.trajectories.no_action, result.trajectories.with_action)
        : null,
    [result]
  );
  const loadFig = useMemo(
    () =>
      result
        ? peakLoadOverlay(result.trajectories.no_action, result.trajectories.with_action)
        : null,
    [result]
  );
  const paretoFig = useMemo(
    () => (result ? paretoFigure(result.pareto, result.baseline) : null),
    [result]
  );

  const headline = result?.headline;
  const breaches = result?.baseline.violations.length ?? 0;
  const recFeasible = result ? result.recommended.feasible && result.recommended.violations.length === 0 : false;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Optimizer</h1>
        <span className="text-xs text-muted">
          The twin searches bounded plans, re-simulates every candidate and only
          returns ones that respect the hard limits.
        </span>
        {result && (
          <span className="ml-auto text-[11px] text-muted">
            model {result.model_version} · SIMULATION
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        {/* Left: controls */}
        <div className="xl:col-span-3">
          <OptimizerControls
            mode={mode}
            weights={weights}
            currentDay={currentDay}
            solving={solving}
            onModeChange={setMode}
            onWeightChange={(key, v) => setWeights((w) => ({ ...w, [key]: v }))}
            onDayChange={setCurrentDay}
            onRecommend={() => void runOptimize()}
          />
        </div>

        {/* Right: results */}
        <div className="space-y-4 xl:col-span-9">
          {solveError && (
            <ErrorCard
              message={solveError}
              onRetry={() => void runOptimize()}
              retrying={solving}
            />
          )}

          {!result && !solving && !solveError && (
            <Card>
              <p className="text-sm text-muted">
                Set the weights and press{" "}
                <b>Recommend</b> — the twin simulates the cycle under candidate
                pump (and steam) plans and returns only feasible ones, with a
                full engineering receipt.
              </p>
            </Card>
          )}

          {solving && (
            <Card>
              <div className="flex items-center gap-3">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
                <span className="text-sm text-muted">
                  Solving with the twin…
                  {mode === "joint"
                    ? " (steam + pump search, this can take ~10 s)"
                    : ""}
                </span>
              </div>
            </Card>
          )}

          {result && !solving && (
            <>
              {/* Status line */}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="flex items-center gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
                  <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" />
                  <span className="text-sm font-semibold text-red-800">
                    No action: {breaches} hard {breaches === 1 ? "limit" : "limits"}{" "}
                    breached
                  </span>
                  <span className="ml-auto text-[11px] tabular-nums text-red-700">
                    {result.baseline.violations.map((v) => v.replace(/_/g, " ")).join(", ")}
                  </span>
                </div>
                <div
                  className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 ${
                    recFeasible
                      ? "border-emerald-200 bg-emerald-50"
                      : "border-red-200 bg-red-50"
                  }`}
                >
                  <span
                    className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${
                      recFeasible ? "bg-emerald-500" : "bg-red-500"
                    }`}
                  />
                  <span
                    className={`text-sm font-semibold ${
                      recFeasible ? "text-emerald-800" : "text-red-800"
                    }`}
                  >
                    {recFeasible
                      ? "Recommended plan: all hard limits respected"
                      : "Recommended plan: limit breached — see violations"}
                  </span>
                </div>
              </div>

              {/* Headline cards */}
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                <HeadlineCard
                  title="Oil"
                  unit="bbl"
                  baseline={headline!.oil_bbl.baseline}
                  recommended={headline!.oil_bbl.recommended}
                  deltaPct={headline!.oil_bbl.delta_pct}
                  direction="higher"
                  digits={0}
                />
                <HeadlineCard
                  title="SOR"
                  unit="steam/oil"
                  baseline={headline!.sor.baseline}
                  recommended={headline!.sor.recommended}
                  deltaPct={headline!.sor.delta_pct}
                  direction="lower"
                  digits={2}
                />
                <HeadlineCard
                  title="Energy"
                  unit="kWh/bbl"
                  baseline={headline!.energy_kwh_per_bbl.baseline}
                  recommended={headline!.energy_kwh_per_bbl.recommended}
                  deltaPct={headline!.energy_kwh_per_bbl.delta_pct}
                  direction="lower"
                  digits={0}
                />
                <HeadlineCard
                  title="Failure risk"
                  unit="prob."
                  baseline={headline!.risk.baseline}
                  recommended={headline!.risk.recommended}
                  deltaPct={headline!.risk.delta_pct}
                  direction="lower"
                  digits={2}
                />
                <HeadlineCard
                  title="Value / cycle-day"
                  unit="USD/d"
                  baseline={headline!.value_per_cycle_day.baseline}
                  recommended={headline!.value_per_cycle_day.recommended}
                  deltaPct={headline!.value_per_cycle_day.delta_pct}
                  direction="higher"
                  digits={0}
                />
              </div>

              {/* Overlay charts */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <ChartCard
                  title="Pump speed (SPM)"
                  caption="The recommended schedule slows the pump late in the cycle as the oil thickens; the fixed schedule keeps running fast into the limit."
                  figure={spmFig}
                  loading={!spmFig}
                />
                <ChartCard
                  title="Rod-float probability"
                  caption="Probability the rods stop falling freely. Grey crosses the 20% limit; blue stays under the 10% alert."
                  figure={floatFig}
                  loading={!floatFig}
                />
                <ChartCard
                  title="Pump fillage"
                  caption="How full the pump barrel fills each stroke. Grey falls below the 45% minimum; blue keeps filling the pump."
                  figure={fillFig}
                  loading={!fillFig}
                />
                <ChartCard
                  title="Peak rod load"
                  caption="Worst structural load on the rod string. Grey exceeds the 60 kN limit; blue stays inside it."
                  figure={loadFig}
                  loading={!loadFig}
                />
              </div>

              {/* Tables row */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card>
                  <PumpScheduleTable schedule={result.recommended.srp} />
                </Card>
                <Card>
                  <CssChangesTable
                    changes={result.receipt.recommended_action.css_changes}
                  />
                </Card>
              </div>

              {/* Pareto + constraints */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <ChartCard
                  title="Plan trade-offs (Pareto set)"
                  caption="Each point is a feasible plan; nothing in this set breaks a hard limit."
                  figure={paretoFig}
                  loading={!paretoFig}
                />
                <OptimizerConstraints
                  margins={result.receipt.constraint_margins}
                  activeConstraints={result.active_constraints}
                />
              </div>

              {/* Engineering receipt */}
              <OptimizerReceipt
                receipt={result.receipt}
                reason={reason}
                decisionBusy={decisionBusy}
                decisionError={decisionError}
                decisionResult={decisionResult}
                onReasonChange={setReason}
                onApprove={() => void decide("approve")}
                onReject={() => void decide("reject")}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
