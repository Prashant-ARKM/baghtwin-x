# BaghTwin-X

Desktop decision-support demo for CSS (cyclic steam stimulation) and SRP (sucker-rod pump) operations on a synthetic heavy-oil well. The project is based on SIH 26120 and the Baghewala field context.

**This is a simulation, not a validated field twin.** All data is synthetic, every screen carries a SIMULATION badge, and recommendations require human review. Nothing is sent to a real well.

## Stack

- **Backend:** Python 3.11+, FastAPI, NumPy, SciPy (see `backend/requirements.txt`)
- **Frontend:** Next.js + TypeScript + Tailwind CSS + react-plotly.js
- **Storage:** in-memory state plus a JSON audit log (no database server)

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

Then open <http://localhost:3000>.

## Repo layout

```
backend/
  physics/     # thermal, viscosity, wellbore, pump and risk
  optimizer/   # constraints, search and engineering receipt
  simdata/     # synthetic well generator
  api/         # FastAPI routes
  tests/       # constraint, monotonicity and shape tests
frontend/      # Next.js desktop UI
```

The frontend reads all displayed engineering values from the FastAPI backend. The optimizer re-simulates its recommended plan against hard limits before presenting it for approval.
