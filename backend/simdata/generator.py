"""Synthetic well history for the demo (clearly labelled SIMULATION).

The 'true' well differs from the twin's default parameters (faster cooling, lower permeability, slightly
different viscosity slope) AND has structure the twin does not model (heat-retention tail, water-cut drift,
cycle-to-cycle productivity scatter). The data also carry noise, dropouts, a stuck-sensor fault, a spike,
pump downtime and correlated production noise. Consequently the twin is NOT perfectly right: calibration and prediction
errors are non-zero and meaningful. Agreement with this generator still shows consistency, not field accuracy.

Cycles 1-3 are used to calibrate the twin; cycle 4 is held out (time-based holdout) for replay.
"""
from __future__ import annotations

from functools import lru_cache
from typing import Dict, List

import numpy as np

try:  # package layout: backend.simdata
    from ..physics import risk, twin
    from ..physics.config import DEFAULT_PARAMS, MODEL_VERSION, ParamSet
except ImportError:  # top-level layout: run from backend/
    from physics import risk, twin
    from physics.config import DEFAULT_PARAMS, MODEL_VERSION, ParamSet

SEED = 7
HELD_OUT_CYCLE = 4
N_CYCLES = 4

# Historical operator choices (CSS design differs a little from cycle to cycle).
HISTORY_CSS = {
    1: {"steam_volume_m3": 1400.0, "injection_pressure_mpa": 8.5, "soak_days": 6.0, "cutoff_day": 200.0},
    2: {"steam_volume_m3": 1500.0, "injection_pressure_mpa": 9.0, "soak_days": 7.0, "cutoff_day": 210.0},
    3: {"steam_volume_m3": 1600.0, "injection_pressure_mpa": 9.0, "soak_days": 7.0, "cutoff_day": 220.0},
    4: {"steam_volume_m3": 1600.0, "injection_pressure_mpa": 9.0, "soak_days": 7.0, "cutoff_day": 220.0},
}
# Hidden synthetic truth (relative to the twin's defaults). Used only to generate data and to score calibration.
TRUE_SCALES = {"k_decay_ref_per_day": 1.10, "perm_d": 0.90, "visc_B_K": 1.015}
SIGMA_T = 2.5          # degC temperature sensor noise
SIGMA_OIL_ABS = 0.8    # bbl/d measurement noise


def true_params() -> ParamSet:
    return DEFAULT_PARAMS.scaled(**TRUE_SCALES)


