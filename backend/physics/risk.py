"""Rod-float and impact-loading risk: physics screen, dynamometer-card rules, temporal escalation.

Physics screen : margin ratio r = MPRL / W_buoyant. Float (rod compression at the polished rod) when r <= 0.
                 P(float) = P(true minimum load <= 0) = Phi(-r / sigma), sigma = model uncertainty (ASSUMED).
Impact loading : fluid pound when the barrel is not full; P(impact) is a logistic in fillage.
Card rules     : classify a polished-rod card from its own shape (what a field system would see).
Risk is reported as a probability/trend; no remaining-useful-life claims are made.
"""
from __future__ import annotations

from typing import Dict, Optional

import numpy as np
from scipy.special import ndtr

from .config import ParamSet


def float_margin_ratio(mprl_n, w_b_n):
    return np.asarray(mprl_n, dtype=float) / float(w_b_n)


def float_probability(margin_ratio, p: ParamSet):
    return ndtr(-np.asarray(margin_ratio, dtype=float) / p["sigma_float"])


def impact_probability(fillage):
    f = np.asarray(fillage, dtype=float)
    return 1.0 / (1.0 + np.exp((f - 0.55) / 0.06))


def risk_level(p_float: float, p: ParamSet) -> str:
    if p_float >= p["limit_float_prob"]:
        return "high"
    if p_float >= p["alert_float_prob"]:
        return "elevated"
    return "low"


def first_crossing(values, threshold: float, mask=None, above: bool = True) -> Optional[int]:
    v = np.asarray(values, dtype=float)
    ok = ~np.isnan(v)
    if mask is not None:
        ok &= np.asarray(mask, dtype=bool)
    hit = ok & ((v >= threshold) if above else (v <= threshold))
    idx = np.flatnonzero(hit)
    return int(idx[0]) if idx.size else None


def escalation_flag(prob_series, window: int = 7, slope_limit: float = 0.004) -> bool:
    """Temporal escalation: sustained rise of float probability over the recent window."""
    y = np.asarray(prob_series, dtype=float)
    y = y[~np.isnan(y)][-window:]
    if y.size < window:
        return False
    slope = np.polyfit(np.arange(window), y, 1)[0]
    return bool(slope > slope_limit and y[-1] > 0.03)


# ------------------------------------------------------------------ dynamometer card rules
def card_features(position, load, w_b: float) -> Dict[str, float]:
    """Features from one closed polished-rod card (position in m, load in N)."""
    pos = np.asarray(position, dtype=float)
    ld = np.asarray(load, dtype=float)
    top_i = int(np.argmax(pos))
    stroke = float(pos.max() - pos.min())
    ppr, mprl = float(ld.max()), float(ld.min())
    down_pos = np.concatenate([pos[top_i:], pos[:1]])
    down_ld = np.concatenate([ld[top_i:], ld[:1]])
    mid = 0.5 * (ppr + mprl)
    below = np.flatnonzero(down_ld < mid)
    unload_frac = float((pos.max() - down_pos[below[0]]) / max(stroke, 1e-9)) if below.size else 1.0
    return {
        "ppr_n": ppr, "mprl_n": mprl, "margin_ratio": mprl / w_b,
        "unload_pos_frac": unload_frac, "stroke_m": stroke,
    }


def classify_card(position, load, w_b: float, p: ParamSet, fillage: Optional[float] = None) -> Dict[str, object]:
    """Rule-based card diagnosis: normal | rod_float | fluid_pound | float_and_pound | high_load.

    Float and high load come from the surface card itself. Fluid pound uses the pump-fillage estimate
    (downhole card / pump-off controller); the surface-card unloading feature is only a weak fallback because
    viscous drag dominates the downstroke load.
    """
    f = card_features(position, load, w_b)
    is_float = f["margin_ratio"] < 0.10
    if fillage is not None:
        is_pound = fillage < 0.80
    else:
        is_pound = f["unload_pos_frac"] > 0.20
    is_high = f["ppr_n"] > p["limit_peak_load_kn"] * 1000.0
    if is_float and is_pound:
        label = "float_and_pound"
    elif is_float:
        label = "rod_float"
    elif is_pound:
        label = "fluid_pound"
    elif is_high:
        label = "high_load"
    else:
        label = "normal"
    return {"label": label, "features": f}


def truth_label(margin_ratio: float, fillage: float, ppr_n: float, p: ParamSet) -> str:
    """Model-side label used to score the card rules (uses information the card does not have)."""
    is_float = margin_ratio < 0.10
    is_pound = fillage < 0.80
    if is_float and is_pound:
        return "float_and_pound"
    if is_float:
        return "rod_float"
    if is_pound:
        return "fluid_pound"
    if ppr_n > p["limit_peak_load_kn"] * 1000.0:
        return "high_load"
    return "normal"
