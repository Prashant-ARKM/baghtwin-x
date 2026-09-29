/**
 * Typed client for the BaghTwin-X FastAPI backend (source of truth: BUILD_BRIEF.md §5).
 * Every number rendered by the UI comes from these calls — nothing is mocked.
 * The backend marks every response with simulation: true.
 */

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/** Model version echoed by the API (e.g. "baghtwin-physics-0.1.0"). */
export type ModelVersion = string;

export class ApiError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      cache: "no-store",
      ...init,
    });
  } catch {
    throw new ApiError(
      `Cannot reach the backend at ${API_BASE_URL}. Is it running? (uvicorn api.main:app --port 8000)`
    );
  }
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (body?.detail) detail = String(body.detail);
    } catch {
      /* keep default detail */
    }
    throw new ApiError(`API request failed (${path}): ${detail}`, response.status);
  }
  return (await response.json()) as T;
}

// ---------------------------------------------------------------------------
// Types (match the FastAPI responses; nulls appear during injection/soak)
// ---------------------------------------------------------------------------

export type PhaseName = "injection" | "soak" | "production";
export type RiskLevel = "low" | "elevated" | "high";

export type Phase = { name: PhaseName; start_day: number; end_day: number };
export type TimelineEvent = { day: number; type: string; message: string };

export type HealthResponse = {
  status: string;
  simulation: boolean;
  model_version: string;
};

export type TimelineResponse = {
  simulation: true;
  model_version: string;
  cycle: number;
  days: number[];
  temperature_c: (number | null)[];
  viscosity_cp: (number | null)[];
  oil_rate_bpd: (number | null)[];
  fillage: (number | null)[];
  min_downstroke_load_kn: (number | null)[];
  peak_load_kn: (number | null)[];
  float_probability: (number | null)[];
  impact_probability: (number | null)[];
  spm: number[];
  stroke_m: number[];
  liquid_rate_bpd: (number | null)[];
  pump_intake_mpa: (number | null)[];
  tubing_viscosity_cp: (number | null)[];
  phases: Phase[];
  events: TimelineEvent[];
  alert_day: number | null;
  float_event_day: number | null;
};

export type ConstraintMargin = {
  name: string;
  value: number;
  limit: number;
  margin_pct: number;
  active: boolean;
  violated: boolean;
};

export type StateResponse = {
  simulation: true;
  model_version: string;
  cycle: number;
  day: number;
  phase: PhaseName;
  temperature_c: number;
  viscosity_cp: number;
  mobility_factor: number;
  inflow_bpd: number;
  liquid_rate_bpd: number | null;
  oil_rate_bpd: number | null;
  pump_intake_mpa: number | null;
  tubing_viscosity_cp: number;
  spm: number;
  stroke_m: number;
  fillage: number | null;
  volumetric_efficiency: number | null;
  card: { position: number[]; load: number[] };
  float_probability: number;
  risk_level: RiskLevel;
  risk_reason: string;
  constraint_margins: ConstraintMargin[];
};

export type MeasuredResponse = {
  simulation: true;
  synthetic: true;
  cycle: number;
  days: number[];
  temperature_meas_c: (number | null)[];
  oil_meas_bpd: (number | null)[];
  mprl_meas_kn: (number | null)[];
  downtime: boolean[];
};

export type WellParameter = {
  name: string;
  value: number;
  unit: string;
  tag: "Known" | "Estimated" | "Assumed";
  note: string;
};

export type WellResponse = {
  simulation: true;
  model_version: string;
  well: {
    id: string;
    name: string;
    pump_type: string;
    rod_string_description: string;
    depth_m: number;
    plunger_diameter_mm: number;
    buoyant_rod_weight_kn: number;
  };
  parameters: WellParameter[];
};

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

export function fetchHealth(): Promise<HealthResponse> {
  return requestJson<HealthResponse>("/api/health");
}

/** cycle 1-4; spm/stroke omitted = fixed baseline settings. */
export function fetchTimeline(cycle: number): Promise<TimelineResponse> {
  return requestJson<TimelineResponse>(`/api/timeline?cycle=${cycle}`);
}

