"use client";

/**
 * SSR-safe wrapper: the plotly.js-dist-min bundle is browser-only, so the
 * actual renderer (PlotlyInner) is loaded client-side via next/dynamic.
 */
import dynamic from "next/dynamic";
import type { Data, Layout } from "plotly.js";

export type PlotlyFigure = { data: Data[]; layout: Partial<Layout> };

const PlotlyInner = dynamic(() => import("@/components/PlotlyInner"), {
  ssr: false,
  loading: () => (
    <div
      className="flex w-full animate-pulse items-center justify-center rounded-md bg-page"
      style={{ height: "100%" }}
      aria-label="Loading chart"
    />
  ),
});

export default function PlotlyChart({
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
    <div style={{ width: "100%", height }}>
      <PlotlyInner
        data={data}
        layout={layout}
        height={height}
        onPlotClick={onPlotClick}
      />
    </div>
  );
}
