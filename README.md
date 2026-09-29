# BaghTwin-X Demo

Digital twin demo for CSS (cyclic steam stimulation) + SRP (rod pump) on
heavy-oil wells — SIH 26120, Oil India Limited, Baghewala.

**This is a polished, believable DEMO, not a validated field twin.** All data
is synthetic and every screen carries a SIMULATION badge. The backend runs on
port 8000 and the frontend on port 3000 (CORS allowed for localhost:3000).

## Stack

- **Backend:** Python 3.11+, FastAPI, NumPy, SciPy (see `backend/requirements.txt`)
- **Frontend:** Next.js + TypeScript + Tailwind CSS + react-plotly.js
- **Storage:** in-memory + JSON audit log (no database server)

## Run it (two commands)

**1. Backend** (from `backend/`):

```bash
pip install -r requirements.txt
uvicorn api.main:app --port 8000
```

**2. Frontend** (from `frontend/`):

```bash
npm install
npm run dev
```

Then open <http://localhost:3000> — the home page shows **Backend connected**
when the API on port 8000 is reachable.

## Repo layout (BUILD_BRIEF Section 4)

```
backend/
  physics/     # thermal, viscosity, wellbore, pump, risk (owner: Claude)
  optimizer/   # constraints, search, receipt (owner: Claude)
  simdata/     # synthetic well generator (owner: Claude)
  api/         # FastAPI routes matching the Section 5 contract (owner: Freebuff)
  tests/       # constraint, monotonicity and shape tests
frontend/      # all UI (owner: Freebuff)
```

`physics/`, `optimizer/` and `simdata/` are intentional placeholders in this
skeleton — physics is not implemented yet.

## Contract

`BUILD_BRIEF.md` Section 5 is the source of truth for the API. The skeleton
ships `GET /api/health` only; the remaining routes are wired in the next step.
