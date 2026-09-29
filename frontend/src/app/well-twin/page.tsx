"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import DaySlider from "@/components/DaySlider";
import ChartCard from "@/components/ChartCard";
import ConstraintMargins from "@/components/ConstraintMargins";
import EventsList from "@/components/EventsList";
import { Card, ErrorCard, KpiCard, RiskChip } from "@/components/ui";
import {
  fetchMeasured,
  fetchState,
  fetchTimeline,
  type MeasuredResponse,
  type StateResponse,
  type TimelineResponse,
} from "@/lib/api";
import {
  cardFigure,
  loadFigure,
  oilRateFigure,
  temperatureFigure,
  viscosityFigure,
} from "@/lib/figures";

const DEFAULT_CYCLE = 4;
/** Landing day for the demo (clamped to the cycle length once loaded). */
const DEFAULT_DAY = 110;
const STATE_DEBOUNCE_MS = 150;

function fmt(value: number | null | undefined, digits: number): string {
  return value === null || value === undefined ? "—" : value.toFixed(digits);
}

export default function WellTwinPage() {
  const [cycle, setCycle] = useState(DEFAULT_CYCLE);
  const [day, setDay] = useState(DEFAULT_DAY);
  const [showSensor, setShowSensor] = useState(true);

  const [timeline, setTimeline] = useState<TimelineResponse | null>(null);
  const [measured, setMeasured] = useState<MeasuredResponse | null>(null);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  const [state, setState] = useState<StateResponse | null>(null);
  const [stateError, setStateError] = useState<string | null>(null);

  const maxDay = timeline ? timeline.days[timeline.days.length - 1] : 0;

  // Timeline + measured overlay for the selected cycle -----------------------
  useEffect(() => {
    let cancelled = false;
    setTimeline(null);
    setMeasured(null);
    setTimelineError(null);
    Promise.all([fetchTimeline(cycle), fetchMeasured(cycle)])
      .then(([t, m]) => {
        if (cancelled) return;
        setTimeline(t);
        setMeasured(m);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setTimelineError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [cycle, retryToken]);

  // Day snapshot (debounced 150 ms while sliding) -----------------------------
  useEffect(() => {
    if (!timeline) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setState(null);
      setStateError(null);
      fetchState(cycle, Math.min(day, maxDay))
        .then((s) => {
          if (!cancelled) setState(s);
        })
        .catch((err: unknown) => {
          if (!cancelled)
            setStateError(err instanceof Error ? err.message : String(err));
        });
    }, STATE_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [cycle, day, maxDay, timeline, retryToken]);

  // Clamp the day when a new (possibly shorter) cycle loads -------------------
  useEffect(() => {
    if (timeline && day > maxDay) setDay(maxDay);
  }, [timeline, day, maxDay]);

  const retry = useCallback(() => setRetryToken((n) => n + 1), []);

  // Figures (null while loading → skeletons) ---------------------------------
  const sensor = showSensor ? measured : null;
  const tempFig = useMemo(
    () => (timeline ? temperatureFigure(timeline, sensor, day) : null),
    [timeline, sensor, day]
  );
  const viscFig = useMemo(
    () => (timeline ? viscosityFigure(timeline, day) : null),
    [timeline, day]
  );
  const oilFig = useMemo(
    () => (timeline ? oilRateFigure(timeline, sensor, day) : null),
    [timeline, sensor, day]
  );
  const loadFig = useMemo(
    () => (timeline ? loadFigure(timeline, day) : null),
    [timeline, day]
  );
  const cardFig = useMemo(() => cardFigure(state), [state]);

  if (timelineError) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <h1 className="text-xl font-semibold">Well Twin</h1>
        <ErrorCard message={timelineError} onRetry={retry} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-xl font-semibold">Well Twin</h1>
        <label className="flex items-center gap-2 text-sm text-muted">
          Cycle
          <select
            value={cycle}
            onChange={(e) => setCycle(Number(e.target.value))}
            className="rounded-md border border-line bg-white px-2 py-1 text-sm text-ink"
          >
            {[1, 2, 3, 4].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={showSensor}
            onChange={(e) => setShowSensor(e.target.checked)}
            className="h-3.5 w-3.5"
            style={{ accentColor: "#1e5eff" }}
          />
          Show sensor data
        </label>
        {timeline && (
          <span className="ml-auto text-[11px] text-muted">
            model {timeline.model_version} · SIMULATION
          </span>
        )}
      </div>

      {!timeline ? (
        <Card>
          <div className="space-y-3" aria-label="Loading cycle data">
            <div className="h-4 w-32 animate-pulse rounded bg-line" />
            <div className="h-8 w-full animate-pulse rounded bg-page" />
            <div className="h-3 w-full animate-pulse rounded bg-page" />
          </div>
        </Card>
      ) : (
        <>
          <DaySlider
            day={Math.min(day, maxDay)}
            maxDay={maxDay}
            phases={timeline.phases}
            events={timeline.events}
            onChange={setDay}
          />

          {stateError && (
            <ErrorCard message={stateError} onRetry={retry} retrying={false} />
          )}

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            {/* Left column: KPI cards for the selected day */}
            <div className="space-y-3 xl:col-span-3">
              <KpiCard
                label="Phase"
                value={state ? state.phase : "…"}
              />
              <KpiCard
                label="Near-wellbore temperature"
                value={state ? fmt(state.temperature_c, 1) : "…"}
                unit="°C"
              />
              <KpiCard
                label="Tubing viscosity"
                value={state ? fmt(state.tubing_viscosity_cp, 0) : "…"}
                unit="cP"
              />
              <KpiCard
                label="Oil rate"
                value={state ? fmt(state.oil_rate_bpd, 1) : "…"}
                unit="bbl/d"
              />
              <KpiCard
                label="Pump fillage"
                value={state ? fmt(state.fillage === null ? null : state.fillage * 100, 1) : "…"}
                unit="%"
              />
              <Card className="!p-3">
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted">
                  Rod-float risk
                </div>
                {state ? (
                  <>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="text-lg font-semibold tabular-nums">
                        {(state.float_probability * 100).toFixed(0)}%
                      </span>
                      <RiskChip level={state.risk_level} />
                    </div>
                    <p className="mt-1.5 text-xs leading-snug text-muted">
                      {state.risk_reason}
                    </p>
                  </>
                ) : (
                  <div className="mt-2 space-y-2">
                    <div className="h-5 w-20 animate-pulse rounded bg-line" />
                    <div className="h-8 animate-pulse rounded bg-page" />
                  </div>
                )}
              </Card>
            </div>

            {/* Center: dynamometer card + 4 synchronized time series */}
            <div className="space-y-4 xl:col-span-6">
              <ChartCard
                title="Surface dynamometer card (simulated)"
                caption="Rod load vs position for one pump stroke today. A rounded, sagging bottom corner means the pump is not filling completely."
                height={240}
                figure={cardFig}
                loading={!state}
                onPlotClick={(x) => setDay(Math.round(x))}
              />
              <ChartCard
                title="Near-wellbore temperature"
                caption="Heat left from the steam soak fades over the cycle; cooler oil is thicker and harder to pump."
                figure={tempFig}
                loading={!tempFig}
                onPlotClick={(x) => setDay(Math.round(x))}
              />
              <ChartCard
                title="Oil viscosity (log scale)"
                caption="Viscosity climbs steeply as the reservoir cools, which drives rod drag and pump-filling problems."
                figure={viscFig}
                loading={!viscFig}
                onPlotClick={(x) => setDay(Math.round(x))}
              />
              <ChartCard
                title="Oil rate"
                caption="Daily oil production. The pump struggles late in the cycle as the oil thickens."
                figure={oilFig}
                loading={!oilFig}
                onPlotClick={(x) => setDay(Math.round(x))}
              />
              <ChartCard
                title="Rod loads & float probability"
                caption="If the minimum downstroke load reaches 0 kN the rods fall freely no longer (rod float); the red curve is the modelled probability of that happening."
                figure={loadFig}
                loading={!loadFig}
                onPlotClick={(x) => setDay(Math.round(x))}
              />
            </div>

            {/* Right column: constraint margins + events */}
            <div className="space-y-3 xl:col-span-3">
              <ConstraintMargins
                margins={state?.constraint_margins ?? []}
                loading={!state}
              />
              <EventsList
                events={timeline.events}
                onJump={(d) => setDay(d)}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
