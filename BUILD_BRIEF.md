# BaghTwin-X Demo: Master Build Brief

**Every tool (Freebuff, ChatGPT, Codex, Claude) reads this file first. Do not deviate from the contract in Section 5 without telling the owner.**

SIH 26120 · Oil India Limited · Digital twin for CSS + SRP on heavy-oil wells, Baghewala.
Goal: a polished, believable DEMO that shows the causal chain and a joint optimizer. It is NOT a validated field twin. Every screen shows a SIMULATION label.

---

## 1. Story the demo must tell (in order)

1. Steam is injected. Near-wellbore temperature jumps, viscosity drops, the well flows easily.
2. Days pass. Temperature decays, viscosity climbs.
3. Thicker oil raises rod drag and lowers downstroke load. Pump fillage drops. Rod-float and impact-loading risk rises.
4. Fixed pump settings (current practice) run into a rod-float event.
5. The twin warns EARLY, recommends a bounded SPM/stroke change, shows the constraint margins, and simulates the outcome before approval.
6. For the next cycle, the twin recommends steam volume, injection pressure, soak time and production cut-off from a Pareto set (oil vs steam-oil ratio vs risk).
7. Operator approves; audit log records it. A replay compares baseline vs twin recommendation.
8. Credibility panel states honestly what is modelled, what is assumed, and what a field pilot must confirm.

## 2. Non-negotiables

- One synthetic well. No invented "real" Baghewala telemetry. Synthetic data is labelled.
- Every parameter carries a tag: **Known / Estimated / Assumed**, with unit and source note.
- Physics and optimizer are deterministic Python modules with NO web code inside. UI never computes engineering numbers.
- Optimizer must never output a point that violates a hard constraint. Automated test required.
- Recommend-only (operator approves). No autonomous control claims.
- No percentage-improvement claims. Show simulated deltas with a SIMULATION label.
- No Three.js, no database server, no auth. Keep it small.

## 3. Stack

- **Frontend:** Next.js + TypeScript + Tailwind, Plotly.js (react-plotly.js) for charts, plain SVG + CSS animation for the pump. clean light professional theme.
- **Backend:** Python 3.11+, FastAPI, NumPy, SciPy. scikit-learn only if time allows (rules-based first).
- **Storage:** in-memory plus a JSON file for the audit log. No database server.
- **Run:** backend on port 8000, frontend on port 3000, CORS allowed for localhost:3000.

## 4. Repo layout and file ownership

- `backend/physics/` thermal, viscosity, wellbore, pump, risk (owner: Claude)
- `backend/optimizer/` constraints, search, receipt (owner: Claude)
- `backend/simdata/` synthetic well generator (owner: Claude)
- `backend/api/` FastAPI routes matching Section 5 (owner: Freebuff)
- `backend/tests/` constraint, monotonicity and shape tests (owner: Claude writes, Freebuff runs)
- `frontend/` all UI (owner: Freebuff, ChatGPT for styling)
- `BUILD_BRIEF.md` this file, `README.md` run instructions

---

## 5. API contract (source of truth)

Units everywhere: temperature °C, viscosity cP, pressure MPa, steam volume m³ (cold-water equivalent), time in days unless stated, SPM strokes/min, stroke length m, load kN, rates bbl/day. Every response includes a `simulation: true` field and a `model_version` string.

### GET /api/well
Returns the well configuration and the parameter list.
- `well`: id, name, depth_m, pump_type ("conventional" or "hydraulic"), plunger_diameter_mm, rod_string_description
- `parameters`: list of {name, value, unit, tag, note}

### GET /api/timeline?cycle=<int>&spm=<float>&stroke=<float>
Returns day-by-day arrays for one CSS cycle under the given pump settings (defaults are the fixed baseline settings).
- `days`: array
- `temperature_c`, `viscosity_cp`, `oil_rate_bpd`, `fillage`, `min_downstroke_load_kn`, `peak_load_kn`, `float_probability`: arrays aligned with `days`
- `phases`: list of {name, start_day, end_day} (injection, soak, production)
- `events`: list of {day, type, message} (for example a rod-float event)
- `alert_day`: first day risk crosses the alert threshold, or null
- `float_event_day`: day the float event occurs, or null

### GET /api/state?cycle=<int>&day=<float>&spm=<float>&stroke=<float>
Snapshot at one day, used for the live Well Twin view.
- `temperature_c`, `viscosity_cp`, `mobility_factor`, `inflow_bpd`, `fillage`, `volumetric_efficiency`
- `card`: {position: array, load: array} (dynamometer card)
- `float_probability`, `risk_level` ("low", "elevated", "high"), `risk_reason` (short physical explanation)
- `constraint_margins`: list of {name, value, limit, margin_pct, active}