/** Debounced by the caller (150 ms) while sliding. */
export function fetchState(cycle: number, day: number): Promise<StateResponse> {
  return requestJson<StateResponse>(
    `/api/state?cycle=${cycle}&day=${day.toFixed(2)}`
  );
}

/** Noisy synthetic sensor overlay (may contain nulls). */
export function fetchMeasured(cycle: number): Promise<MeasuredResponse> {
  return requestJson<MeasuredResponse>(`/api/measured?cycle=${cycle}`);
}

export function fetchWell(): Promise<WellResponse> {
  return requestJson<WellResponse>("/api/well");
}

// ---------------------------------------------------------------------------
// Optimizer (POST /api/optimize) + audit (POST /api/recommendations/approve)
// ---------------------------------------------------------------------------

export type OptimizeMode = "srp_only" | "joint";

export type OptimizeWeights = {
  oil: number;
  sor: number;
  energy: number;
  failure: number;
  risk: number;
};

export type CssDesign = {
  steam_volume_m3: number;
  injection_pressure_mpa: number;
  soak_days: number;
  cutoff_day: number;
};

export type ScheduleBlock = {
  start_day: number;
  end_day: number;
  spm: number;
  stroke_m: number;
};

/** One candidate plan (baseline, recommended and every pareto point). */
export type OptimizePlan = {
  css: CssDesign;
  srp: ScheduleBlock[];
  oil_bbl: number;
  oil_per_cycle_day?: number;
  sor: number;
  energy: number;
  risk: number;
  feasible: boolean;
  violations: string[];
  max_float_probability: number;
  min_fillage: number;
  max_peak_load_kn: number;
  value_per_cycle_day: number;
  net_value_usd?: number;
  label?: string;
  is_recommended?: boolean;
};

export type HeadlineMetric = {
  baseline: number;
  recommended: number;
  delta: number;
  delta_pct: number;
};

export type OptimizeHeadline = {
  oil_bbl: HeadlineMetric;
  oil_per_cycle_day?: HeadlineMetric;
  sor: HeadlineMetric;
  energy_kwh_per_bbl: HeadlineMetric;
  risk: HeadlineMetric;
  net_value_usd?: HeadlineMetric;
  value_per_cycle_day: HeadlineMetric;
};

/** Same arrays as /api/timeline (subset used by the Optimizer charts). */
export type Trajectory = {
  simulation: true;
  model_version: string;
  cycle: number;
  days: number[];
  float_probability: (number | null)[];
  fillage: (number | null)[];
  oil_rate_bpd: (number | null)[];
  peak_load_kn: (number | null)[];
  min_downstroke_load_kn: (number | null)[];
  spm: (number | null)[];
  stroke_m: (number | null)[];
  temperature_c: (number | null)[];
  alert_day: number | null;
  float_event_day: number | null;
  events?: TimelineEvent[];
};

export type CssChange = {
  variable: string;
  from: number;
  to: number;
  unit: string;
};

export type ConfidenceDraws = {
  n_draws: number;
  oil_bbl_p05: number;
  oil_bbl_p50: number;
  oil_bbl_p95: number;
  violation_fraction: number;
  worst_max_float_probability: number;
};

export type WhatIfRow = {
  label: string;
  oil_bbl: number;
  sor: number;
  energy: number;
  max_float_probability: number;
  min_fillage: number;
  value_per_cycle_day?: number;
  violations: string[];
};

export type AuditStub = {
  status: string;
  autonomy_level: string;
  simulation: boolean;
  model_version: string;
  created_utc: string;
  input_hash: string;
  cycle: number;
  mode: OptimizeMode;
  weights: OptimizeWeights;
  [key: string]: unknown;
};

