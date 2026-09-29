"use client";

import { useMemo } from "react";
import PlotlyChart, { PlotlyFigure } from "@/components/PlotlyChart";

export default function ChartCard({
  title,
  caption,
  height = 260,
  figure,
  loading,
  onPlotClick,
  action,
}: {
  title: string;
  /** One-line plain-words description shown under the chart. */
  caption: string;
  height?: number;
  figure: PlotlyFigure | null;
  loading: boolean;
  onPlotClick?: (x: number) => void;
  /** Optional control rendered in the card header (e.g. the sensor toggle). */
  action?: React.ReactNode;
}) {
  const skeletonBars = useMemo(() => [0.6, 0.85, 0.7], []);

  return (
    <section className="rounded-lg border border-line bg-white p-4 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        {action}
      </div>
      <div className="mt-3" style={{ minHeight: height }}>
        {loading || !figure ? (
          <div
            className="flex animate-pulse flex-col justify-end gap-3 rounded-md bg-page p-4"
            style={{ height }}
            aria-label="Loading chart"
          >
            {skeletonBars.map((w, i) => (
              <div
                key={i}
                className="rounded bg-line"
                style={{ height: `${18 + i * 10}%`, width: `${w * 100}%` }}
              />
            ))}
          </div>
        ) : (
          <PlotlyChart
            data={figure.data}
            layout={figure.layout}
            height={height}
            onPlotClick={onPlotClick}
          />
        )}
      </div>
      <p className="mt-2 text-xs text-muted">{caption}</p>
    </section>
  );
}
