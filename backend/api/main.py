"""FastAPI app: thin routes over the physics twin and the optimizer service. SIMULATION only.

Run from the backend folder:   uvicorn api.main:app --reload --port 8000
"""
from __future__ import annotations

import sys
import threading
from pathlib import Path
from typing import Any, Optional

BACKEND = Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from fastapi import Body, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from optimizer import service as sv
from physics import twin
from physics.config import MODEL_VERSION
from physics.credibility import credibility_dict
from physics.twin import _clean
from simdata.generator import measured_overlay

CORS_ALLOW_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"]

app = FastAPI(title="BaghTwin-X API", version="0.1.0",
              description="SIMULATION ONLY. Physics-informed digital twin and recommend-only optimizer (synthetic data).")
app.add_middleware(CORSMiddleware, allow_origins=CORS_ALLOW_ORIGINS,
                   allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
def _startup() -> None:
    threading.Thread(target=sv.warm_up, daemon=True).start()


def _bad(e: Exception) -> HTTPException:
    return HTTPException(status_code=422, detail=str(e))


def _srp_defaults(spm: Optional[float], stroke: Optional[float]):
    p = twin.active_params()
    return (p["spm_baseline"] if spm is None else spm), (p["stroke_baseline_m"] if stroke is None else stroke)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "simulation": True, "model_version": MODEL_VERSION}


@app.get("/api/well")
def well() -> dict:
    return _clean(twin.well_dict())


@app.get("/api/timeline")
def timeline(cycle: int = Query(4, ge=1, le=6), spm: Optional[float] = Query(None, ge=2.0, le=8.0),
             stroke: Optional[float] = Query(None, ge=1.5, le=3.0)) -> dict:
    spm, stroke = _srp_defaults(spm, stroke)
    return twin.simulate_cached(cycle, sv.default_css(cycle), spm, stroke).timeline_dict()


@app.get("/api/state")
def state(cycle: int = Query(4, ge=1, le=6), day: float = Query(100.0, ge=0, le=300),
          spm: Optional[float] = Query(None, ge=2.0, le=8.0), stroke: Optional[float] = Query(None, ge=1.5, le=3.0)) -> dict:
    spm, stroke = _srp_defaults(spm, stroke)
    return twin.simulate_cached(cycle, sv.default_css(cycle), spm, stroke).state_dict(day)


@app.post("/api/simulate")
def simulate(body: dict = Body(...)) -> dict:
    try:
        cycle = sv.validate_cycle(body.get("cycle", 4))
        css = sv.validate_css(body.get("css")) or sv.default_css(cycle)
        srp = sv.validate_srp(body.get("srp"))
    except (ValueError, KeyError, TypeError) as e:
        raise _bad(e)
    return twin.simulate_cycle(cycle, css, srp).simulate_dict()


@app.get("/api/measured")
def measured(cycle: int = Query(4, ge=1, le=4)) -> dict:
    return _clean(measured_overlay(cycle))


@app.post("/api/optimize")
def optimize(body: dict = Body(default={})) -> dict:
    try:
        req = dict(body or {})
        req["cycle"] = sv.validate_cycle(req.get("cycle", 4))
        req["css"] = sv.validate_css(req.get("css"))
        return sv.optimize(req)
    except (ValueError, KeyError, TypeError) as e:
        raise _bad(e)
    except RuntimeError as e:
        raise HTTPException(status_code=409, detail=str(e))


@app.get("/api/replay")
def replay(cycle: int = Query(4, ge=1, le=4)) -> dict:
    try:
        return sv.replay(cycle)
    except ValueError as e:
        raise _bad(e)


@app.get("/api/credibility")
def credibility() -> dict:
    return _clean(credibility_dict())


@app.post("/api/recommendations/approve")
def approve(body: dict = Body(...)) -> dict:
    try:
        return _clean(sv.record_decision(body.get("receipt"), body.get("decision", ""), body.get("reason", "")))
    except ValueError as e:
        raise _bad(e)


@app.get("/api/recommendations")
def recommendations() -> dict:
    return _clean(sv.list_recommendations())
