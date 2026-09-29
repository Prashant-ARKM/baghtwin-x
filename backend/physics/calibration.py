"""State estimation and calibration of the twin against (synthetic) history.

1. Kalman-style estimator: the physics gives the thermal trajectory; a scalar Kalman filter tracks the model
   error (random walk) from quality-checked temperature measurements and returns estimate +/- 2 sigma.
2. Calibration: bounded least squares on cycles 1-3 for three parameter scales (thermal decay, permeability,
   viscosity slope); parameter uncertainty from the Jacobian.
3. Prediction with uncertainty and held-out replay metrics (cycle 4).

Everything here is validated only against synthetic data: it shows consistency, not field accuracy.
"""
from __future__ import annotations

import hashlib
import json
from functools import lru_cache
from pathlib import Path
from typing import Dict, Optional

import numpy as np
from scipy.optimize import least_squares

from . import quality, twin
from .config import DEFAULT_PARAMS, ParamSet

try:
    from ..simdata.generator import HELD_OUT_CYCLE, SIGMA_OIL_ABS, SIGMA_T, TRUE_SCALES, get_history
except ImportError:
    from simdata.generator import HELD_OUT_CYCLE, SIGMA_OIL_ABS, SIGMA_T, TRUE_SCALES, get_history

FIT_NAMES = ["k_decay_ref_per_day", "perm_d", "visc_B_K"]
TRAIN_CYCLES = (1, 2, 3)
CACHE = Path(__file__).resolve().parent.parent / "data" / "calibration.json"


def _fingerprint() -> str:
    """Hash of every file the fit depends on: editing any of them invalidates the cached calibration."""
    here = Path(__file__).resolve().parent
    files = [here / n for n in ("config.py", "thermal.py", "fluid.py", "wellbore.py", "pump.py", "risk.py",
                                "twin.py", "quality.py", "calibration.py")]
    files.append(here.parent / "simdata" / "generator.py")
    h = hashlib.md5()
    for f in files:
        try:
            h.update(f.read_bytes().replace(b"\r\n", b"\n"))
        except OSError:
            h.update(b"missing:" + f.name.encode())
    return h.hexdigest()


# ---------------------------------------------------------------------------------- Kalman estimator
def kalman_temperature(t_model, t_meas, flags, sigma: float = SIGMA_T, q_sd: float = 0.8, p0_sd: float = 5.0):
    """Track delta = T_true - T_model as a random walk; skip flagged/missing measurements."""
    n = len(t_model)
    delta, cov = 0.0, p0_sd ** 2
    est, band = np.zeros(n), np.zeros(n)
    used = np.zeros(n, dtype=bool)
    for i in range(n):
        cov += q_sd ** 2
        if flags[i] == quality.OK and np.isfinite(t_meas[i]):
            k = cov / (cov + sigma ** 2)
            delta += k * (t_meas[i] - (t_model[i] + delta))
            cov *= (1.0 - k)
            used[i] = True
        est[i] = t_model[i] + delta
        band[i] = 2.0 * np.sqrt(cov)
    return {"estimate": est, "band": band, "used": used}


def estimation_summary(cycle: int = 3, params: Optional[ParamSet] = None) -> dict:
    """Kalman vs raw sensor, scored against the synthetic truth (fault cycle by default)."""
    h = get_history()["cycles"][cycle]
    p = params or calibrated_params()
    r = twin.simulate_cycle(cycle, h["css"], None, p)
    t_meas = h["temperature_meas_c"]
    flags = quality.flag_series(t_meas, 0.0, 400.0)
    kf = kalman_temperature(r.a["temperature_c"], t_meas, flags)
    truth = h["truth"]["temperature_c"]
    valid = np.isfinite(t_meas)
    rmse_raw = float(np.sqrt(np.mean((t_meas[valid] - truth[valid]) ** 2)))
    rmse_kf = float(np.sqrt(np.mean((kf["estimate"] - truth) ** 2)))
    rmse_model = float(np.sqrt(np.mean((r.a["temperature_c"] - truth) ** 2)))
    return {
        "cycle": cycle, "rmse_raw_sensor_c": rmse_raw, "rmse_kalman_c": rmse_kf, "rmse_model_only_c": rmse_model,
        "flagged_samples": int((flags != 0).sum()), "flag_counts": quality.quality_report("temperature", flags)["counts"],
    }


# ---------------------------------------------------------------------------------- calibration
def _scaled(scales) -> ParamSet:
    return DEFAULT_PARAMS.scaled(**dict(zip(FIT_NAMES, scales)))


def _prepare(hist, cycles):
    data = []
    for c in cycles:
        h = hist["cycles"][c]
        flags = quality.flag_series(h["temperature_meas_c"], 0.0, 400.0)
        data.append((c, h, flags))
    return data


def _residuals(theta, data):
    p = _scaled(theta)
    out = []
    for c, h, flags in data:
        r = twin.simulate_cycle(c, h["css"], None, p)
        m = (flags == quality.OK) & np.isfinite(h["temperature_meas_c"])
        out.append((h["temperature_meas_c"][m] - r.a["temperature_c"][m]) / SIGMA_T)
        mo = h["producing"] & ~h["downtime"] & np.isfinite(h["oil_meas_bpd"])
        model_oil = r.a["oil_rate_bpd"][mo]
        out.append((h["oil_meas_bpd"][mo] - model_oil) / (0.05 * model_oil + SIGMA_OIL_ABS))
    return np.concatenate(out)


