"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import Icon from "@/components/Icon";
import WellSchematic from "@/components/WellSchematic";
import WellConsole from "@/components/WellConsole";
import ChartCard from "@/components/ChartCard";
import { ErrorCard, Skeleton, RiskChip } from "@/components/ui";
import { fetchCredibility, postOptimize } from "@/lib/api";
import { floatOverlay, fillageOverlay } from "@/lib/optimizer-figures";
import { useAsync } from "@/lib/useAsync";

const WEIGHTS = { oil: 1, sor: 1, energy: 1, failure: 1, risk: 1 };
export default function HomePage() {
  const [consoleOpen, setConsoleOpen] = useState(false);
  const opt = useAsync(() => postOptimize({ cycle: 4, mode: "srp_only", weights: WEIGHTS, current_day: 100 }), []);
  const cred = useAsync(() => fetchCredibility(), []);
  const o = opt.data;
  const floatFigure = useMemo(() => o ? floatOverlay(o.trajectories.no_action, o.trajectories.with_action) : null, [o]);
  const fillFigure = useMemo(() => o ? fillageOverlay(o.trajectories.no_action, o.trajectories.with_action) : null, [o]);
  const s = o?.receipt.current_state;
  const next = o?.receipt.recommended_action.next_setpoint;
  const floatDay = o?.receipt.prediction_no_action.float_event_day;
  const tests = cred.data?.metrics.constraint_violation_test;
  return <div className="overview-page">
    <div className="page-heading"><div><p className="eyebrow">Asset intelligence / Baghewala</p><h1>Well overview<span className="heading-dot">.</span></h1><p>One connected view of reservoir, pump and production.</p></div><div className="context-pill"><span>WELL A</span><b>Cycle 04</b><span>Day 100</span></div></div>
    {opt.error && <ErrorCard message={opt.error} onRetry={opt.reload} retrying={opt.loading}/>}
    {!o && !opt.error && <div aria-live="polite"><p className="mb-4 text-sm text-muted">Preparing the well state and recommended plan…</p><Skeleton className="h-28 mb-5"/><Skeleton className="h-96"/></div>}
    {o && s && <>
      <div className="overview-metrics">
        <div><span className="eyebrow">Oil production</span><strong>{s.oil_rate_bpd?.toFixed(1) ?? "—"} <small>bbl/d</small></strong><span>Current simulated rate</span></div>
        <div><span className="eyebrow">Reservoir temperature</span><strong>{s.temperature_c.toFixed(1)} <small>°C</small></strong><span>Near-wellbore estimate</span></div>
        <div><span className="eyebrow">Pump fillage</span><strong>{Math.round(s.fillage * 100)} <small>%</small></strong><span className={s.fillage < .45 ? "text-amber-700" : ""}>Minimum operating limit · 45%</span></div>
        <div><span className="eyebrow">Rod-float probability</span><div className="flex items-center gap-3"><strong>{Math.round(s.float_probability * 100)}<small> %</small></strong><RiskChip level={s.risk_level}/></div><span>Current day · fixed settings</span></div>
      </div>
      <div className="overview-hero">
        <WellSchematic state={s}/>
        <section className="recommendation-panel">
          <div className="flex items-center justify-between"><span className="eyebrow">Next best action</span><Icon name="optimizer"/></div>
          <div className="recommendation-label">TWIN RECOMMENDATION</div>
          <h2>{next ? "Retune the pump.\nStay ahead of the risk." : "Review the recommended operating plan."}</h2>
          <p>{floatDay != null ? `With unchanged settings, rod float is predicted on day ${floatDay}. Review the schedule before the well reaches that point.` : "Compare your current settings with the twin’s recommended schedule."}</p>
          <div className="setpoint-comparison"><div><span>Current pump speed</span><strong>{s.spm.toFixed(1)} <small>SPM</small></strong></div><Icon name="arrow"/><div><span>{next ? `From day ${next.from_day}` : "Next setpoint"}</span><strong>{next?.spm.toFixed(1) ?? "—"} <small>SPM</small></strong></div></div>
          <Link className="primary-button" href="/optimizer">Review recommendation<Icon name="arrow"/></Link>
          <span className="recommendation-footnote">Engineer approval required · No automatic control</span>
        </section>
      </div>
      <div className="section-heading"><div><p className="eyebrow">Forward outlook</p><h2>See the difference a decision makes.</h2></div><Link href="/risk" className="text-link">Explore risk intelligence <Icon name="arrow"/></Link></div>
      <div className="grid grid-cols-2 gap-5">
        <ChartCard title="Rod-float probability" caption="Fixed settings and the recommended schedule, compared over the cycle. Dashed lines mark engineering thresholds." figure={floatFigure} loading={!floatFigure} height={265}/>
        <ChartCard title="Pump fillage" caption="Compare barrel fill under both schedules against the minimum operating limit of 45%." figure={fillFigure} loading={!fillFigure} height={265}/>
      </div>
      <div className="evidence-strip"><Icon name="credibility"/><div><b>Every recommendation has an engineering receipt.</b><p>Physics checks, uncertainty and a traceable human decision.</p></div><Link href="/credibility">{tests ? `${tests.violations_found ?? "—"} violations / ${tests.plans_rechecked_with_full_twin ?? "—"} rechecked plans` : "Explore model credibility"} <span>↗</span></Link></div>
      <details className="operations-detail" onToggle={event => setConsoleOpen(event.currentTarget.open)}><summary><div><span className="eyebrow">Operational detail</span><h2>Well console & event forecast</h2></div><span className="text-muted text-xs">{consoleOpen ? "Collapse console −" : "Expand console +"}</span></summary>{consoleOpen && <div className="pt-6"><WellConsole/></div>}</details>
    </>}
  </div>;
}