export type EngineeringReceipt = {
  current_state: {
    day: number;
    phase: string;
    temperature_c: number;
    viscosity_cp: number;
    tubing_viscosity_cp: number;
    oil_rate_bpd: number;
    fillage: number;
    float_probability: number;
    risk_level: RiskLevel;
    spm: number;
    stroke_m: number;
  };
  prediction_no_action: {
    alert_day: number | null;
    float_event_day: number | null;
    first_limit_violation_day?: number | null;
    events?: TimelineEvent[];
    max_float_probability: number;
    min_fillage: number;
    max_peak_load_kn: number;
    oil_bbl: number;
    violations: string[];
  };
  recommended_action: {
    mode: OptimizeMode;
    effective_day: number;
    css_changes: CssChange[];
    schedule: ScheduleBlock[];
    schedule_text: string;
    next_setpoint: { spm: number; stroke_m: number; from_day: number } | null;
    autonomy: string;
  };
  why: string[];
  constraint_margins: ConstraintMargin[];
  uncertainty_margin_frac: number;
  confidence: {
    level: "high" | "medium" | "low";
    recommended: ConfidenceDraws;
    no_action: ConfidenceDraws;
    basis: string;
  };
  what_if: WhatIfRow[];
  audit_stub: AuditStub;
};

export type OptimizeResponse = {
  simulation: true;
  model_version: string;
  cycle: number;
  mode: OptimizeMode;
  current_day: number;
  weights: OptimizeWeights;
  cache_hit?: boolean;
  baseline: OptimizePlan;
  recommended: OptimizePlan;
  pareto: OptimizePlan[];
  headline: OptimizeHeadline;
  active_constraints: string[];
  trajectories: { no_action: Trajectory; with_action: Trajectory };
  receipt: EngineeringReceipt;
  search?: Record<string, unknown>;
};

export function postOptimize(body: {
  cycle: number;
  mode: OptimizeMode;
  weights: OptimizeWeights;
  current_day: number;
}): Promise<OptimizeResponse> {
  return requestJson<OptimizeResponse>("/api/optimize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export type ApprovalResponse = {
  id?: string | number;
  timestamp?: string;
  timestamp_utc?: string;
  decision?: string;
  reason?: string;
  status?: string;
  receipt?: unknown;
  [key: string]: unknown;
};

export function approveRecommendation(body: {
  receipt: unknown;
  decision: "approve" | "reject";
  reason: string;
}): Promise<ApprovalResponse> {
  return requestJson<ApprovalResponse>("/api/recommendations/approve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}


// ---------------------------------------------------------------------------
// Replay, Credibility, Audit
// ---------------------------------------------------------------------------

export type DeltaMetric = {
  baseline: number;
  recommended: number;
  delta: number;
  delta_pct: number | null;
};

export type ReplayResponse = {
  simulation: true;
  synthetic: true;
  model_version: string;
  cycle: number;
  held_out: boolean;
  days: number[];
  predicted_vs_actual: {
    predicted_oil_bpd: (number | null)[];
    lo_bpd: (number | null)[];
    hi_bpd: (number | null)[];
    actual_oil_bpd: (number | null)[];
  };
  mae: number;
  rmse: number;
  mape_pct: number;
  interval_coverage: number;
  mae_uncalibrated_bpd: number;
  baseline: Trajectory;
  recommended: Trajectory;
  recommended_schedule: ScheduleBlock[];
  plant_proxy_check: {
    description: string;
    baseline: OptimizePlan;
    recommended: OptimizePlan;
  };
  headline_deltas: Record<string, DeltaMetric>;
  label: string;
};

export function fetchReplay(cycle: number): Promise<ReplayResponse> {
  return requestJson<ReplayResponse>(`/api/replay?cycle=${cycle}`);
}

export type CredibilityParameter = WellParameter & { fitted_scale?: number };

export type CredibilityResponse = {
  simulation: true;
  synthetic: boolean;
  model_version: string;
  modelled_vs_assumed: {
    component: string;
    method: string;
    status: string;
    limitation: string;
  }[];
  parameters: CredibilityParameter[];
  validity_bounds: Record<string, unknown>;
  metrics: Record<string, Record<string, unknown>>;
  caveats?: string[];
};

export function fetchCredibility(): Promise<CredibilityResponse> {
  return requestJson<CredibilityResponse>("/api/credibility");
}

export type AuditEntry = {
  id: number;
  timestamp_utc: string;
  decision: "approve" | "reject";
  reason: string;
  autonomy_level: string;
  model_version: string;
  receipt: EngineeringReceipt;
};

export type RecommendationsResponse = {
  simulation: true;
  model_version: string;
  entries: AuditEntry[];
};

export function fetchRecommendations(): Promise<RecommendationsResponse> {
  return requestJson<RecommendationsResponse>("/api/recommendations");
}
