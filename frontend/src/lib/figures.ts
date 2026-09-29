"use client";

/**
 * Pure functions that turn API responses into Plotly figures.
 * No engineering numbers are computed here — every value plotted comes
 * straight from the API; this file only shapes it for Plotly.
 */

import type { Data, Layout, LayoutAxis } from "plotly.js";
import type {
  MeasuredResponse,
  Phase,
  StateResponse,
  TimelineResponse,
} from "@/lib/api";

// Shared light-theme styling -------------------------------------------------

export const FONT = {
  family:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  size: 10,
  color: "#7b8da3",
} as const;

export const BASE_LAYOUT: Partial<Layout> = {
  paper_bgcolor: "#ffffff",
  plot_bgcolor: "#fcfdff",
  font: FONT,
  margin: { l: 48, r: 28, t: 45, b: 46 },
  showlegend: true,
  legend: {
    orientation: "h",
    y: 1.06,
    yanchor: "bottom",
    x: 0,
    font: { size: 9 },
    bgcolor: "rgba(255,255,255,0)",
  },
  hovermode: "x unified",
  hoverlabel: { bgcolor: "#ffffff", bordercolor: "#dce6f2", font: { size: 11, color: "#344e6c" } },
};

const GRIDCOLOR = "#e3e9f1";
const LINECOLOR = "#1e5eff"; // single calm blue accent
const SENSOR_COLOR = "#9aa5b1"; // small grey markers for measured data
const AXIS_LINECOLOR = "#c3cdd9";

function axis(title?: string): Partial<LayoutAxis> {
  return {
    title: title ? { text: title, font: { size: 11 } } : undefined,
    gridcolor: GRIDCOLOR,
    zerolinecolor: GRIDCOLOR,
    linecolor: AXIS_LINECOLOR,
    showline: true,
    mirror: false,
    ticks: "outside",
    tickcolor: AXIS_LINECOLOR,
  };
}

/** Shaded rectangles for injection / soak / production phases. */
export function phaseShapes(phases: Phase[]): NonNullable<Layout["shapes"]> {
  const fills: Record<string, string> = {
    injection: "rgba(30,94,255,0.10)",
    soak: "rgba(180,83,9,0.10)",
    production: "rgba(23,122,61,0.08)",
  };
  return phases.map((ph) => ({
    type: "rect",
    xref: "x",
    yref: "paper",
    x0: ph.start_day,
    x1: ph.end_day,
    y0: 0,
    y1: 1,
    fillcolor: fills[ph.name] ?? "rgba(92,107,128,0.08)",
    line: { width: 0 },
    layer: "below",
  }));
}

/** Vertical line at the selected day. */
export function selectedDayShape(day: number): NonNullable<Layout["shapes"]>[number] {
  return {
    type: "line",
    xref: "x",
    yref: "paper",
    x0: day,
    x1: day,
    y0: 0,
    y1: 1,
    line: { color: "#1e2a3a", width: 1.5, dash: "dot" },
    layer: "above",
  };
}

// 1. Temperature -------------------------------------------------------------

export function temperatureFigure(
  t: TimelineResponse,
  m: MeasuredResponse | null,
  day: number
): { data: Data[]; layout: Partial<Layout> } {
  const data: Data[] = [
    {
      type: "scatter",
      mode: "lines",
      name: "Simulated",
      x: t.days,
      y: t.temperature_c,
      line: { color: LINECOLOR, width: 2 },
      connectgaps: false,
      hovertemplate: "Day %{x:.0f}: %{y:.1f} °C<extra></extra>",
    },
  ];
  if (m) {
    data.push({
      type: "scatter",
      mode: "markers",
      name: "Sensor",
      x: m.days,
      y: m.temperature_meas_c,
      marker: { color: SENSOR_COLOR, size: 4, symbol: "circle-open" },
      hovertemplate: "Day %{x:.0f}: %{y:.1f} °C (measured)<extra></extra>",
    });
  }
  const layout: Partial<Layout> = {
    ...BASE_LAYOUT,
    xaxis: { ...axis("Day"), range: [0, t.days[t.days.length - 1]] },
    yaxis: axis("Temperature (°C)"),
    shapes: [...phaseShapes(t.phases), selectedDayShape(day)],
  };
  return { data, layout };
}

