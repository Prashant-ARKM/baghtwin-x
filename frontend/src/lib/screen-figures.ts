"use client";

/**
 * Figures for the Replay and Risk tabs. Pure shaping of API data for Plotly;
 * no engineering numbers are computed here.
 */

import type { Data, Layout, LayoutAxis } from "plotly.js";
import type { ReplayResponse, TimelineResponse } from "@/lib/api";
import { BASE_LAYOUT, phaseShapes } from "@/lib/figures";

const GREY = "#9aa5b1";
const BLUE = "#1e5eff";
const AMBER = "#b45309";
const RED = "#b91c1c";
const GRID = "#e3e9f1";
const AXIS = "#c3cdd9";

function axis(title: string): Partial<LayoutAxis> {
  return {
    title: { text: title, font: { size: 11 } },
    gridcolor: GRID,
    zerolinecolor: GRID,
    linecolor: AXIS,
    showline: true,
    ticks: "outside",
    tickcolor: AXIS,
  };
}

type Figure = { data: Data[]; layout: Partial<Layout> };

/** Twin prediction with 90% band vs the synthetic actual oil rate (grey markers). */
export function replayPredictionFigure(r: ReplayResponse): Figure {
  const p = r.predicted_vs_actual;
  const data: Data[] = [
    {
      type: "scatter",
      mode: "lines",
      name: "90% lower",
      x: r.days,
      y: p.lo_bpd,
      line: { width: 0 },
      hoverinfo: "skip",
      showlegend: false,
      connectgaps: false,
    },
    {
      type: "scatter",
      mode: "lines",
      name: "90% band",
      x: r.days,
      y: p.hi_bpd,
      line: { width: 0 },
      fill: "tonexty",
      fillcolor: "rgba(30,94,255,0.14)",
      hoverinfo: "skip",
      connectgaps: false,
    },
    {
      type: "scatter",
      mode: "markers",
      name: "Synthetic actual",
      x: r.days,
      y: p.actual_oil_bpd,
      marker: { size: 4, color: GREY },
      hovertemplate: "Day %{x:.0f}: %{y:.1f} bbl/d<extra>Actual (synthetic)</extra>",
    },
    {
      type: "scatter",
      mode: "lines",
      name: "Twin prediction",
      x: r.days,
      y: p.predicted_oil_bpd,
      line: { color: BLUE, width: 2 },
      connectgaps: false,
      hovertemplate: "Day %{x:.0f}: %{y:.1f} bbl/d<extra>Twin</extra>",
    },
  ];
  return { data, layout: { ...BASE_LAYOUT, xaxis: axis("Day"), yaxis: axis("Oil rate (bbl/d)") } };
}

function vline(x: number, color: string): NonNullable<Layout["shapes"]>[number] {
  return {
    type: "line",
    xref: "x",
    yref: "paper",
    x0: x,
    x1: x,
    y0: 0,
    y1: 1,
    line: { color, width: 1.5, dash: "dash" },
    layer: "above",
  };
}

/** Rod-float and fluid-pound (impact) probability with the alert / limit lines and event days. */
export function riskProbabilityFigure(t: TimelineResponse): Figure {
  const last = t.days[t.days.length - 1];
  const data: Data[] = [
    {
      type: "scatter",
      mode: "lines",
      name: "Rod-float probability",
      x: t.days,
      y: t.float_probability,
      line: { color: BLUE, width: 2 },
      connectgaps: false,
      hovertemplate: "Day %{x:.0f}: %{y:.0%}<extra>Rod float</extra>",
    },
    {
      type: "scatter",
      mode: "lines",
      name: "Fluid-pound (impact) probability",
      x: t.days,
      y: t.impact_probability,
      line: { color: AMBER, width: 2 },
      connectgaps: false,
      hovertemplate: "Day %{x:.0f}: %{y:.0%}<extra>Fluid pound</extra>",
    },
    {
      type: "scatter",
      mode: "lines",
      name: "10% alert",
      x: [0, last],
      y: [0.1, 0.1],
      line: { color: AMBER, width: 1, dash: "dot" },
      hoverinfo: "skip",
    },
    {
      type: "scatter",
      mode: "lines",
      name: "20% limit",
      x: [0, last],
      y: [0.2, 0.2],
      line: { color: RED, width: 1, dash: "dot" },
      hoverinfo: "skip",
    },
  ];
  const shapes = phaseShapes(t.phases);
  if (t.alert_day !== null) shapes.push(vline(t.alert_day, AMBER));
  if (t.float_event_day !== null) shapes.push(vline(t.float_event_day, RED));
  return {
    data,
    layout: {
      ...BASE_LAYOUT,
      shapes,
      xaxis: axis("Day"),
      yaxis: { ...axis("Probability"), range: [0, 1.02], tickformat: ".0%" },
    },
  };
}

/** Why the risk rises: minimum downstroke load (left, float when it hits 0) vs oil viscosity in the tubing (right, log). */
export function riskDriversFigure(t: TimelineResponse): Figure {
  const last = t.days[t.days.length - 1];
  const data: Data[] = [
    {
      type: "scatter",
      mode: "lines",
      name: "Min downstroke load (kN)",
      x: t.days,
      y: t.min_downstroke_load_kn,
      line: { color: BLUE, width: 2 },
      connectgaps: false,
      hovertemplate: "Day %{x:.0f}: %{y:.1f} kN<extra>Min downstroke load</extra>",
    },
    {
      type: "scatter",
      mode: "lines",
      name: "Zero = rods float",
      x: [0, last],
      y: [0, 0],
      line: { color: RED, width: 1, dash: "dot" },
      hoverinfo: "skip",
    },
    {
      type: "scatter",
      mode: "lines",
      name: "Oil viscosity in tubing (cP)",
      x: t.days,
      y: t.tubing_viscosity_cp,
      yaxis: "y2",
      line: { color: GREY, width: 2 },
      connectgaps: false,
      hovertemplate: "Day %{x:.0f}: %{y:.0f} cP<extra>Viscosity</extra>",
    },
  ];
  return {
    data,
    layout: {
      ...BASE_LAYOUT,
      shapes: phaseShapes(t.phases),
      xaxis: axis("Day"),
      yaxis: axis("Min downstroke load (kN)"),
      yaxis2: {
        title: { text: "Viscosity (cP, log)", font: { size: 11 } },
        overlaying: "y",
        side: "right",
        type: "log",
        showgrid: false,
      },
    },
  };
}

/** Pump fillage with the 45% minimum. */
export function riskFillageFigure(t: TimelineResponse): Figure {
  const last = t.days[t.days.length - 1];
  const data: Data[] = [
    {
      type: "scatter",
      mode: "lines",
      name: "Pump fillage",
      x: t.days,
      y: t.fillage,
      line: { color: BLUE, width: 2 },
      connectgaps: false,
      hovertemplate: "Day %{x:.0f}: %{y:.0%}<extra>Fillage</extra>",
    },
    {
      type: "scatter",
      mode: "lines",
      name: "45% minimum",
      x: [0, last],
      y: [0.45, 0.45],
      line: { color: RED, width: 1, dash: "dot" },
      hoverinfo: "skip",
    },
  ];
  return {
    data,
    layout: {
      ...BASE_LAYOUT,
      shapes: phaseShapes(t.phases),
      xaxis: axis("Day"),
      yaxis: { ...axis("Fillage"), range: [0, 1.05], tickformat: ".0%" },
    },
  };
}
