"""Sucker-rod-pump mechanics: damped wave equation solved in the frequency domain (Gibbs-style).

Rod string:   m u_tt = EA u_xx - k_d u_t      (x downward, u upward, k_d = viscous drag per length per velocity)
Top boundary: polished-rod displacement u0(t) from pumping-unit kinematics.
Bottom:       plunger force F_pl(t): fluid load on the upstroke, valve resistance on the downstroke,
              fluid load carried into the downstroke when the barrel is not full (fluid pound).
Per harmonic n:   PRL_n = EA*g*tanh(gL)*U0_n + F_n/cosh(gL),   g^2 = (-w^2 + i*w*c)/a^2,  c = k_d/m
Plunger valve timing follows plunger velocity and is iterated (few passes) with under-relaxation.

SIMPLIFIED: single rod section, no deviation, no tubing movement, prescribed valve logic.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .config import ParamSet

G = 9.81


@dataclass
class RodGeometry:
    a_rod: float      # m2
    ea: float         # N
    m_lin: float      # kg/m
    a_wave: float     # m/s
    w_b: float        # N, buoyant weight of the rod string
    a_plunger: float  # m2
    length: float     # m


def rod_geometry(p: ParamSet) -> RodGeometry:
    d = p["rod_d_mm"] / 1000.0
    a_rod = np.pi * d * d / 4.0
    ea = p["rod_E_gpa"] * 1e9 * a_rod
    m_lin = p["rod_rho_kgm3"] * a_rod
    buoy = 1.0 - p["oil_density_kgm3"] / p["rod_rho_kgm3"]
    length = p["depth_m"]
    dp = p["plunger_d_mm"] / 1000.0
    return RodGeometry(
        a_rod, ea, m_lin, float(np.sqrt(ea / m_lin)), m_lin * G * buoy * length,
        np.pi * dp * dp / 4.0, length,
    )


def drag_coeff(mu_cp, p: ParamSet):
    """Viscous drag per unit rod length per unit velocity [N.s/m2] (annular Couette, times enhancement)."""
    r1 = p["rod_d_mm"] / 2000.0
    r2 = p["tubing_id_mm"] / 2000.0
    return 2.0 * np.pi * (np.asarray(mu_cp, dtype=float) / 1000.0) * p["drag_enhancement"] / np.log(r2 / r1)


def kinematics(kind: str, n: int = 128) -> np.ndarray:
    """Normalised polished-rod position s(theta) in [0,1]; theta=0 is the bottom of the stroke."""
    th = 2.0 * np.pi * np.arange(n) / n
    if kind == "hydraulic":
        fa = 0.2  # accelerating fraction of each half stroke (trapezoidal velocity)

        def trap(x):
            return np.clip(np.minimum(x / fa, 1.0), 0, 1) * np.clip(np.minimum((1 - x) / fa, 1.0), 0, 1)

        x = (th % np.pi) / np.pi
        v = np.where(th < np.pi, trap(x), -trap(x))
        raw = np.cumsum(v)
    else:  # conventional beam unit: near-harmonic with slight crank/pitman skew
        raw = 0.5 * (1.0 - np.cos(th)) + 0.02 * np.sin(2.0 * th)
    return (raw - raw.min()) / (raw.max() - raw.min())


def solve_pump(spm, stroke_m, mu_cp, fluid_load_n, fillage, p: ParamSet,
               kind: str = "conventional", n_theta: int = 128):
    """Solve the rod string for a batch of operating states (all inputs broadcast to shape (B,)).

    Fluid-load transfer follows the rod-stretch distance: the plunger picks up (and drops) the fluid load
    over a polished-rod travel of delta = W_f*L/EA. With fillage < 1 the load is carried into the
    downstroke until the plunger reaches the liquid (fluid pound), then drops abruptly.
    Returns dict of arrays: position (B,n), load (B,n) [N], plunger stroke, ppr, mprl, work, power.
    """
    spm, stroke, mu, wf, fill = [np.atleast_1d(np.asarray(x, dtype=float)) for x in
                                 np.broadcast_arrays(spm, stroke_m, mu_cp, fluid_load_n, fillage)]
    geo = rod_geometry(p)
    n_h = n_theta // 2 + 1
    n = np.arange(n_h)
    om = 2.0 * np.pi * spm / 60.0
    w = om[:, None] * n[None, :]
    c_base = p["base_damping_factor"] * np.pi * geo.a_wave / geo.length      # Gibbs damping, 1/s
    c = c_base + drag_coeff(mu, p) / geo.m_lin
    gam = np.sqrt((-w ** 2 + 1j * w * c[:, None]) / geo.a_wave ** 2)
    g_l = gam * geo.length
    cosh = np.cosh(g_l)
    tanh = np.tanh(g_l)
    small = np.abs(gam) < 1e-14
    tg = np.where(small, geo.length, tanh / np.where(small, 1.0, gam))     # tanh(gL)/g
    h_prl = geo.ea * gam ** 2 * tg                                          # EA*g*tanh(gL)
    h_f = 1.0 / cosh
    h_u = 1.0 / cosh
    comp = tg / geo.ea
    sig = np.sinc(n / n_h)[None, :]                                         # Lanczos sigma: tame Gibbs ringing

    s = kinematics(kind, n_theta)
    u0 = stroke[:, None] * s[None, :]
    u0h = np.fft.rfft(u0, axis=1)
    v_pr = np.fft.irfft(1j * w * u0h, n=n_theta, axis=1)                    # polished-rod velocity
    up = ((np.roll(s, -1) - s) > 0)[None, :]

    delta = np.maximum(wf * geo.length / geo.ea, 1e-4)[:, None]             # stretch distance
    hold = ((1.0 - fill) * np.maximum(stroke - delta[:, 0], 0.0))[:, None]  # travel before the plunger meets liquid
    delta_dn = delta * (fill[:, None] + 0.25 * (1.0 - fill[:, None]))       # abrupt drop when pounding
    f_up = np.clip(u0 / delta, 0.0, 1.0)
    d = stroke[:, None] - u0
    f_dn = np.clip(1.0 - np.maximum(d - hold, 0.0) / delta_dn, 0.0, 1.0)
    frac = np.where(up, f_up, f_dn)
    f_valve = p["valve_resist_m"] * (mu / 1000.0)[:, None] * np.maximum(-v_pr, 0.0) * (1.0 - frac) * (~up)
    force = wf[:, None] * frac + f_valve

    fh = np.fft.rfft(force, axis=1) * sig
    prlh = h_prl * u0h + fh * h_f
    prl = geo.w_b + np.fft.irfft(prlh, n=n_theta, axis=1)
    ulh = u0h * h_u - fh * comp
    ul = np.fft.irfft(ulh, n=n_theta, axis=1)
    sp = ul.max(axis=1) - ul.min(axis=1)

    du = np.roll(u0, -1, axis=1) - u0
    work = np.sum(0.5 * (prl + np.roll(prl, -1, axis=1)) * du, axis=1)      # J per cycle = card area
    power_kw = np.maximum(work, 0.0) * spm / 60.0 / 1000.0 / p["drive_eff"]
    return {
        "position": u0, "load": prl, "plunger_stroke": sp,
        "ppr": prl.max(axis=1), "mprl": prl.min(axis=1),
        "work_j": work, "power_kw": power_kw, "w_b": geo.w_b,
        "plunger_disp": ul, "delta_m": delta[:, 0],
    }


def theoretical_displacement_m3d(spm, stroke_m, p: ParamSet):
    return rod_geometry(p).a_plunger * np.asarray(stroke_m) * np.asarray(spm) * 1440.0


def fill_efficiency(mu_cp, spm, stroke_m, p: ParamSet):
    """Maximum volumetric efficiency, reduced by viscous barrel-filling loss."""
    v = np.asarray(stroke_m) * np.asarray(spm) / 60.0
    return p["fill_eff_max"] / (1.0 + p["fill_visc_kappa"] * (np.asarray(mu_cp) / 1000.0) * v)
