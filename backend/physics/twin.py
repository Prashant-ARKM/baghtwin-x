"""Well twin orchestrator: one CSS cycle, all layers coupled.

thermal -> viscosity -> composite inflow -> pump capacity & intake pressure -> rod wave solver -> risk.
Deterministic. No web code. SIMULATION only.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from functools import lru_cache
from typing import Dict, List, Optional, Union

import numpy as np

from . import fluid, pump, risk, thermal, wellbore
from .config import DEFAULT_PARAMS, MODEL_VERSION, WELL_INFO, ParamSet

BBL_PER_M3 = 6.28981
KWH_PER_GJ = 277.778

BASELINE_CSS = {
    "steam_volume_m3": 1600.0,
    "injection_pressure_mpa": 9.0,
    "soak_days": 7.0,
    "cutoff_day": 220.0,
}

SrpSpec = Union[None, dict, list]


def active_params() -> ParamSet:
    """The twin's working parameters: defaults with scales fitted to (synthetic) history 1-3, if available."""
    try:
        from .calibration import calibrated_params
        return calibrated_params()
    except Exception:
        return DEFAULT_PARAMS


def baseline_css() -> dict:
    return dict(BASELINE_CSS)


def baseline_srp(p: ParamSet = DEFAULT_PARAMS) -> dict:
    return {"spm": p["spm_baseline"], "stroke_m": p["stroke_baseline_m"]}


def srp_arrays(days: np.ndarray, srp: SrpSpec, p: ParamSet):
    """Expand an SRP spec to per-day SPM and stroke.

    srp may be None (baseline), {'spm','stroke_m'}, or a schedule
    [{'start_day','spm','stroke_m'}, ...] (rolling-horizon / phase-wise settings).
    """
    if srp is None:
        srp = baseline_srp(p)
    if isinstance(srp, dict):
        srp = [{"start_day": 0.0, "spm": srp["spm"], "stroke_m": srp["stroke_m"]}]
    seg = sorted(srp, key=lambda s: s["start_day"])
    starts = np.array([s["start_day"] for s in seg], dtype=float)
    idx = np.clip(np.searchsorted(starts, days, side="right") - 1, 0, len(seg) - 1)
    spm = np.array([s["spm"] for s in seg], dtype=float)[idx]
    stroke = np.array([s["stroke_m"] for s in seg], dtype=float)[idx]
    return spm, stroke


