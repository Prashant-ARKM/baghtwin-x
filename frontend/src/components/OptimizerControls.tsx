"use client";

import type { OptimizeMode, OptimizeWeights } from "@/lib/api";

const WEIGHT_LABELS: { key: keyof OptimizeWeights; label: string; hint: string }[] = [
  { key: "oil", label: "Oil", hint: "reward more oil per cycle" },
  { key: "sor", label: "Steam-oil ratio", hint: "reward less steam per barrel" },
  { key: "energy", label: "Energy", hint: "reward lower kWh per barrel" },
  { key: "failure", label: "Failure cost", hint: "penalise rod-float / impact risk" },
  { key: "risk", label: "Risk", hint: "penalise probability of breaking limits" },
];

function WeightSlider({
  label,
  hint,
  value,
  onChange,
  disabled,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (v: number) => void;
  disabled: boolean;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between text-xs font-medium">
        <span title={hint}>{label}</span>
        <span className="tabular-nums text-muted">{value.toFixed(1)}</span>
      </span>
      <input
        type="range"
        min={0}
        max={5}
        step={0.5}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full cursor-pointer disabled:opacity-50"
        style={{ accentColor: "#1e5eff" }}
        aria-label={`${label} weight`}
      />
    </label>
  );
}

export default function OptimizerControls({
  mode,
  weights,
  currentDay,
  solving,
  onModeChange,
  onWeightChange,
  onDayChange,
  onRecommend,
}: {
  mode: OptimizeMode;
  weights: OptimizeWeights;
  currentDay: number;
  solving: boolean;
  onModeChange: (m: OptimizeMode) => void;
  onWeightChange: (key: keyof OptimizeWeights, v: number) => void;
  onDayChange: (day: number) => void;
  onRecommend: () => void;
}) {
  return (
    <section className="sticky top-[89px] rounded-xl border border-line bg-white p-5 shadow-card">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Plan configuration</h3>
        <span className="text-[11px] text-muted">cycle 4</span>
      </div>

      {/* Mode toggle */}
      <div className="mt-3 grid grid-cols-2 overflow-hidden rounded-md border border-line text-xs font-medium">
        <button
          onClick={() => onModeChange("srp_only")}
          disabled={solving}
          aria-pressed={mode === "srp_only"}
          className={`px-3 py-2 disabled:opacity-50 ${
            mode === "srp_only" ? "bg-accent text-white" : "bg-white text-muted hover:bg-page"
          }`}
        >
          Pump schedule only
        </button>
        <button
          onClick={() => onModeChange("joint")}
          disabled={solving}
          aria-pressed={mode === "joint"}
          className={`px-3 py-2 disabled:opacity-50 ${
            mode === "joint" ? "bg-accent text-white" : "bg-white text-muted hover:bg-page"
          }`}
        >
          Steam + pump
        </button>
      </div>

      {/* Weights */}
      <p className="eyebrow mt-7 mb-4">Optimization priorities</p>
      <div className="space-y-5">
        {WEIGHT_LABELS.map((w) => (
          <WeightSlider
            key={w.key}
            label={w.label}
            hint={w.hint}
            value={weights[w.key]}
            onChange={(v) => onWeightChange(w.key, v)}
            disabled={solving}
          />
        ))}
      </div>

      {/* Today slider (srp_only only) */}
      {mode === "srp_only" && (
        <label className="mt-4 block">
          <span className="flex items-baseline justify-between text-xs font-medium">
            Today is day
            <span className="tabular-nums text-muted">{currentDay}</span>
          </span>
          <input
            type="range"
            min={0}
            max={220}
            step={1}
            value={currentDay}
            disabled={solving}
            onChange={(e) => onDayChange(Number(e.target.value))}
            className="mt-1 w-full cursor-pointer disabled:opacity-50"
            style={{ accentColor: "#1e5eff" }}
            aria-label="Today is day"
          />
        </label>
      )}

      <button
        onClick={onRecommend}
        disabled={solving}
        className="primary-button mt-7 w-full !justify-center disabled:cursor-wait disabled:opacity-60"
      >
        {solving ? (
          <span className="inline-flex items-center justify-center gap-2">
            <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            Solving with the twin…
          </span>
        ) : (
          "Generate recommendation"
        )}
      </button>
      <p className="mt-2 text-[11px] leading-snug text-muted">
        {mode === "srp_only"
          ? "Searches pump schedules (SPM / stroke) against the twin. Usually ~1 s."
          : "Also re-designs the steam job. Slower (~8–15 s)."}
      </p>
    </section>
  );
}
