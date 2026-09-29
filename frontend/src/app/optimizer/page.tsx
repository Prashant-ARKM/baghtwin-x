"use client";

import { useCallback, useMemo, useState } from "react";
import ChartCard from "@/components/ChartCard";
import OptimizerControls from "@/components/OptimizerControls";
import { CssChangesTable, PumpScheduleTable } from "@/components/OptimizerTables";
import OptimizerConstraints from "@/components/OptimizerConstraints";
import OptimizerReceipt from "@/components/OptimizerReceipt";
import { HeadlineCard } from "@/components/Delta";
import { Card, ErrorCard } from "@/components/ui";
import Icon from "@/components/Icon";
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

  const showPareto = useMemo(() => {
    if (!result) return false;
    const pts = result.pareto.filter((q) => q.css?.cutoff_day !== undefined);
    if (pts.length < 3) return false;
    const spread = (vals: number[]) => {
      const lo = Math.min(...vals);
      const hi = Math.max(...vals);
      return hi > 0 ? ((hi - lo) / hi) * 100 : 0;
    };
    return (
      spread(pts.map((q) => q.oil_bbl)) >= 2 ||
      spread(pts.map((q) => q.css?.steam_volume_m3 ?? 0)) >= 2
    );
  }, [result]);

  const headline = result?.headline;
  const breaches = result?.baseline.violations.length ?? 0;
  const recFeasible = result ? result.recommended.feasible && result.recommended.violations.length === 0 : false;
  const stale = !!result && (result.mode !== mode || result.current_day !== currentDay || Object.keys(weights).some(key => weights[key as keyof OptimizeWeights] !== result.weights[key as keyof OptimizeWeights]));

  return (
    <div className="space-y-4">
      <div className="page-heading">
        <div><p className="eyebrow">Decision workspace / Cycle 04</p><h1>Plan a better cycle<span className="heading-dot">.</span></h1><p>Balance production, efficiency and risk. Review the evidence behind every setting.</p></div>
        <div className="context-pill"><Icon name="optimizer"/><b>Engineer-led decisions</b></div>
      </div>

      <div className="grid grid-cols-[260px_minmax(0,1fr)] gap-6">
        {/* Left: controls */}
        <div>
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
        <div className="space-y-5">
          {solveError && (
            <ErrorCard
              message={solveError}
              onRetry={() => void runOptimize()}
              retrying={solving}
            />
          )}

          {!result && !solving && !solveError && (
            <section className="optimizer-empty"><Icon name="optimizer"/><span className="eyebrow">Your next operating plan</span><h2>A better decision starts here.</h2><p>Set your priorities on the left, then generate a recommendation to compare schedules and inspect the engineering evidence.</p><div className="optimizer-stages"><span><b>01</b> Set priorities</span><span><b>02</b> Simulate</span><span><b>03</b> Review & approve</span></div></section>
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
              {stale && <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">Priorities or decision day changed. Generate a new recommendation before recording a decision. The results below show your previous plan.</div>}
              <section className="plan-summary">
                <div className="flex items-center justify-between"><span className="eyebrow">Recommended operating plan · Day {result.current_day}</span><a href="#engineering-receipt" className="text-link">Review engineering receipt <Icon name="arrow"/></a></div>
                <h2>{result.receipt.recommended_action.next_setpoint ? `Set pump speed to ${result.receipt.recommended_action.next_setpoint.spm.toFixed(1)} SPM from day ${result.receipt.recommended_action.next_setpoint.from_day}.` : "Review the optimized cycle design."}</h2>
                <div className="setpoint-comparison"><div><span>Current setting</span><strong>{result.receipt.current_state.spm.toFixed(1)} <small>SPM × {result.receipt.current_state.stroke_m.toFixed(1)} m</small></strong></div><Icon name="arrow"/><div><span>Recommended first setting</span><strong>{result.receipt.recommended_action.next_setpoint?.spm.toFixed(1) ?? "—"} <small>SPM × {result.receipt.recommended_action.next_setpoint?.stroke_m.toFixed(1) ?? "—"} m</small></strong></div></div>
                <p>{result.receipt.recommended_action.schedule_text}</p>
              </section>
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
                  unit="failures/cycle"
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
                {showPareto ? (
                  <ChartCard
                    title="Plan trade-offs (Pareto set)"
                    caption="Each point is a feasible plan; nothing in this set breaks a hard limit."
                    figure={paretoFig}
                    loading={!paretoFig}
                  />
                ) : (
                  <Card>
                    <h3 className="text-sm font-semibold">Plan trade-offs (Pareto set)</h3>
                    <p className="mt-2 text-xs leading-relaxed text-muted">
                      In pump-only mode all plans give almost the same oil and steam use, so the trade-off is in risk and energy. Switch to Steam + pump to see the trade-off.
                    </p>
                  </Card>
                )}
                <OptimizerConstraints
                  margins={result.receipt.constraint_margins}
                  activeConstraints={result.active_constraints}
                />
              </div>

              {/* Engineering receipt */}
              <div id="engineering-receipt" className="scroll-mt-24"><OptimizerReceipt
                receipt={result.receipt}
                reason={reason}
                decisionBusy={decisionBusy || stale}
                decisionError={decisionError}
                decisionResult={decisionResult}
                onReasonChange={setReason}
                onApprove={() => void decide("approve")}
                onReject={() => void decide("reject")}
              /></div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