def generate_history(seed: int = SEED, n_cycles: int = N_CYCLES) -> Dict[str, object]:
    rng = np.random.default_rng(seed)
    tp = true_params()
    cycles: Dict[int, dict] = {}
    maintenance: List[dict] = []
    for c in range(1, n_cycles + 1):
        css = HISTORY_CSS[c]
        res = twin.simulate_cycle(c, css, None, tp)
        a, days = res.a, res.days
        n = len(days)
        prod = res.producing

        # Structural mismatch the twin does NOT model: slow heat-retention tail from the overburden,
        # water-cut drift lowering oil, and cycle-to-cycle productivity scatter.
        t_i, t_se = res.meta["inj_days"], res.meta["soak_end_day"]
        tail = np.where(days > t_i, 6.0 * (1.0 - np.exp(-(days - t_i) / 10.0)) *
                        np.exp(-np.maximum(days - t_se, 0.0) / 80.0), 0.0)
        t_true = a["temperature_c"] + tail
        cyc_factor = 1.0 + rng.normal(0.0, 0.03)
        oil_true = a["oil_rate_bpd"] * cyc_factor * (1.0 - 0.10 * np.maximum(days - res.meta["prod_start_day"], 0.0) / 200.0)

        t_meas = t_true + rng.normal(0.0, SIGMA_T, n)
        t_meas[rng.random(n) < 0.03] = np.nan                       # dropouts
        if c == 3:
            t_meas[88:102] = t_true[87] + 0.7                       # stuck sensor fault (14 days, frozen value)
        if c == 2:
            t_meas[60] = t_true[60] + 40.0                          # single spike (always present, even on a dropout day)

        e = np.zeros(n)
        for i in range(1, n):
            e[i] = 0.6 * e[i - 1] + rng.normal(0.0, 0.04)           # correlated unmodelled production noise
        oil_meas = oil_true * (1.0 + e) + rng.normal(0.0, SIGMA_OIL_ABS, n)
        downtime = prod & (rng.random(n) < 0.015)
        oil_meas = np.where(downtime, 0.0, oil_meas)
        oil_meas = np.where(prod, np.maximum(oil_meas, 0.0), np.nan)

        mprl = a["mprl_kn"] * (1.0 + rng.normal(0.0, 0.02, n))
        ppr = a["ppr_kn"] * (1.0 + rng.normal(0.0, 0.02, n))
        card_days = [int(d) for d in days[prod][::10]]
        cards = [{
            "day": d,
            "position_m": res.cards_pos[d].tolist(),
            "load_kn": (res.cards_load[d] / 1000.0 * (1.0 + rng.normal(0.0, 0.02, res.cards_load.shape[1]))).tolist(),
        } for d in card_days]

        cycles[c] = {
            "cycle": c, "css": css, "days": days, "producing": prod, "downtime": downtime,
            "temperature_meas_c": t_meas, "oil_meas_bpd": oil_meas,
            "mprl_meas_kn": np.where(prod, mprl, np.nan), "ppr_meas_kn": np.where(prod, ppr, np.nan),
            "spm": a["spm"], "stroke_m": a["stroke_m"],
            "truth": {"temperature_c": t_true, "oil_rate_bpd": oil_true,
                      "float_event_day": res.float_event_day(), "alert_day_truth": res.alert_day()},
            "cards": cards,
        }
        fd = res.float_event_day()
        if fd is not None:
            maintenance.append({"cycle": c, "day": int(fd) + 2, "failure_type": "rod_float_episode",
                                "component": "rod string", "cause": "high viscosity at fixed SPM",
                                "downtime_days": 2, "synthetic": True})
    return {
        "synthetic": True, "seed": seed, "model_version": MODEL_VERSION,
        "true_scales": dict(TRUE_SCALES), "held_out_cycle": HELD_OUT_CYCLE,
        "cycles": cycles, "maintenance": maintenance,
    }


@lru_cache(maxsize=1)
def get_history() -> Dict[str, object]:
    return generate_history()


def measured_overlay(cycle: int) -> dict:
    """Measured (noisy) series for one historical cycle, JSON-safe, for chart overlays."""
    h = get_history()["cycles"][cycle]

    def clean(x):
        return [None if not np.isfinite(v) else float(v) for v in np.asarray(x, dtype=float)]

    return {
        "simulation": True, "synthetic": True, "cycle": cycle,
        "days": [int(d) for d in h["days"]],
        "temperature_meas_c": clean(h["temperature_meas_c"]),
        "oil_meas_bpd": clean(h["oil_meas_bpd"]),
        "mprl_meas_kn": clean(h["mprl_meas_kn"]),
        "downtime": [bool(x) for x in h["downtime"]],
    }


def card_dataset(n_sims: int = 40, seed: int = 11, cards_per_sim: int = 6) -> List[dict]:
    """Labelled synthetic cards over varied settings, for scoring the card rules."""
    rng = np.random.default_rng(seed)
    out: List[dict] = []
    for _ in range(n_sims):
        cyc = int(rng.integers(1, 5))
        spm = float(rng.uniform(2.5, 8.0))
        stroke = float(rng.uniform(1.8, 3.0))
        res = twin.simulate_cycle(cyc, HISTORY_CSS[cyc], {"spm": spm, "stroke_m": stroke})
        days = res.days[res.producing]
        for d in rng.choice(days, size=cards_per_sim, replace=False):
            d = int(d)
            noise = 1.0 + rng.normal(0.0, 0.02, res.cards_load.shape[1])
            load = res.cards_load[d] * noise
            label = risk.truth_label(float(res.a["margin_ratio"][d]), float(res.a["fillage"][d]),
                                     float(np.max(load)), DEFAULT_PARAMS)
            out.append({"cycle": cyc, "day": d, "spm": spm, "stroke_m": stroke,
                        "position_m": res.cards_pos[d], "load_n": load, "label": label, "w_b": res.w_b,
                        "fillage": float(res.a["fillage"][d])})
    return out
