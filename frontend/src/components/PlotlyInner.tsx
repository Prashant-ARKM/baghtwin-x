"use client";

/**
 * Browser-only Plotly renderer. Loaded through next/dynamic with ssr:false
 * (see PlotlyChart.tsx) because the plotly.js-dist-min UMD bundle touches
 * `window`/`self` at import time and must never evaluate on the server.
 * We use react-plotly.js/factory (which takes the Plotly instance as an
 * argument) because react-plotly.js's main entry imports the full plotly.js
 * package, which we deliberately do not bundle (we ship plotly.js-dist-min).
 */
import createPlotlyComponent from "react-plotly.js/factory";
import type { Config, Data, Layout } from "plotly.js";
import type PlotlyNamespace from "plotly.js-dist-min";

// plotly.js-dist-min is a UMD bundle with no tree-shaking, so it is loaded
// eagerly in the browser either way; the require() just makes that explicit.
const Plot = createPlotlyComponent(
  require("plotly.js-dist-min") as typeof PlotlyNamespace
);

const BASE_CONFIG: Partial<Config> = {
  responsive: true,
  displayModeBar: false,
  displaylogo: false,
};

export type PlotlyFigure = { data: Data[]; layout: Partial<Layout> };

export default function PlotlyInner({
  data,
  layout,
  height,
  onPlotClick,
}: {
  data: Data[];
  layout: Partial<Layout>;
  height: number;
  /** Invoked with the x value of a clicked point (used to jump the day slider). */
  onPlotClick?: (x: number) => void;
}) {
  return (
    <Plot
      data={data}
      layout={{ ...layout, autosize: true, height }}
      config={BASE_CONFIG}
      style={{ width: "100%", height }}
      useResizeHandler
      onClick={(event) => {
        const x = event?.points?.[0]?.x;
        if (onPlotClick && typeof x === "number") onPlotClick(x);
      }}
    />
  );
}
