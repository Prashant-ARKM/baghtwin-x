# BaghTwin-X

**A digital twin that plans the steam job and the pump together, so the rods stop floating.**

Smart India Hackathon 2026 · Problem Statement **SIH 26120** · Oil India Limited · Baghewala heavy-oil field

**Live demo:** https://baghtwin-x.vercel.app
*(The API runs on a free tier and sleeps when idle. The first load can take 20 to 30 seconds.)*

> **This is a simulation, not a validated field twin.** All data is synthetic, every screen carries a SIMULATION badge, and every recommendation needs human approval. Nothing is sent to a real well.

---

## The problem

Baghewala produces heavy crude (17 to 19° API) that barely flows at reservoir temperature. Two operations keep it producing:

- **CSS (Cyclic Steam Stimulation):** steam is injected to heat the reservoir.
- **SRP (Sucker Rod Pump):** the "nodding donkey" that lifts the oil.

Today the two are tuned **separately**. After steam injection the oil cools and thickens, and a pump set for hot, thin oil starts to struggle: the rods **float**, the pump slams into fluid, parts fail, and energy per barrel rises. Nobody sees this coming because steam decisions and pump decisions are never looked at together.

## What BaghTwin-X does

It follows the whole chain, day by day, and recommends settings for both:

```
Steam injected → Reservoir heats → Oil thins, then cools → Oil thickens
   → Pump and rods strain → Rods float → Cost and oil produced
```

1. **Predicts** temperature, oil thickness, oil rate, pump fill, rod loads and failure risk for every day of a cycle.
2. **Warns early** about rod float and fluid pound (about 10 days of lead time on the synthetic test wells).
3. **Recommends** the pump schedule (speed and stroke) and, optionally, the steam design (volume, pressure, soak days, cut-off day).
4. **Proves** the plan is safe: every recommended plan is re-simulated with the full physics model against hard limits.
5. **Explains** each recommendation with an engineering receipt, and logs every human decision.

### Results on the demo well (cycle 4, synthetic)

| | Do nothing | Follow the twin |
|---|---|---|
| Rod float probability | 100% | about 0% |
| Lowest pump fill (limit 45%) | 31% | 81% |
| Peak rod load (limit 60 kN) | 84 kN | 51 kN |
| Energy per barrel | 242 kWh | 230 kWh |
| Oil this cycle | 5,060 bbl | 5,060 bbl |

Pump-only advice keeps the oil and removes the failure. Steam and pump together trade a few percent of oil for a large gain in value per cycle-day.

| Check (all on synthetic data) | Result |
|---|---|
| Hard-constraint test | **0 violations in 72 re-checked plans** (21 scenarios) |
| Float early-warning | precision 83%, recall 100%, mean lead time 10.3 days |
| Held-out cycle prediction | MAE 1.59 bbl/d, 90% band coverage about 86% |
| Dynamometer-card rules | 97% accuracy |
| Automated tests | 50 |

These numbers show the method is **consistent**. They do not claim accuracy on the real field.

---

## Who it is for

| User | What they do | Where they look |
|---|---|---|
| Artificial-lift / production engineer | Watches wells daily, chooses pump settings | Overview, Risk, Optimizer |
| Field operator | Receives the alarm and makes the change | Overview, Optimizer |
| Asset / reservoir manager | Approves plans, cares about oil, steam-oil ratio, cost | Optimizer, Credibility, Audit |

The screens follow tools these people already use: a status strip, an alarm list, trends with limit lines, and the dynamometer card.

---

## The seven screens

| Tab | What you see |
|---|---|
| **Overview** | Well console (status strip, alarms, dynamometer card), the story in four steps, and a do-nothing versus follow-the-twin comparison. |
| **Well Twin** | Pick any day: temperature, oil thickness, oil rate, pump fill, dynamometer card, synchronised charts with injection, soak and production bands. |
| **Risk** | Float and fluid-pound probability, why risk rises, pump fill against its limit, a day slider with a plain-language explanation. |
| **Optimizer** | Choose Pump only or Steam + pump and set priorities. Get the schedule, trade-offs, constraint margins, an engineering receipt, and Approve or Reject with a reason. |
| **Replay** | The twin tested on a cycle it never saw during calibration, predicted against actual, with an uncertainty band. |
| **Credibility** | What is modelled and what is assumed, every parameter tagged Known, Estimated or Assumed, validity bounds, and all accuracy checks. |
| **Audit** | Every approve or reject decision with time, reason and the full receipt behind it. |

---