### POST /api/simulate
Body: {cycle, css: {steam_volume_m3, injection_pressure_mpa, soak_days, cutoff_day}, srp: {spm, stroke_m}}
Returns the same arrays as /api/timeline plus totals: `cumulative_oil_bbl`, `sor`, `energy_kwh_per_bbl`, `max_float_probability`, `constraint_violations` (list, empty if safe).

### POST /api/optimize
Body: {cycle, mode ("srp_only" or "joint"), weights: {oil, sor, energy, failure, risk}, current_day (for srp_only)}
Returns:
- `pareto`: list of {css, srp, oil_bbl, sor, energy, risk, feasible}
- `recommended`: {css, srp, oil_bbl, sor, energy, risk}
- `baseline`: same shape, for the fixed current settings
- `active_constraints`: list of names
- `receipt`: {current_state, prediction_no_action, recommended_action, why, constraint_margins, confidence, what_if, audit_stub}
- `trajectories`: {no_action: timeline arrays, with_action: timeline arrays}

### GET /api/replay?cycle=<int>
Returns baseline vs twin-recommended timelines for a held-out cycle, with `predicted_vs_actual` arrays for oil rate, `mae`, `rmse`, `interval_coverage`, and headline deltas (oil, SOR, energy, risk) labelled simulated.

### GET /api/credibility
Returns `modelled_vs_assumed` (component, method, status, limitation), `parameters` (with tags), `validity_bounds`, and `metrics` (prediction error, detector precision/recall/false alarms/lead time, constraint-violation test result).

### POST /api/recommendations/approve
Body: {receipt, decision ("approve" or "reject"), reason}. Appends to the audit log (JSON file). Returns the stored entry with id and timestamp.

### GET /api/recommendations
Returns the audit log.

---

## 6. Default parameters (all tagged Assumed unless noted)

Starting values only. The physics owner may tune them so the story works. Keep them in one config file.

- Depth 1150 m (Known, OIL public info). Oil gravity about 17-19 API (Known). Steam temperature 250-320 °C (Known, OIL public info).
- Reservoir temperature: 55 °C (Assumed).
- Peak near-wellbore temperature after injection: roughly 180-220 °C depending on steam volume (Assumed).
- Thermal decay constant k: about 0.015-0.03 per day, degrading slightly each cycle (Assumed).
- Viscosity: about 15 cP near 200 °C rising to about 3000 cP near reservoir temperature (Assumed, Arrhenius-type curve).
- Pump: plunger 44 mm, stroke range 1.5-3.0 m, SPM range 2-8, baseline SPM 6 and stroke 2.7 m (Assumed).
- Hard limits (owner tag: engineering authority): injection pressure ≤ 12 MPa, peak polished-rod load ≤ 90 kN, minimum fillage ≥ 0.45, float probability ≤ 0.20 (alert at 0.10).
- Prices (placeholders): oil value, steam cost, power cost, failure cost. Editable via config.

---

## 7. Screens (frontend)

Layout: dark theme, left sidebar tabs, permanent SIMULATION badge in the header.

1. **Well Twin:** day slider and Play button (animates through the cycle), SVG pump synced to SPM, temperature and viscosity plots with a moving marker, live dynamometer card, constraint margin bars.
2. **Risk:** float probability over time, alert line, shaded event day, plain-language reason, and a "fixed settings vs twin" toggle.
3. **Optimizer:** sliders for steam, pressure, soak, cut-off, SPM, stroke. Live simulate results (oil, SOR, energy, risk). "Optimize" button shows a Pareto scatter, the recommended point, active constraints, and the engineering receipt with Approve and Reject.
4. **Replay and Credibility:** baseline vs recommendation chart, error metrics, the modelled-vs-assumed table, parameter tags, audit log.
5. **Traceability (small section):** table mapping each line of the SIH statement to the feature that answers it.

A guided "Demo mode" button runs the story in Section 1 automatically.

---

## 8. Definition of done

- [ ] Backend starts, all endpoints in Section 5 return valid data
- [ ] Risk visibly rises during cooling and the alert fires before the float event
- [ ] Optimizer output never violates a hard constraint (test passes)
- [ ] All four main tabs work against the real API
- [ ] Demo mode runs end to end without manual steps
- [ ] SIMULATION label and parameter tags visible
- [ ] README with two commands to run everything
- [ ] Screen recording of the demo saved as fallback

## 9. Rules for every tool

- Work on one module or one tab at a time.
- Do not change the contract in Section 5. If something is missing, say what and why.
- Send back only the changed function or file. Do not rewrite unrelated code.
- When something breaks, paste the exact error and the relevant function only.