// 2. Viscosity (log y) -------------------------------------------------------

export function viscosityFigure(
  t: TimelineResponse,
  day: number
): { data: Data[]; layout: Partial<Layout> } {
  const data: Data[] = [
    {
      type: "scatter",
      mode: "lines",
      name: "Viscosity",
      x: t.days,
      y: t.viscosity_cp,
      line: { color: LINECOLOR, width: 2 },
      connectgaps: false,
      hovertemplate: "Day %{x:.0f}: %{y:.0f} cP<extra></extra>",
    },
  ];
  const layout: Partial<Layout> = {
    ...BASE_LAYOUT,
    xaxis: { ...axis("Day"), range: [0, t.days[t.days.length - 1]] },
    yaxis: { ...axis("Viscosity (cP)"), type: "log" },
    shapes: [...phaseShapes(t.phases), selectedDayShape(day)],
  };
  return { data, layout };
}

// 3. Oil rate ----------------------------------------------------------------

export function oilRateFigure(
  t: TimelineResponse,
  m: MeasuredResponse | null,
  day: number
): { data: Data[]; layout: Partial<Layout> } {
  const data: Data[] = [
    {
      type: "scatter",
      mode: "lines",
      name: "Simulated",
      x: t.days,
      y: t.oil_rate_bpd,
      line: { color: LINECOLOR, width: 2 },
      connectgaps: false,
      hovertemplate: "Day %{x:.0f}: %{y:.1f} bbl/d<extra></extra>",
    },
  ];
  if (m) {
    data.push({
      type: "scatter",
      mode: "markers",
      name: "Sensor",
      x: m.days,
      y: m.oil_meas_bpd,
      marker: { color: SENSOR_COLOR, size: 4, symbol: "circle-open" },
      hovertemplate: "Day %{x:.0f}: %{y:.1f} bbl/d (measured)<extra></extra>",
    });
  }
  const layout: Partial<Layout> = {
    ...BASE_LAYOUT,
    xaxis: { ...axis("Day"), range: [0, t.days[t.days.length - 1]] },
    yaxis: axis("Oil rate (bbl/d)"),
    shapes: [...phaseShapes(t.phases), selectedDayShape(day)],
  };
  return { data, layout };
}

// 4. Rod loads + float probability ------------------------------------------

