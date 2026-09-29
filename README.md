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

## Deploy it

Deploy the API as a Render Web Service and the Next.js app as a Vercel project.
This keeps the Python simulation service separate from the desktop frontend.

### 1. Deploy the API on Render

Create a new Web Service from `Prashant-ARKM/baghtwin-x`, using these settings:

- Root Directory: `backend`
- Runtime: `Python 3`
- Build Command: `pip install -r requirements.txt`
- Start Command: `uvicorn api.main:app --host 0.0.0.0 --port $PORT`
- Health Check Path: `/api/health`

After the deploy finishes, copy the service URL, for example
`https://baghtwin-x-api.onrender.com`.

Add this Render environment variable, replacing the value with your Vercel URL
after the frontend is created:

```text
CORS_ALLOW_ORIGINS=https://baghtwin-x.vercel.app
```

### 2. Deploy the frontend on Vercel

Import the same GitHub repository into Vercel. Set the project Root Directory to
`frontend`, keep the detected Next.js build settings, and add this Production
environment variable:

```text
NEXT_PUBLIC_API_URL=https://baghtwin-x-api.onrender.com
```

Deploy the project. Copy the resulting Vercel URL back into Render’s
`CORS_ALLOW_ORIGINS` variable and redeploy the API once.

Open the Vercel URL and confirm the Overview page loads data. Test the API
directly at `<render-url>/api/health` if the frontend shows a connection error.

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
