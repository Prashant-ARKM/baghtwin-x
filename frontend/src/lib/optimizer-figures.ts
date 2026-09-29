"use client";

/**
 * Optimizer-tab figures. Every value comes from POST /api/optimize; these
 * functions only shape API data for Plotly (no engineering math).
 * Two-colour convention: grey = no action (baseline), blue = recommended.
 */

import type { Data, Layout, LayoutAxis } from "plotly.js";
import type { OptimizePlan, Trajectory } from "@/lib/api";
import { BASE_LAYOUT, FONT, phaseShapes } from "@/lib/figures";

const GREY = "#9aa5b1"; // no action
const BLUE = "#1e5eff"; // recommended
const GRIDCOLOR = "#e3e9f1";
const AXIS = "#c3cdd9";

function axis(title: string): Partial<LayoutAxis> {
  return {
    title: { text: title, font: { size: 11 } },
    gridcolor: GRIDCOLOR,
    zerolinecolor: GRIDCOLOR,
    linecolor: AXIS,
    showline: true,
    ticks: "outside",
    tickcolor: AXIS,
  };
}

function baseLayout(xTitle: string, yTitle: string, phasesOpt?: Trajectory["events"]): Partial<Layout> {
  void phasesOpt;
  return {
    ...BASE_LAYOUT,
    xaxis: axis(xTitle),
    yaxis: axis(yTitle),
  };
}

/** Grey no-action trace + blue recommended trace; nulls stay gaps. */
function overlayTraces(
  noAction: Trajectory,
  withAction: Trajectory,
  key: keyof Trajectory,
  yTitle: string,
  opts: {
    refLines?: { y: number; label: string; color: string }[];
    y2?: { series: (number | null)[]; title: string; ref: { y: number; label: string }[] };
    step?: boolean;
  } = {}
): { data: Data[]; layout: Partial<Layout> } {
  const naSeries = noAction[key] as (number | null)[];
  const waSeries = withAction[key] as (number | null)[];
  const lineShape = opts.step ? ("hv" as const) : ("linear" as const);

  const data: Data[] = [
    {
      type: "scatter",
      mode: "lines",
      name: "No action",
      x: noAction.days,
      y: naSeries,
      line: { color: GREY, width: 2, shape: lineShape },
      connectgaps: false,
      hovertemplate: "Day %{x:.0f}: %{y:.2f}<extra>No action</extra>",
    },
    {
      type: "scatter",
      mode: "lines",
      name: "Recommended",
      x: withAction.days,
      y: waSeries,
      line: { color: BLUE, width: 2, shape: lineShape },
      connectgaps: false,
      hovertemplate: "Day %{x:.0f}: %{y:.2f}<extra>Recommended</extra>",
    },
  ];

  for (const ref of opts.refLines ?? []) {
    data.push({
      type: "scatter",
      mode: "lines",
      name: ref.label,
      x: [0, noAction.days[noAction.days.length - 1]],
      y: [ref.y, ref.y],
      line: { color: ref.color, width: 1, dash: "dot" },
      hoverinfo: "skip",
      showlegend: true,
    });
  }

  const layout = baseLayout("Day", yTitle);
  layout.shapes = (opts.refLines ?? []).map((ref) => ({
    type: "line" as const,
    xref: "paper" as const,
    yref: "y" as const,
    x0: 0,
    x1: 1,
    y0: ref.y,
    y1: ref.y,
    line: { color: ref.color, width: 1, dash: "dot" as const },
    layer: "above" as const,
  }));

  if (opts.y2) {
    data.push({
      type: "scatter",
      mode: "lines",
      name: "Float probability",
      x: withAction.days,
      y: withAction.float_probability,
      yaxis: "y2",
      line: { color: BLUE, width: 1.5, dash: "dot" },
      connectgaps: false,
      hovertemplate: "Day %{x:.0f}: %{y:.0%}<extra>Recommended float prob.</extra>",
      showlegend: true,
    });
    for (const ref of opts.y2.ref) {
      data.push({
        type: "scatter",
        mode: "lines",
        name: ref.label,
        x: [0, withAction.days[withAction.days.length - 1]],
        y: [ref.y, ref.y],
        yaxis: "y2",
        line: { color: "#b45309", width: 1, dash: "dash" },
        hoverinfo: "skip",
        showlegend: true,
      });
    }
    layout.yaxis2 = {
      title: { text: opts.y2.title, font: { size: 11 } },
      overlaying: "y",
      side: "right",
      range: [0, 1],
      tickformat: ".0%",
      gridcolor: "rgba(0,0,0,0)",
      showgrid: false,
    };
  }

  return { data, layout };
}

// 1. SPM step chart ----------------------------------------------------------

export function spmOverlay(noAction: Trajectory, withAction: Trajectory) {
  return overlayTraces(noAction, withAction, "spm", "Pump speed (SPM)", { step: true });
}

