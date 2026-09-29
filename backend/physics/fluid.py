"""Heavy-oil viscosity-temperature model.

mu(T) = mu_ref * exp[B * (1/T - 1/T_ref)], T in Kelvin (Arrhenius/Andrade type).
Parameters are ASSUMED and must be fitted to OIL lab data in a pilot.
"""
from __future__ import annotations

import numpy as np

from .config import ParamSet


def viscosity_cp(t_c, p: ParamSet):
    t_k = np.maximum(np.asarray(t_c, dtype=float), -20.0) + 273.15
    t_ref = p["visc_ref_temp_c"] + 273.15
    return p["visc_ref_cp"] * np.exp(p["visc_B_K"] * (1.0 / t_k - 1.0 / t_ref))


def mobility_factor(t_c, p: ParamSet):
    """Mobility relative to the cold reservoir oil (>= 1 when hotter)."""
    return viscosity_cp(p["t_res_c"], p) / viscosity_cp(t_c, p)


def mean_tubing_viscosity_cp(t_pump_c, p: ParamSet, n_nodes: int = 9):
    """Mean viscosity along the tubing, temperature falling linearly from pump to surface."""
    t_pump = np.asarray(t_pump_c, dtype=float)
    t_top = t_pump - p["tubing_loss_frac"] * (t_pump - p["t_amb_c"])
    frac = np.linspace(0.0, 1.0, n_nodes)
    prof = t_pump[..., None] + (t_top - t_pump)[..., None] * frac
    return viscosity_cp(prof, p).mean(axis=-1)
