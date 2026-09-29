"""Credibility payload for GET /api/credibility: what is modelled, what is assumed, how well it does.

All metrics are computed on SYNTHETIC data and labelled as such. They show internal consistency,
not accuracy on Baghewala. The constraint-violation test result is written by the optimizer tests
(backend/data/constraint_test.json) and read here.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Dict, List

import numpy as np

from . import calibration as cal
from . import risk, twin
from .config import DEFAULT_PARAMS, MODEL_VERSION

try:
    from ..simdata.generator import card_dataset, true_params
except ImportError:
    from simdata.generator import card_dataset, true_params

CONSTRAINT_TEST_FILE = Path(__file__).resolve().parent.parent / "data" / "constraint_test.json"

MODELLED_VS_ASSUMED: List[Dict[str, str]] = [
    {"component": "Near-wellbore heating", "method": "Steam-table energy, Marx-Langenheim efficiency, heated-zone radius",
     "status": "Modelled (simplified)", "limitation": "Ignores gravity override, heterogeneity, steam-quality variation."},
    {"component": "Cooling after injection", "method": "Exponential decay toward reservoir temperature, rate set by heated radius and cycle age",
     "status": "Modelled (reduced-order)", "limitation": "Decay constant is fitted to synthetic data, not to Baghewala."},
    {"component": "Viscosity vs temperature", "method": "Arrhenius/Andrade-type curve",
     "status": "Assumed parameters", "limitation": "Must be fitted to OIL lab data in a pilot."},
    {"component": "Inflow", "method": "Two-zone composite radial model (heated + cold zone), linear IPR",
     "status": "Modelled (simplified)", "limitation": "No multiphase flow, no gas, constant water cut."},
    {"component": "Wellbore temperature loss", "method": "Linear profile pump-to-surface with a VIT loss fraction",
     "status": "Assumed", "limitation": "Real VIT performance varies per well."},
    {"component": "Rod loads", "method": "Damped wave equation solved in the frequency domain (Gibbs-style), single rod section",
     "status": "Modelled (simplified)", "limitation": "No taper, deviation or tubing movement; fluid-load transfer follows a rod-stretch ramp."},
    {"component": "Rod float", "method": "Minimum downstroke load screen: P(min load <= 0) with an assumed uncertainty",
     "status": "Modelled (screen)", "limitation": "Drag enhancement and uncertainty are assumed; thresholds belong to engineering."},
    {"component": "Impact loading", "method": "Fluid pound from pump fillage (load carried until plunger meets liquid)",
     "status": "Modelled (simplified)", "limitation": "No gas interference or valve dynamics."},
    {"component": "Failure cost", "method": "Hazard proportional to float and impact risk",
     "status": "Illustrative", "limitation": "Real failure labels are rare and noisy."},
    {"component": "Economics", "method": "Placeholder prices and costs",
     "status": "Assumed", "limitation": "Replace with OIL figures."},
]

VALIDITY_BOUNDS = {
    "steam_volume_m3": {"min": 800, "max": 2600, "unit": "m3 CWE"},
    "injection_pressure_mpa": {"min": 4.0, "max": 12.0, "unit": "MPa"},
    "soak_days": {"min": 3, "max": 14, "unit": "days"},
    "cutoff_day": {"min": 120, "max": 300, "unit": "days since injection start"},
    "spm": {"min": 2.0, "max": 8.0, "unit": "strokes/min"},
    "stroke_m": {"min": 1.5, "max": 3.0, "unit": "m"},
    "cycle": {"min": 1, "max": 6, "unit": "-"},
    "near_wellbore_temperature_c": {"min": 55, "max": 260, "unit": "degC"},
    "viscosity_cp": {"min": 10, "max": 3500, "unit": "cP"},
    "note": "Ranges exercised by the model and the synthetic data. The optimizer never leaves them.",
}


@lru_cache(maxsize=1)
def detector_metrics() -> dict:
    """Twin alerts (calibrated params) vs synthetic-truth float events over a grid of cycles and pump settings."""
    truth_p, twin_p = true_params(), twin.active_params()
    settings = [(6.0, 2.7), (7.0, 2.7), (5.0, 2.7), (4.0, 2.7), (3.0, 2.7), (6.0, 2.0)]
    tp = fp = fn = tn = 0
    leads: List[float] = []
    n = 0
    for cyc in (1, 2, 3, 4):
        for spm, stroke in settings:
            srp = {"spm": spm, "stroke_m": stroke}
            truth = twin.simulate_cycle(cyc, None, srp, truth_p)
            est = twin.simulate_cycle(cyc, None, srp, twin_p)
            ev, al = truth.float_event_day(), est.alert_day()
            n += 1
            if ev is not None and al is not None and al <= ev:
                tp += 1
                leads.append(ev - al)
            elif ev is not None:
                fn += 1
            elif al is not None:
                fp += 1
            else:
                tn += 1
    return {
        "scenarios": n, "true_positive": tp, "false_negative": fn, "false_alarm": fp, "true_negative": tn,
        "precision": tp / (tp + fp) if tp + fp else None,
        "recall": tp / (tp + fn) if tp + fn else None,
        "mean_lead_time_days": float(np.mean(leads)) if leads else None,
        "min_lead_time_days": float(np.min(leads)) if leads else None,
        "note": "Twin alert (10 % float probability) vs float event in a hidden synthetic truth; 4 cycles x 6 pump settings.",
    }


@lru_cache(maxsize=1)
def card_rule_metrics() -> dict:
    """Card rules on noisy synthetic cards; fillage input carries 0.03 estimation noise."""
    rng = np.random.default_rng(5)
    cards = card_dataset(n_sims=40, seed=11)
    conf: Dict[str, Dict[str, int]] = {}
    ok = 0
    for c in cards:
        fill_est = float(np.clip(c["fillage"] + rng.normal(0.0, 0.03), 0.0, 1.0))
        pred = risk.classify_card(c["position_m"], c["load_n"], c["w_b"], DEFAULT_PARAMS, fill_est)["label"]
        conf.setdefault(c["label"], {})
        conf[c["label"]][pred] = conf[c["label"]].get(pred, 0) + 1
        ok += int(pred == c["label"])
    return {"n_cards": len(cards), "accuracy": ok / len(cards), "confusion_truth_by_predicted": conf,
            "note": "Card rules scored on noisy SYNTHETIC cards against model-side labels: shows noise robustness, "
                    "not field accuracy. Fluid pound uses the fillage estimate, not the surface-card shape."}


def constraint_test_result() -> dict:
    try:
        if CONSTRAINT_TEST_FILE.exists():
            return json.loads(CONSTRAINT_TEST_FILE.read_text())
    except Exception:
        pass
    return {"status": "pending", "note": "Written by the optimizer constraint test (tests/test_optimizer.py)."}


def credibility_dict() -> dict:
    info = cal.calibration_info()
    params = twin.active_params().as_list()
    for q in params:
        if q["name"] in cal.FIT_NAMES:
            q["fitted_scale"] = info["scales"][q["name"]]
            q["note"] += f" Fitted scale x{info['scales'][q['name']]:.3f} on SYNTHETIC cycles 1-3 (not Baghewala data)."
    return {
        "simulation": True, "synthetic": True, "model_version": MODEL_VERSION,
        "modelled_vs_assumed": MODELLED_VS_ASSUMED,
        "parameters": params,
        "validity_bounds": VALIDITY_BOUNDS,
        "metrics": {
            "prediction_error_held_out": cal.replay_metrics(),
            "calibration": {k: info[k] for k in ("cycles_used", "scales", "sd", "reduced_chi2",
                                                 "recovered_vs_synthetic_truth", "note")},
            "temperature_estimation": cal.estimation_summary(3),
            "float_detector": detector_metrics(),
            "card_rules": card_rule_metrics(),
            "constraint_violation_test": constraint_test_result(),
        },
        "caveats": [
            "All data are synthetic and generated by our own model plus injected noise and mismatch.",
            "Agreement shows consistency of method, not accuracy on Baghewala.",
            "Every economic and limit value is a placeholder owned by OIL engineering.",
            "A field pilot needs: baseline production, lab viscosity data, dynamometer history, failure records.",
        ],
    }