// 2. Float probability -------------------------------------------------------

export function floatOverlay(noAction: Trajectory, withAction: Trajectory) {
  return overlayTraces(noAction, withAction, "float_probability", "Float probability", {
    refLines: [
      { y: 0.1, label: "10% alert", color: "#b45309" },
      { y: 0.2, label: "20% limit", color: "#b91c1c" },
    ],
  });
}

// 3. Fillage -----------------------------------------------------------------

export function fillageOverlay(noAction: Trajectory, withAction: Trajectory) {
  return overlayTraces(noAction, withAction, "fillage", "Pump fillage", {
    refLines: [{ y: 0.45, label: "45% minimum", color: "#b91c1c" }],
  });
}

// 4. Peak load ---------------------------------------------------------------

export function peakLoadOverlay(noAction: Trajectory, withAction: Trajectory) {
  return overlayTraces(noAction, withAction, "peak_load_kn", "Peak rod load (kN)", {
    refLines: [{ y: 60, label: "60 kN limit", color: "#b45309" }],
  });
}

// 5. Pareto scatter ----------------------------------------------------------

/** x = SOR, y = oil per cycle-day (oil_bbl / (cutoff_day + 20)); colour = risk. */
export function paretoFigure(
  pareto: OptimizePlan[],
  baseline: OptimizePlan
): { data: Data[]; layout: Partial<Layout> } | null {
  const points = pareto.filter((p) => p.css?.cutoff_day !== undefined);
  if (points.length === 0) return null;

  const oilPerDay = (p: OptimizePlan) => p.oil_bbl / (p.css.cutoff_day + 20);

  const others = points.filter((p) => !p.is_recommended);
  const rec = points.find((p) => p.is_recommended);

  const data: Data[] = [];

  if (others.length > 0) {
    data.push({
      type: "scatter",
      mode: "markers",
      name: "Feasible plans",
      x: others.map((p) => p.sor),
      y: others.map(oilPerDay),
      marker: {
        size: 10,
        color: others.map((p) => p.risk),
        colorscale: [
          [0, "#177a3d"],
          [0.5, "#eab308"],
          [1, "#b91c1c"],
        ],
        cmin: 0,
        cmax: 1,
        colorbar: {
          title: { text: "Risk", font: FONT },
          thickness: 10,
          len: 0.75,
          tickformat: ".0%",
        },
        line: { color: "#ffffff", width: 1 },
      },
      customdata: others.map((p) => [
        p.label ?? "plan",
        p.oil_bbl,
        p.energy,
        p.max_float_probability,
      ]),
      hovertemplate:
        "<b>%{customdata[0]}</b><br>Oil %{customdata[1]:.0f} bbl · SOR %{x:.2f}" +
        "<br>Energy %{customdata[2]:.0f} kWh/bbl · float %{customdata[3]:.0%}" +
        "<extra></extra>",
    });
  }

  if (rec) {
    data.push({
      type: "scatter",
      mode: "markers",
      name: "Recommended",
      x: [rec.sor],
      y: [oilPerDay(rec)],
      marker: {
        size: 15,
        color: rec.risk,
        colorscale: [
          [0, "#177a3d"],
          [0.5, "#eab308"],
          [1, "#b91c1c"],
        ],
        cmin: 0,
        cmax: 1,
        line: { color: "#1e2a3a", width: 2.5 },
      },
      customdata: [[rec.label ?? "Recommended", rec.oil_bbl, rec.energy, rec.max_float_probability]],
      hovertemplate:
        "<b>%{customdata[0]}</b><br>Oil %{customdata[1]:.0f} bbl · SOR %{x:.2f}" +
        "<br>Energy %{customdata[2]:.0f} kWh/bbl · float %{customdata[3]:.0%}" +
        "<extra></extra>",
    });
  }

  data.push({
    type: "scatter",
    mode: "markers",
    name: "Baseline (no action)",
    x: [baseline.sor],
    y: [oilPerDay(baseline)],
    marker: { symbol: "cross", size: 12, color: GREY, line: { width: 1 } },
    customdata: [[baseline.oil_bbl, baseline.energy, baseline.max_float_probability]],
    hovertemplate:
      "<b>Baseline</b><br>Oil %{customdata[0]:.0f} bbl · SOR %{x:.2f}" +
      "<br>Energy %{customdata[1]:.0f} kWh/bbl · float %{customdata[2]:.0%}" +
      "<extra></extra>",
  });

  const layout: Partial<Layout> = {
    ...BASE_LAYOUT,
    xaxis: axis("Steam-oil ratio (steam per oil, lower is better)"),
    yaxis: axis("Oil per cycle-day (bbl/d)"),
    hovermode: "closest",
    margin: { l: 60, r: 30, t: 12, b: 44 },
  };
  return { data, layout };
}