def _clean(v):
    """numpy -> JSON-safe python (NaN/inf -> None)."""
    if isinstance(v, np.ndarray):
        return [None if not np.isfinite(x) else float(x) for x in v.ravel()] if v.ndim == 1 else [_clean(r) for r in v]
    if isinstance(v, (np.floating, float)):
        return None if not np.isfinite(v) else float(v)
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, dict):
        return {k: _clean(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [_clean(x) for x in v]
    return v


@dataclass
class CycleResult:
    cycle: int
    css: dict
    srp: SrpSpec
    kind: str
    params: ParamSet
    days: np.ndarray
    meta: dict
    a: Dict[str, np.ndarray] = field(default_factory=dict)   # per-day arrays
    cards_pos: Optional[np.ndarray] = None
    cards_load: Optional[np.ndarray] = None
    w_b: float = 0.0

    # ------------------------------------------------------------------ derived
    @property
    def producing(self) -> np.ndarray:
        return self.days >= self.meta["prod_start_day"]

    def phases(self) -> List[dict]:
        m = self.meta
        end = float(self.days[-1])
        return [
            {"name": "injection", "start_day": 0.0, "end_day": round(m["inj_days"], 2)},
            {"name": "soak", "start_day": round(m["inj_days"], 2), "end_day": round(m["soak_end_day"], 2)},
            {"name": "production", "start_day": round(m["soak_end_day"], 2), "end_day": end},
        ]

    def alert_day(self) -> Optional[int]:
        i = risk.first_crossing(self.a["float_probability"], self.params["alert_float_prob"], self.producing)
        return None if i is None else int(self.days[i])

    def float_event_day(self) -> Optional[int]:
        i = risk.first_crossing(self.a["mprl_kn"], 0.0, self.producing, above=False)
        return None if i is None else int(self.days[i])

    def events(self) -> List[dict]:
        p, a, ev = self.params, self.a, []
        ad = self.alert_day()
        if ad is not None:
            ev.append({"day": ad, "type": "float_alert",
                       "message": f"Rod-float risk crossed the {p['alert_float_prob']:.0%} alert level."})
        fd = self.float_event_day()
        if fd is not None:
            ev.append({"day": fd, "type": "rod_float",
                       "message": "Minimum downstroke load reached zero: rods no longer fall freely (float)."})
        i = risk.first_crossing(a["fillage"], p["limit_min_fillage"], self.producing, above=False)
        if i is not None:
            ev.append({"day": int(self.days[i]), "type": "fluid_pound",
                       "message": f"Pump fillage fell below {p['limit_min_fillage']:.0%}: impact loading likely."})
        i = risk.first_crossing(a["ppr_kn"], p["limit_peak_load_kn"], self.producing)
        if i is not None:
            ev.append({"day": int(self.days[i]), "type": "load_limit",
                       "message": f"Peak polished-rod load exceeded {p['limit_peak_load_kn']:.0f} kN."})
        return sorted(ev, key=lambda e: e["day"])

    # ------------------------------------------------------------------ constraints
    def constraint_table(self, day: Optional[int] = None, margin: float = 0.0) -> List[dict]:
        """Constraint margins (whole production period, or a single day). margin tightens limits."""
        p, a = self.params, self.a
        sel = self.producing if day is None else (self.days == day) & self.producing
        rows = []

        def add(name, value, limit, upper=True):
            lim = limit * (1 - margin) if upper else limit * (1 + margin)
            pct = (lim - value) / lim * 100.0 if upper else (value - lim) / lim * 100.0
            rows.append({"name": name, "value": float(value), "limit": float(lim),
                         "margin_pct": float(pct), "active": bool(pct <= 5.0), "violated": bool(pct < 0.0)})

        add("injection_pressure_mpa", self.css["injection_pressure_mpa"], p["limit_inj_pressure_mpa"])
        add("min_injection_pressure_mpa", self.css["injection_pressure_mpa"], p["limit_min_inj_pressure_mpa"], upper=False)
        if sel.any():
            add("peak_load_kn", np.nanmax(a["ppr_kn"][sel]), p["limit_peak_load_kn"])
            add("min_fillage", np.nanmin(a["fillage"][sel]), p["limit_min_fillage"], upper=False)
            add("float_probability", np.nanmax(a["float_probability"][sel]), p["limit_float_prob"])
            add("spm_max", np.nanmax(a["spm"][sel]), p["spm_max"])
            add("spm_min", np.nanmin(a["spm"][sel]), p["spm_min"], upper=False)
            add("stroke_max_m", np.nanmax(a["stroke_m"][sel]), p["stroke_max_m"])
            add("stroke_min_m", np.nanmin(a["stroke_m"][sel]), p["stroke_min_m"], upper=False)
        return rows

    def violations(self, margin: float = 0.0) -> List[dict]:
        return [r for r in self.constraint_table(margin=margin) if r["violated"]]

    # ------------------------------------------------------------------ totals / economics
    def totals(self) -> dict:
        p, a, prod = self.params, self.a, self.producing
        oil = float(np.nansum(a["oil_rate_bpd"][prod]))
        z = self.meta["zone"]
        steam_bbl = z.steam_volume_m3 * BBL_PER_M3
        fuel_kwh = z.fuel_gj * KWH_PER_GJ
        elec_kwh = float(np.nansum(a["power_kw"][prod]) * 24.0)
        exp_fail = float(np.nansum(p["failure_hazard_per_day"] *
                                   (a["float_probability"][prod] + 0.5 * a["impact_probability"][prod])))
        rev = oil * p["oil_price_usd_bbl"]
        c_steam = z.fuel_gj * p["steam_fuel_usd_gj"]
        c_power = elec_kwh * p["power_usd_kwh"]
        c_fail = exp_fail * p["workover_cost_usd"]
        return {
            "cumulative_oil_bbl": oil,
            "steam_bbl": steam_bbl,
            "sor": steam_bbl / max(oil, 1e-9),
            "energy_kwh_per_bbl": (fuel_kwh + elec_kwh) / max(oil, 1e-9),
            "fuel_gj": z.fuel_gj,
            "electric_kwh": elec_kwh,
            "max_float_probability": float(np.nanmax(a["float_probability"][prod])) if prod.any() else 0.0,
            "min_fillage": float(np.nanmin(a["fillage"][prod])) if prod.any() else 1.0,
            "max_peak_load_kn": float(np.nanmax(a["ppr_kn"][prod])) if prod.any() else 0.0,
            "expected_failures": exp_fail,
            "revenue_usd": rev, "steam_cost_usd": c_steam, "power_cost_usd": c_power,
            "failure_cost_usd": c_fail,
            "net_value_usd": rev - c_steam - c_power - c_fail,
            "cycle_days": float(self.days[-1]),
            "constraint_violations": [v["name"] for v in self.violations()],
        }

    # ------------------------------------------------------------------ API payloads
    def timeline_dict(self) -> dict:
        a = self.a
        keep = ["temperature_c", "viscosity_cp", "oil_rate_bpd", "fillage", "float_probability"]
        out = {
            "simulation": True, "model_version": MODEL_VERSION, "cycle": self.cycle,
            "days": self.days.astype(float),
            "min_downstroke_load_kn": a["mprl_kn"], "peak_load_kn": a["ppr_kn"],
            "impact_probability": a["impact_probability"], "spm": a["spm"], "stroke_m": a["stroke_m"],
            "tubing_viscosity_cp": a["mu_tub_cp"], "power_kw": a["power_kw"],
            "liquid_rate_bpd": a["liquid_bpd"], "pump_intake_mpa": a["p_intake_mpa"],
            "phases": self.phases(), "events": self.events(),
            "alert_day": self.alert_day(), "float_event_day": self.float_event_day(),
        }
        for k in keep:
            out[k] = a[k]
        return _clean(out)

    def simulate_dict(self) -> dict:
        d = self.timeline_dict()
        t = self.totals()
        d.update({
            "cumulative_oil_bbl": t["cumulative_oil_bbl"], "sor": t["sor"],
            "energy_kwh_per_bbl": t["energy_kwh_per_bbl"],
            "max_float_probability": t["max_float_probability"],
            "constraint_violations": t["constraint_violations"],
            "totals": _clean(t),
        })
        return _clean(d)

    def state_dict(self, day: float) -> dict:
        p, a = self.params, self.a
        i = int(np.clip(round(day), 0, len(self.days) - 1))
        phase = next((ph["name"] for ph in reversed(self.phases()) if self.days[i] >= ph["start_day"]), "injection")
        producing = bool(self.producing[i])
        temp, visc = float(a["temperature_c"][i]), float(a["viscosity_cp"][i])
        st = {
            "simulation": True, "model_version": MODEL_VERSION, "cycle": self.cycle,
            "day": int(self.days[i]), "phase": phase,
            "temperature_c": temp, "viscosity_cp": visc,
            "mobility_factor": float(fluid.mobility_factor(temp, p)),
            "inflow_bpd": float(a["pi_bpd_max"][i]),   # inflow potential at minimum pump-intake pressure
            "liquid_rate_bpd": float(a["liquid_bpd"][i]) if producing else None,
            "oil_rate_bpd": float(a["oil_rate_bpd"][i]) if producing else None,
            "pump_intake_mpa": float(a["p_intake_mpa"][i]) if producing else None,
            "tubing_viscosity_cp": float(a["mu_tub_cp"][i]),
            "spm": float(a["spm"][i]), "stroke_m": float(a["stroke_m"][i]),
            "fillage": float(a["fillage"][i]) if producing else None,
            "volumetric_efficiency": float(a["vol_eff"][i]) if producing else None,
            "card": {"position": [], "load": []},
            "float_probability": float(a["float_probability"][i]) if producing else 0.0,
            "risk_level": "low", "risk_reason": "Well is not being pumped in this phase (steam injection or soak).",
            "constraint_margins": [],
        }
        if producing:
            pos = np.append(self.cards_pos[i][::2], self.cards_pos[i][0])
            ld = np.append(self.cards_load[i][::2], self.cards_load[i][0])
            st["card"] = {"position": _clean(pos), "load": _clean(ld / 1000.0)}
            st["risk_level"] = risk.risk_level(st["float_probability"], p)
            st["risk_reason"] = self.explain(i)
            st["constraint_margins"] = _clean(self.constraint_table(day=int(self.days[i])))
        return _clean(st)

    def explain(self, i: int) -> str:
        p, a = self.params, self.a
        r = float(a["margin_ratio"][i])
        drag_share = 1.0 - r
        parts = [
            f"Near-wellbore temperature {a['temperature_c'][i]:.0f} C; oil in the tubing averages "
            f"{a['mu_tub_cp'][i]:.0f} cP."
        ]
        parts.append(f"Downstroke drag and inertia use {drag_share:.0%} of the buoyant rod weight, leaving "
                     f"{max(r, 0):.0%} margin (float probability {a['float_probability'][i]:.0%}).")
        if a["fillage"][i] < p["limit_min_fillage"] + 0.15:
            parts.append(f"Pump is only {a['fillage'][i]:.0%} full: inflow cannot keep up with displacement, "
                         f"so impact loading (fluid pound) is likely.")
        return " ".join(parts)


# ---------------------------------------------------------------------------------------------
def normalize_css(css: Optional[dict]) -> dict:
    out = dict(BASELINE_CSS)
    out.update(css or {})
    return {k: float(v) for k, v in out.items()}


def simulate_cycle(cycle: int = 3, css: Optional[dict] = None, srp: SrpSpec = None,
                   params: Optional[ParamSet] = None, kind: str = "conventional",
                   n_theta: int = 128) -> CycleResult:
    p = params or active_params()
    css = normalize_css(css)
    z0 = thermal.heated_zone(css["steam_volume_m3"], css["injection_pressure_mpa"], p)
    prod_start = int(np.ceil(z0.inj_days + css["soak_days"]))
    cutoff = int(max(css["cutoff_day"], prod_start + 10))
    css["cutoff_day"] = float(cutoff)
    days = np.arange(0, cutoff + 1)

    temp, meta = thermal.temperature_profile(days, css, cycle, p)
    zone = meta["zone"]
    visc_nw = fluid.viscosity_cp(temp, p)
    t_pump = wellbore.pump_temperature(temp, p)
    mu_tub = fluid.mean_tubing_viscosity_cp(t_pump, p)
    pi = wellbore.productivity_index(temp, zone.r_h_m, p)
    p_res = wellbore.reservoir_pressure_mpa(cycle, p)
    spm, stroke = srp_arrays(days, srp, p)

    n = len(days)
    nan = lambda: np.full(n, np.nan)
    a = {
        "temperature_c": temp, "viscosity_cp": visc_nw, "t_pump_c": t_pump, "mu_tub_cp": mu_tub,
        "spm": spm, "stroke_m": stroke,
        "pi_bpd_max": pi * (p_res - p["p_min_intake_mpa"]) * BBL_PER_M3,
    }
    for k in ("oil_rate_bpd", "liquid_bpd", "fillage", "vol_eff", "p_intake_mpa", "ppr_kn", "mprl_kn",
              "margin_ratio", "float_probability", "impact_probability", "power_kw", "plunger_stroke_m"):
        a[k] = nan()
    cards_pos = np.full((n, n_theta), np.nan)
    cards_load = np.full((n, n_theta), np.nan)

    m = days >= meta["prod_start_day"]
    geo = pump.rod_geometry(p)
    w_b = geo.w_b
    if m.any():
        s_, st_, mu_, pi_ = spm[m], stroke[m], mu_tub[m], pi[m]
        fe = pump.fill_efficiency(mu_, s_, st_, p)
        q_th = pump.theoretical_displacement_m3d(s_, st_, p)
        q, p_pi, fill, _ = wellbore.operating_point(pi_, fe * q_th, p_res, p)
        wf = wellbore.lift_pressure_mpa(p_pi, p) * 1e6 * geo.a_plunger
        sol = pump.solve_pump(s_, st_, mu_, wf, fill, p, kind, n_theta)
        # second pass: capacity uses the plunger stroke after rod stretch
        q_th2 = geo.a_plunger * sol["plunger_stroke"] * s_ * 1440.0
        q, p_pi, fill, _ = wellbore.operating_point(pi_, fe * q_th2, p_res, p)
        wf = wellbore.lift_pressure_mpa(p_pi, p) * 1e6 * geo.a_plunger
        sol = pump.solve_pump(s_, st_, mu_, wf, fill, p, kind, n_theta)

        ratio = risk.float_margin_ratio(sol["mprl"], w_b)
        a["oil_rate_bpd"][m] = q * (1.0 - p["water_cut"]) * BBL_PER_M3
        a["liquid_bpd"][m] = q * BBL_PER_M3
        a["fillage"][m] = fill
        a["vol_eff"][m] = q / q_th
        a["p_intake_mpa"][m] = p_pi
        a["ppr_kn"][m] = sol["ppr"] / 1000.0
        a["mprl_kn"][m] = sol["mprl"] / 1000.0
        a["margin_ratio"][m] = ratio
        a["float_probability"][m] = risk.float_probability(ratio, p)
        a["impact_probability"][m] = risk.impact_probability(fill)
        a["power_kw"][m] = sol["power_kw"]
        a["plunger_stroke_m"][m] = sol["plunger_stroke"]
        cards_pos[m], cards_load[m] = sol["position"], sol["load"]

    return CycleResult(cycle, css, srp, kind, p, days, meta, a, cards_pos, cards_load, w_b)


# ---------------------------------------------------------------------------------------------
@lru_cache(maxsize=256)
def _cached(cycle, css_t, spm, stroke):
    css = dict(css_t)
    return simulate_cycle(cycle, css, {"spm": spm, "stroke_m": stroke})


def simulate_cached(cycle: int, css: Optional[dict], spm: float, stroke_m: float) -> CycleResult:
    """Cached constant-setting simulation for GET endpoints (params = defaults)."""
    css_t = tuple(sorted(normalize_css(css).items()))
    return _cached(int(cycle), css_t, round(float(spm), 3), round(float(stroke_m), 3))


def well_dict(p: Optional[ParamSet] = None) -> dict:
    p = p or active_params()
    geo = pump.rod_geometry(p)
    return {
        "simulation": True, "model_version": MODEL_VERSION,
        "well": {**WELL_INFO, "depth_m": p["depth_m"], "plunger_diameter_mm": p["plunger_d_mm"],
                 "buoyant_rod_weight_kn": geo.w_b / 1000.0},
        "parameters": p.as_list(),
    }
