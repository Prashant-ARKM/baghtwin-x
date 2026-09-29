"""Wellbore and inflow: reservoir state -> conditions at the pump.

Inflow uses a two-zone composite radial model (heated zone + cold zone):
  q = 2*pi*k*h*dP / ( mu_hot*ln(r_h/r_w) + mu_cold*ln(r_e/r_h) )
"""
from __future__ import annotations

import numpy as np

from .config import ParamSet
from .fluid import viscosity_cp

_DARCY_M2 = 9.869233e-13


def pump_temperature(t_nw_c, p: ParamSet):
    return p["t_res_c"] + p["pump_temp_eff"] * (np.asarray(t_nw_c, dtype=float) - p["t_res_c"])


def reservoir_pressure_mpa(cycle: int, p: ParamSet) -> float:
    return p["p_res_mpa"] - p["res_depl_mpa_per_cycle"] * max(int(cycle) - 1, 0)


def productivity_index(t_nw_c, r_h_m: float, p: ParamSet):
    """Productivity index in m3/day per MPa of drawdown."""
    t_zone = p["t_res_c"] + p["zone_avg_frac"] * (np.asarray(t_nw_c, dtype=float) - p["t_res_c"])
    mu_h = viscosity_cp(t_zone, p) / 1000.0  # Pa.s
    mu_c = float(viscosity_cp(p["t_res_c"], p)) / 1000.0
    r_h = float(np.clip(r_h_m, 1.5 * p["r_w_m"], 0.95 * p["r_e_m"]))
    resist = mu_h * np.log(r_h / p["r_w_m"]) + mu_c * np.log(p["r_e_m"] / r_h)
    q_per_pa = 2.0 * np.pi * p["perm_d"] * _DARCY_M2 * p["pay_h_m"] / resist  # m3/s per Pa
    return q_per_pa * 86400.0 * 1.0e6


def operating_point(pi_m3d_mpa, q_cap_m3d, p_res_mpa: float, p: ParamSet):
    """Intersect a linear IPR with the pump capacity.

    Returns liquid rate [m3/d], pump-intake pressure [MPa], fillage [0-1], fluid level above pump [m].
    """
    pi = np.asarray(pi_m3d_mpa, dtype=float)
    q_cap = np.maximum(np.asarray(q_cap_m3d, dtype=float), 1e-9)
    q_in_max = pi * max(p_res_mpa - p["p_min_intake_mpa"], 0.0)
    q = np.minimum(q_cap, q_in_max)
    p_pi = p_res_mpa - q / np.maximum(pi, 1e-12)
    fillage = np.clip(q / q_cap, 0.0, 1.0)
    level = np.maximum(p_pi, 0.0) * 1e6 / (p["oil_density_kgm3"] * 9.81)
    return q, p_pi, fillage, level


def lift_pressure_mpa(p_intake_mpa, p: ParamSet):
    """Net pressure the plunger lifts against: head + oil column - intake pressure."""
    col = p["oil_density_kgm3"] * 9.81 * p["depth_m"] / 1e6
    return p["p_wellhead_mpa"] + col - np.asarray(p_intake_mpa, dtype=float)