## How it works

**Physics twin** (`backend/physics`)
Steam injection sets the near-wellbore temperature, which sets oil viscosity and inflow. Inflow sets pump fill. Rod loads come from a damped wave equation along the rod string, solved per stroke. Risk combines the load margin, fill and their uncertainty into daily failure probabilities. Model parameters are calibrated on synthetic history, with uncertainty carried through.

**Optimizer** (`backend/optimizer`)
- Searches steam volume, injection pressure and soak days inside a trust region around current practice (Sobol sampling with local refinement).
- Plans the pump schedule with an exact dynamic programme over 5-day blocks (speed and stroke grids, bounded step changes, switching cost).
- Enforces hard limits day by day with an uncertainty margin: peak rod load 60 kN, pump fill at least 45%, float probability at most 20%.
- Re-simulates every final plan with the full twin against the margin-free limits and repairs it if needed.
- Supports a rolling horizon: choose today's date and the past stays fixed.
- Returns a Pareto set over oil per cycle-day, steam-oil ratio, energy and risk.
- No reinforcement learning. The optimizer is transparent and its limits are hard, not learned.

**Engineering receipt**
Current state, prediction if nothing is done, recommended action, reasons, constraint margins, confidence (from 20 calibration-uncertainty draws), what-if alternatives such as acting late, and an audit stub.

**Autonomy level:** L2, recommend-only. A human approves, and nothing is sent to the well.

---

## Tech stack

- **Backend:** Python 3.11+, FastAPI, Uvicorn, NumPy, SciPy, pytest
- **Frontend:** Next.js 14, TypeScript, Tailwind CSS, Plotly
- **Storage:** in-memory state plus a JSON audit log (no database server)
- **Hosting:** Render (API), Vercel (frontend)

---

## Run it locally

Backend, from `backend/`:

```bash
pip install -r requirements.txt
uvicorn api.main:app --port 8000
```

Frontend, from `frontend/`:

```bash
npm install
npm run dev
```

Open http://localhost:3000. The frontend expects the API at `http://localhost:8000`, or at `NEXT_PUBLIC_API_URL` if you set it.

Run the tests, from `backend/`:

```bash
pytest
```

They cover physics shapes and monotonicity, the synthetic data generator, the API, and a hard-constraint sweep over all optimizer modes.

## Deploy

**API on Render** (Web Service from this repo)

- Root Directory: `backend`
- Build Command: `pip install -r requirements.txt`
- Start Command: `uvicorn api.main:app --host 0.0.0.0 --port $PORT`
- Health Check Path: `/api/health`
- Environment: `CORS_ALLOW_ORIGINS=https://your-vercel-domain.vercel.app`

Keep a single worker. The free plan has 512 MB of memory.

**Frontend on Vercel**

- Root Directory: `frontend`
- Environment: `NEXT_PUBLIC_API_URL=https://your-render-service.onrender.com` (no trailing path)

---

## Repo layout

```
backend/
  api/         FastAPI routes
  physics/     thermal, viscosity, wellbore, pump, risk, calibration, credibility
  optimizer/   settings, evaluator, search, service (receipts, replay, audit)
  simdata/     synthetic well and sensor-data generator
  data/        calibration, constraint-test result, audit log
  tests/       physics, optimizer, data and API tests
frontend/
  src/app/         Overview, Well Twin, Risk, Optimizer, Replay, Credibility, Audit
  src/components/  charts, tables, receipt, well console
  src/lib/         API client and chart builders
```

---

## From demo to real use

The demo reads synthetic data through the same interfaces that real data would use. To run on real Baghewala data, replace the generator in `backend/simdata` with loaders for:

- production history and CSS cycle records
- steam injection parameters (volume, pressure, temperature, soak days)
- VFD and SRP operating data (SPM, stroke, motor load, dynamometer cards)
- rod failure and pump unsetting history
- well completion, reservoir, fluid property and pressure data

Then re-run calibration and replace the placeholder coefficients in `backend/optimizer/settings.py` (steam cost, oil price, risk cost, turnaround days) with Oil India's own values. The screens, optimizer and receipts run unchanged.

## Limitations

- Everything is synthetic. Accuracy on the real field is unknown until real data is used.
- Cost coefficients and engineering limits are placeholders for Oil India engineering to set.
- The twin is a single well with a simplified reservoir near the wellbore, not a full reservoir simulator.
- Recommend-only: no control of the well, and no per-role logins yet.
- The audit log is a local JSON file, and free-tier hosting may reset it.
