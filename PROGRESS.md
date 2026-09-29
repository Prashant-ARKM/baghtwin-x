# PROGRESS — BaghTwin-X

## Session 1 — shell + Well Twin tab (done)

- App shell: light professional theme (white/very light grey, slate text, single
  blue accent `#1e5eff`), top bar with title "BaghTwin-X", subtitle
  "Well-to-surface digital twin, Baghewala (demo)" and a permanent amber
  "SIMULATION — synthetic data" badge.
- Tabs in the sidebar: Well Twin | Risk | Optimizer | Replay | Credibility |
  Audit. Well Twin and Optimizer are built; the rest render an empty
  "coming next" card. `/` redirects to `/well-twin`.
- `src/lib/api.ts`: typed fetch client for `/api/health`, `/api/timeline`,
  `/api/state`, `/api/measured`, `/api/well`, and (session 2) `/api/optimize`
  and `/api/recommendations/approve`. Base URL from `NEXT_PUBLIC_API_URL`
  (default `http://localhost:8000`). Clear error card with a Retry button when
  the backend is unreachable. Loading skeletons for every chart and list. No
  mocked data anywhere — every number comes from the API.
- Well Twin tab (cycle selector 1–4, default 4; baseline pump settings):
  - Day slider (0 → last day) with injection/soak/production phase bands and
    event ticks; state requests debounced 150 ms.
  - Left column: KPI cards for the selected day (phase, temperature, tubing
    viscosity, oil rate, fillage) plus float probability with a green/amber/red
    risk chip from `risk_level` and `risk_reason` as a sentence under it.
  - Center: Plotly dynamometer card ("Surface dynamometer card (simulated)",
    closed loop) and 4 synchronized time-series charts sharing the day axis,
    with shaded phases and a vertical line at the selected day: temperature
    (+ sensor overlay), viscosity (log y), oil rate (+ sensor overlay), rod
    loads (min downstroke & peak, 0 kN line, 60 kN limit) with float
    probability on a secondary axis (dashed 10% alert / 20% limit lines).
  - Sensor overlay toggle "Show sensor data" (grey markers from
    `/api/measured`).
  - Right column: "Constraint margins" (bar per `margin_pct`, red if violated,
    amber if active) and an "Events" list; clicking an event jumps the slider.
  - One-line plain-words caption under every chart. Chart points are clickable
    to move the day line.
- Plotly wiring: `plotly.js-dist-min` rendered through `react-plotly.js/factory`
  and loaded browser-only via `next/dynamic` (`ssr: false`) so prerender never
  evaluates the UMD bundle; types come from `@types/plotly.js` via
  `src/types/plotly-dist-min.d.ts`.
- Definition-of-done spot-checks against the live API (cycle 4): day 110 →
  `risk_level: "high"` (red chip), fillage 0.408 (< 45%), float event day 113
  (alert day 99). `npm run build` passes with no TypeScript errors; dev server
  serves all six tabs.

## Session 2 — Optimizer tab (done)

- POST `/api/optimize` integration (srp_only ~1 s, joint ~8–15 s) with a
  "Solving with the twin…" progress state; the Recommend button and all
  controls are disabled while solving. 422/409 messages surface in the error
  card with Retry.
- Controls card: mode toggle (Pump schedule only / Steam + pump), five weight
  sliders 0–5 step 0.5 (Oil, Steam-oil ratio, Energy, Failure cost, Risk,
  default 1), "Today is day N" slider (0–220) in srp_only mode.
- Headline cards after a result: Oil, SOR, Energy per bbl, Failure risk, Value
  per cycle-day — each baseline → recommended with a delta% chip (green if the
  metric improved, red if it got worse). Status line pair: "No action: N hard
  limits breached" (red, lists the violation names) vs "Recommended plan: all
  hard limits respected" (green) straight from `violations[]` / `feasible`.
- Chart row "No action vs recommended" (grey = no action, blue =
  recommended): SPM step chart, float probability (dashed 10% alert / 20%
  limit lines), fillage (45% minimum line), peak load (60 kN limit line).
  Nulls draw as gaps.
- Pump schedule table from `recommended.srp` and CSS design changes table from
  `receipt.recommended_action.css_changes` (shows "No steam design change" in
  srp_only mode; four changes in joint mode).
- Pareto scatter: x = SOR, y = oil per cycle-day (oil_bbl / (cutoff_day + 20)),
  marker colour = risk (green→amber→red scale), recommended point ringed,
  baseline as a grey cross, hover shows label / oil / SOR / energy / float.
  Caption: "Each point is a feasible plan; nothing in this set breaks a hard
  limit."
- Constraint panel from `receipt.constraint_margins` with an "active" chip for
  names in `active_constraints` (srp_only default: spm_min, stroke_max_m).
- ENGINEERING RECEIPT card: current state, prediction if no action, recommended
  action (+ next setpoint + autonomy line), "Why" as a numbered list,
  confidence chip (high/medium/low) with draw percentiles and the basis
  sentence, what-if table with red violation cells, uncertainty-margin badge,
  and the footer "Recommend-only (L2). A human must approve. Nothing is sent to
  the well."
- Approve / Reject with required reason text box → POST
  `/api/recommendations/approve` with the exact receipt object; success shows
  the returned id and timestamp; errors show in red inline.
- Verified against the live API: srp_only defaults → baseline breaches
  peak_load_kn, min_fillage, float_probability (3) and recommended respects
  all; no-action float probability peaks at ~100% while the recommended curve
  stays under 9.3%; joint mode returns 4 steam design changes. `npm run build`
  passes with no TypeScript errors.

## Next up (suggested order)

1. Risk tab: float-probability chart with alert/limit lines, event shading,
   plain-language reason, "fixed settings vs twin" toggle.
2. Replay tab: `/api/replay` baseline vs recommendation, predicted-vs-actual
   metrics.
3. Credibility + Audit tabs: `/api/credibility` table and parameter tags,
   `/api/recommendations` audit log.
4. Demo mode button that walks the Section-1 story; README run instructions;
   screen recording fallback.