export function loadFigure(
  t: TimelineResponse,
  day: number
): { data: Data[]; layout: Partial<Layout> } {
  const maxDay = t.days[t.days.length - 1];
  const alertDay = t.alert_day ?? undefined;
  const floatDay = t.float_event_day ?? undefined;
  const lineTemplate = "Day %{x:.0f}: %{y:.1f} kN<extra></extra>";

  const data: Data[] = [
    {
      type: "scatter",
      mode: "lines",
      name: "Min downstroke load",
      x: t.days,
      y: t.min_downstroke_load_kn,
      line: { color: LINECOLOR, width: 2 },
      connectgaps: false,
      hovertemplate: lineTemplate,
    },
    {
      type: "scatter",
      mode: "lines",
      name: "Peak load",
      x: t.days,
      y: t.peak_load_kn,
      line: { color: "#7c9bff", width: 1.5, dash: "dash" },
      connectgaps: false,
      hovertemplate: lineTemplate,
    },
    {
      type: "scatter",
      mode: "lines",
      name: "0 kN",
      x: [0, maxDay],
      y: [0, 0],
      line: { color: "#1e2a3a", width: 1 },
      hoverinfo: "skip",
      showlegend: true,
    },
    {
      type: "scatter",
      mode: "lines",
      name: "60 kN limit",
      x: [0, maxDay],
      y: [60, 60],
      line: { color: "#b45309", width: 1, dash: "dot" },
      hoverinfo: "skip",
      showlegend: true,
    },
    {
      type: "scatter",
      mode: "lines",
      name: "Float probability",
      x: t.days,
      y: t.float_probability,
      yaxis: "y2",
      line: { color: "#b91c1c", width: 2 },
      connectgaps: false,
      hovertemplate: "Day %{x:.0f}: %{y:.0%} float prob.<extra></extra>",
    },
    // Dashed reference lines on the secondary axis: 10% alert, 20% limit.
    {
      type: "scatter",
      mode: "lines",
      name: "10% alert",
      x: [0, maxDay],
      y: [0.1, 0.1],
      yaxis: "y2",
      line: { color: "#b45309", width: 1, dash: "dash" },
      hoverinfo: "skip",
      showlegend: true,
    },
    {
      type: "scatter",
      mode: "lines",
      name: "20% limit",
      x: [0, maxDay],
      y: [0.2, 0.2],
      yaxis: "y2",
      line: { color: "#b91c1c", width: 1, dash: "dash" },
      hoverinfo: "skip",
      showlegend: true,
    },
  ];

  const layout: Partial<Layout> = {
    ...BASE_LAYOUT,
    xaxis: { ...axis("Day"), range: [0, maxDay] },
    yaxis: { ...axis("Rod load (kN)"), rangemode: "tozero" as const },
    yaxis2: {
      ...axis("Float probability"),
      overlaying: "y",
      side: "right",
      range: [0, 1],
      tickformat: ".0%",
      gridcolor: "rgba(0,0,0,0)",
    },
    shapes: [
      ...phaseShapes(t.phases),
      selectedDayShape(day),
      ...(alertDay !== undefined
        ? ([
            {
              type: "line",
              xref: "x",
              yref: "paper",
              x0: alertDay,
              x1: alertDay,
              y0: 0,
              y1: 1,
              line: { color: "#b45309", width: 1, dash: "dash" },
              layer: "above",
            },
          ] as NonNullable<Layout["shapes"]>)
        : []),
      ...(floatDay !== undefined
        ? ([
            {
              type: "line",
              xref: "x",
              yref: "paper",
              x0: floatDay,
              x1: floatDay,
              y0: 0,
              y1: 1,
              line: { color: "#b91c1c", width: 1.5 },
              layer: "above",
            },
          ] as NonNullable<Layout["shapes"]>)
        : []),
    ],
  };
  return { data, layout };
}

// Dynamometer card -----------------------------------------------------------

export function cardFigure(
  state: StateResponse | null
): { data: Data[]; layout: Partial<Layout> } | null {
  if (!state || !state.card?.position?.length) return null;
  const pos = state.card.position;
  const load = state.card.load;
  const data: Data[] = [
    {
      type: "scatter",
      mode: "lines",
      name: "Card",
      x: [...pos, pos[0]],
      y: [...load, load[0]],
      line: { color: LINECOLOR, width: 2 },
      fill: "toself",
      fillcolor: "rgba(30,94,255,0.06)",
      hovertemplate: "Pos %{x:.2f} m · Load %{y:.1f} kN<extra></extra>",
    },
  ];
  const layout: Partial<Layout> = {
    ...BASE_LAYOUT,
    showlegend: false,
    margin: { l: 54, r: 20, t: 12, b: 40 },
    xaxis: { ...axis("Position (m)") },
    yaxis: { ...axis("Load (kN)") },
    hovermode: "closest",
  };
  return { data, layout };
}

// Small helper for the day-slider phase bands (HTML, not Plotly) -------------

export const PHASE_BAND_COLORS: Record<string, string> = {
  injection: "#dbe7ff",
  soak: "#fbe8cf",
  production: "#dcefe2",
};
