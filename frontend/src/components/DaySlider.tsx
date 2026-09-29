"use client";

import type { Phase, TimelineEvent } from "@/lib/api";
import { PHASE_BAND_COLORS } from "@/lib/figures";

function tickColor(type: string): string {
  if (type === "rod_float" || type === "load_limit") return "#b91c1c";
  if (type === "float_alert" || type === "fluid_pound") return "#b45309";
  return "#5c6b80";
}

export default function DaySlider({
  day,
  maxDay,
  phases,
  events,
  onChange,
}: {
  day: number;
  maxDay: number;
  phases: Phase[];
  events: TimelineEvent[];
  onChange: (day: number) => void;
}) {
  const pct = (v: number) => `${(Math.min(Math.max(v, 0), maxDay) / maxDay) * 100}%`;

  return (
    <div className="rounded-lg border border-line bg-white p-4 shadow-card">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">Cycle day</h3>
        <span className="text-sm font-semibold tabular-nums">
          Day {Math.round(day)}
        </span>
      </div>

      <input
        type="range"
        min={0}
        max={maxDay}
        step={1}
        value={Math.min(day, maxDay)}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-3 w-full cursor-pointer"
        style={{ accentColor: "#1e5eff" }}
        aria-label="Cycle day"
      />

      {/* Phase bands with event ticks, directly under the slider */}
      <div className="relative mt-1.5 h-3 w-full overflow-hidden rounded-full bg-page">
        {phases.map((ph) => (
          <div
            key={ph.name}
            title={`${ph.name}: days ${ph.start_day}–${ph.end_day}`}
            className="absolute inset-y-0"
            style={{
              left: pct(ph.start_day),
              width: `calc(${pct(ph.end_day)} - ${pct(ph.start_day)})`,
              backgroundColor: PHASE_BAND_COLORS[ph.name] ?? "#e3e9f1",
            }}
          />
        ))}
        {events.map((ev, i) => (
          <div
            key={`${ev.day}-${ev.type}-${i}`}
            title={`Day ${ev.day}: ${ev.message}`}
            className="absolute inset-y-0 w-0.5"
            style={{ left: pct(ev.day), backgroundColor: tickColor(ev.type) }}
          />
        ))}
      </div>

      <div className="mt-1 flex items-center justify-between text-[10px] text-muted">
        <span>0</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm bg-[#dbe7ff]" />
            injection
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm bg-[#fbe8cf]" />
            soak
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm bg-[#dcefe2]" />
            production
          </span>
        </span>
        <span>{maxDay}</span>
      </div>
    </div>
  );
}
