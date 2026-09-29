"use client";

import type { TimelineEvent } from "@/lib/api";

function dotColor(type: string): string {
  if (type === "rod_float" || type === "load_limit") return "bg-red-500";
  if (type === "float_alert" || type === "fluid_pound") return "bg-amber-500";
  return "bg-slate-400";
}

function label(type: string): string {
  return type.replace(/_/g, " ");
}

export default function EventsList({
  events,
  onJump,
}: {
  events: TimelineEvent[];
  onJump: (day: number) => void;
}) {
  return (
    <section className="rounded-lg border border-line bg-white p-4 shadow-card">
      <h3 className="text-sm font-semibold">Events</h3>
      {events.length === 0 ? (
        <p className="mt-2 text-xs text-muted">
          No events in this cycle under these settings.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {events.map((ev, i) => (
            <li key={`${ev.day}-${ev.type}-${i}`}>
              <button
                onClick={() => onJump(ev.day)}
                title="Click to jump to this day"
                className="w-full rounded-md border border-line px-2.5 py-2 text-left text-xs hover:bg-page"
              >
                <span className="flex items-center gap-2">
                  <span
                    className={`inline-block h-2 w-2 shrink-0 rounded-full ${dotColor(ev.type)}`}
                  />
                  <span className="font-semibold capitalize">
                    {label(ev.type)}
                  </span>
                  <span className="ml-auto shrink-0 tabular-nums text-muted">
                    day {ev.day}
                  </span>
                </span>
                <span className="mt-1 block text-muted">{ev.message}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