def fit_calibration(cycles=TRAIN_CYCLES) -> dict:
    hist = get_history()
    data = _prepare(hist, cycles)
    x0 = np.ones(len(FIT_NAMES))
    sol = least_squares(_residuals, x0, args=(data,), bounds=(0.6, 1.6), diff_step=0.01)
    dof = max(sol.fun.size - len(FIT_NAMES), 1)
    s2 = float(np.sum(sol.fun ** 2) / dof)
    jtj = sol.jac.T @ sol.jac
    cov = np.linalg.pinv(jtj) * s2
    sd = np.sqrt(np.clip(np.diag(cov), 0, None))

    # relative oil scatter on the training data (used for prediction intervals)
    p = _scaled(sol.x)
    rel = []
    for c, h, flags in data:
        r = twin.simulate_cycle(c, h["css"], None, p)
        mo = h["producing"] & ~h["downtime"] & np.isfinite(h["oil_meas_bpd"])
        rel.append(h["oil_meas_bpd"][mo] / r.a["oil_rate_bpd"][mo] - 1.0)
    rel = np.concatenate(rel)
    return {
        "cycles_used": list(cycles),
        "scales": {k: float(v) for k, v in zip(FIT_NAMES, sol.x)},
        "sd": {k: float(v) for k, v in zip(FIT_NAMES, sd)},
        "reduced_chi2": s2,
        "oil_rel_scatter": float(np.std(rel)),
        "recovered_vs_synthetic_truth": {
            k: {"fitted": float(v), "truth": float(TRUE_SCALES[k]),
                "error_pct": float((v / TRUE_SCALES[k] - 1.0) * 100.0)}
            for k, v in zip(FIT_NAMES, sol.x)
        },
        "note": "Fitted on synthetic cycles 1-3 only. Scales multiply the twin's default (assumed) parameters.",
        "fingerprint": _fingerprint(),
    }


@lru_cache(maxsize=1)
def calibration_info() -> dict:
    try:
        if CACHE.exists():
            info = json.loads(CACHE.read_text())
            if (info.get("cycles_used") == list(TRAIN_CYCLES) and set(info["scales"]) == set(FIT_NAMES)
                    and info.get("fingerprint") == _fingerprint()):
                return info
    except Exception:
        pass
    info = fit_calibration()
    try:
        CACHE.parent.mkdir(parents=True, exist_ok=True)
        CACHE.write_text(json.dumps(info, indent=2))
    except Exception:
        pass
    return info


@lru_cache(maxsize=1)
def calibrated_params() -> ParamSet:
    """The twin's active parameter set: defaults with thermal/permeability/viscosity scales fitted to history."""
    s = calibration_info()["scales"]
    return DEFAULT_PARAMS.scaled(**s)


# ---------------------------------------------------------------------------------- prediction + replay
def predict_with_uncertainty(cycle: int, css: Optional[dict] = None, srp=None, n_draws: int = 30, seed: int = 3):
    """Oil-rate prediction with a 90 % band: parameter uncertainty (draws) + scatter estimated on training data."""
    info = calibration_info()
    rng = np.random.default_rng(seed)
    base = info["scales"]
    draws = []
    for _ in range(n_draws):
        sc = {k: float(np.clip(rng.normal(base[k], info["sd"][k]), 0.6, 1.6)) for k in FIT_NAMES}
        draws.append(twin.simulate_cycle(cycle, css, srp, DEFAULT_PARAMS.scaled(**sc)).a["oil_rate_bpd"])
    arr = np.array(draws)
    nominal = twin.simulate_cycle(cycle, css, srp, calibrated_params())
    oil = nominal.a["oil_rate_bpd"]
    sd_param = np.nanstd(arr, axis=0)
    sd_noise = np.sqrt((info["oil_rel_scatter"] * oil) ** 2 + SIGMA_OIL_ABS ** 2)
    sd = np.sqrt(sd_param ** 2 + sd_noise ** 2)
    return {"result": nominal, "oil_bpd": oil, "lo_bpd": np.maximum(oil - 1.645 * sd, 0.0), "hi_bpd": oil + 1.645 * sd,
            "sd_param": sd_param}


def replay_metrics(cycle: int = HELD_OUT_CYCLE) -> dict:
    """Predicted vs synthetic 'actual' oil rate for a held-out cycle; calibrated vs uncalibrated twin."""
    h = get_history()["cycles"][cycle]
    pred = predict_with_uncertainty(cycle, h["css"], None)
    m = h["producing"] & ~h["downtime"] & np.isfinite(h["oil_meas_bpd"])
    y = h["oil_meas_bpd"][m]
    yp = pred["oil_bpd"][m]
    err = yp - y
    default = twin.simulate_cycle(cycle, h["css"], None, DEFAULT_PARAMS).a["oil_rate_bpd"][m]
    inside = (y >= pred["lo_bpd"][m]) & (y <= pred["hi_bpd"][m])
    return {
        "cycle": cycle, "n_points": int(m.sum()),
        "mae_bpd": float(np.mean(np.abs(err))), "rmse_bpd": float(np.sqrt(np.mean(err ** 2))),
        "mape_pct": float(np.mean(np.abs(err) / np.maximum(y, 1.0)) * 100.0),
        "interval_coverage_90": float(inside.mean()),
        "mae_uncalibrated_bpd": float(np.mean(np.abs(default - y))),
        "note": "Scored against SYNTHETIC measurements of a held-out cycle (time-based holdout).",
    }
