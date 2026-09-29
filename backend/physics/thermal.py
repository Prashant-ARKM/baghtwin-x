"""Reduced-order thermal model for one CSS cycle (injection -> soak -> production).

Heating: steam-table energy delivered, Marx-Langenheim heat efficiency, heated-zone radius.
Cooling: T(t) = Tres + (Tpeak - Tres) * exp(-k t), with k depending on heated radius and cycle age.
This is a proxy for the near-wellbore temperature, not a reservoir simulator.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict

import numpy as np
from scipy.special import erfcx

from .config import ParamSet

# Saturated steam (IAPWS tables): P [MPa], Tsat [degC], hf [kJ/kg], hfg [kJ/kg]  (Known)
_STEAM_P = np.array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], dtype=float)
_STEAM_T = np.array([179.9, 212.4, 233.9, 250.4, 263.9, 275.6, 285.8, 295.0, 303.3, 311.0, 318.1, 324.7])
_STEAM_HF = np.array([762.8, 908.8, 1008.4, 1087.3, 1154.2, 1213.4, 1267.0, 1316.6, 1363.3, 1407.6, 1450.1, 1491.3])
_STEAM_HFG = np.array([2015.3, 1890.7, 1794.9, 1714.1, 1640.1, 1570.9, 1505.1, 1441.4, 1379.6, 1317.1, 1255.5, 1193.6])


def steam_props(p_mpa: float):
    p = float(np.clip(p_mpa, 1.0, 12.0))
    return (
        float(np.interp(p, _STEAM_P, _STEAM_T)),
        float(np.interp(p, _STEAM_P, _STEAM_HF)),
        float(np.interp(p, _STEAM_P, _STEAM_HFG)),
    )


def marx_langenheim_efficiency(t_d):
    """Fraction of injected heat still in the heated zone; t_d is dimensionless time."""
    t_d = np.asarray(t_d, dtype=float)
    td = np.maximum(t_d, 1e-9)
    x = np.sqrt(td)
    eff = (erfcx(x) + 2.0 * np.sqrt(td / np.pi) - 1.0) / td
    return np.where(td < 1e-6, 1.0, np.clip(eff, 0.0, 1.0))


@dataclass
class HeatedZone:
    steam_volume_m3: float
    pressure_mpa: float
    t_sat_c: float
    t_inj_bh_c: float
    inj_days: float
    heat_injected_gj: float
    heat_delivered_gj: float
    ml_efficiency: float
    r_h_m: float
    fuel_gj: float


def heated_zone(steam_volume_m3: float, pressure_mpa: float, p: ParamSet) -> HeatedZone:
    t_sat, hf, hfg = steam_props(pressure_mpa)
    h_w_res = 4.19 * p["t_res_c"]  # kJ/kg liquid water at reservoir temperature
    e_per_kg = (hf - h_w_res) + p["steam_quality"] * hfg  # kJ/kg
    heat_inj = steam_volume_m3 * 1000.0 * e_per_kg / 1.0e6  # GJ
    inj_days = steam_volume_m3 / p["inj_rate_m3d"]
    t_d = 4.0 * p["ob_diffusivity_m2_day"] * inj_days / p["pay_h_m"] ** 2
    eff = float(marx_langenheim_efficiency(t_d))
    heat_del = heat_inj * (1.0 - p["wb_loss_frac"]) * eff
    t_bh = t_sat - p["wb_temp_drop_c"]
    d_t = max(t_bh - p["t_res_c"], 1.0)
    v_h = heat_del * 1e9 / (p["vhc_mj_m3k"] * 1e6 * d_t)
    r_h = float(np.sqrt(v_h / (np.pi * p["pay_h_m"])))
    r_h = float(np.clip(r_h, 2.0 * p["r_w_m"], 0.9 * p["r_e_m"]))
    return HeatedZone(
        steam_volume_m3, pressure_mpa, t_sat, t_bh, inj_days, heat_inj, heat_del, eff, r_h,
        heat_inj / p["boiler_eff"],
    )


def cycle_thermal_params(zone: HeatedZone, cycle: int, p: ParamSet) -> Dict[str, float]:
    n = max(int(cycle) - 1, 0)
    d_peak = zone.t_inj_bh_c - p["t_res_c"]
    peak_gain = 1.0 - np.exp(-zone.r_h_m / p["r_char_m"])
    t_peak = p["t_res_c"] + d_peak * peak_gain * max(1.0 - p["cycle_peak_degrade"] * n, 0.3)
    k = p["k_decay_ref_per_day"] * (p["r_ref_m"] / zone.r_h_m) ** p["k_decay_exp"] * (1.0 + p["cycle_k_growth"] * n)
    return {"t_peak_c": float(t_peak), "k_per_day": float(k)}


def temperature_profile(days, css: dict, cycle: int, p: ParamSet):
    """Near-wellbore temperature [degC] for each day since the start of injection.

    css keys: steam_volume_m3, injection_pressure_mpa, soak_days, cutoff_day
    Returns (T array, meta dict).
    """
    days = np.asarray(days, dtype=float)
    zone = heated_zone(css["steam_volume_m3"], css["injection_pressure_mpa"], p)
    th = cycle_thermal_params(zone, cycle, p)
    t_res = p["t_res_c"]
    t_peak, k = th["t_peak_c"], th["k_per_day"]
    t_inj = zone.inj_days
    t_soak_end = t_inj + css["soak_days"]
    k_soak = k * p["soak_cooling_factor"]
    t_start = t_res + 5.0

    heat = t_start + (t_peak - t_start) * (1 - np.exp(-3.0 * days / t_inj)) / (1 - np.exp(-3.0))
    soak = t_res + (t_peak - t_res) * np.exp(-k_soak * (days - t_inj))
    t_at_soak_end = t_res + (t_peak - t_res) * np.exp(-k_soak * css["soak_days"])
    prod = t_res + (t_at_soak_end - t_res) * np.exp(-k * (days - t_soak_end))
    temp = np.where(days <= t_inj, heat, np.where(days <= t_soak_end, soak, prod))
    meta = {
        "zone": zone,
        "t_peak_c": t_peak,
        "k_per_day": k,
        "inj_days": t_inj,
        "soak_end_day": t_soak_end,
        "prod_start_day": int(np.ceil(t_soak_end)),
    }
    return temp, meta
