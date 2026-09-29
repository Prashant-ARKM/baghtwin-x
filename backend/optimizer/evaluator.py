"""Fast batch evaluation of many (SPM, stroke) states on many days for one CSS plan.

Pump settings do not change temperature, viscosity or inflow potential, so the thermal/inflow state per day is
computed once and every candidate pump state is solved in one vectorised wave-equation batch.
Uses the same physics modules, in the same order, as physics.twin.simulate_cycle (a test checks they agree).
"""
from __future__ import annotations

from typing import Dict

import numpy as np

from physics import fluid, pump, risk, thermal, wellbore
from physics.config import ParamSet
from physics.twin import BBL_PER_M3


def evaluate_states(cycle: int, css: dict, p: ParamSet, days, spm, stroke,
                    kind: str = "conventional", n_theta: int = 128) -> Dict[str, np.ndarray]:
    """Return arrays of shape (D, S) for D days and S pump states."""
    days = np.asarray(days, dtype=float)
    spm = np.asarray(spm, dtype=float)
    stroke = np.asarray(stroke, dtype=float)
    d, s = days.size, spm.size

    temp, meta = thermal.temperature_profile(days, css, cycle, p)
    zone = meta["zone"]
    t_pump = wellbore.pump_temperature(temp, p)
    mu_tub = fluid.mean_tubing_viscosity_cp(t_pump, p)
    pi = wellbore.productivity_index(temp, zone.r_h_m, p)
    p_res = wellbore.reservoir_pressure_mpa(cycle, p)
    geo = pump.rod_geometry(p)

    mu = np.repeat(mu_tub[:, None], s, axis=1).ravel()
    pi_b = np.repeat(pi[:, None], s, axis=1).ravel()
    spm_b = np.tile(spm, d)
    stroke_b = np.tile(stroke, d)

    fe = pump.fill_efficiency(mu, spm_b, stroke_b, p)
    q_th = pump.theoretical_displacement_m3d(spm_b, stroke_b, p)
    q, p_pi, fill, _ = wellbore.operating_point(pi_b, fe * q_th, p_res, p)
    wf = wellbore.lift_pressure_mpa(p_pi, p) * 1e6 * geo.a_plunger
    sol = pump.solve_pump(spm_b, stroke_b, mu, wf, fill, p, kind, n_theta)
    q_th2 = geo.a_plunger * sol["plunger_stroke"] * spm_b * 1440.0
    q, p_pi, fill, _ = wellbore.operating_point(pi_b, fe * q_th2, p_res, p)
    wf = wellbore.lift_pressure_mpa(p_pi, p) * 1e6 * geo.a_plunger
    sol = pump.solve_pump(spm_b, stroke_b, mu, wf, fill, p, kind, n_theta)

    ratio = risk.float_margin_ratio(sol["mprl"], geo.w_b)
    out = {
        "oil_bpd": q * (1.0 - p["water_cut"]) * BBL_PER_M3,
        "power_kw": sol["power_kw"],
        "ppr_kn": sol["ppr"] / 1000.0,
        "mprl_kn": sol["mprl"] / 1000.0,
        "fillage": fill,
        "p_float": risk.float_probability(ratio, p),
        "p_impact": risk.impact_probability(fill),
    }
    return {k: v.reshape(d, s) for k, v in out.items()}
