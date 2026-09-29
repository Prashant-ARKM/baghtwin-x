"""Single source of truth for every physical parameter, limit and price.

Every parameter carries a tag:
  Known     - from OIL public information or standard physical data
  Estimated - derived from a Known value by a stated relation
  Assumed   - chosen by the modelling team; MUST be replaced with OIL data in a pilot

Nothing here is Baghewala-calibrated. All results are SIMULATION.
"""
from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Dict, Iterable, List, Optional

MODEL_VERSION = "baghtwin-physics-0.1.0"


@dataclass(frozen=True)
class Param:
    name: str
    value: float
    unit: str
    tag: str  # "Known" | "Estimated" | "Assumed"
    note: str


def _p(name, value, unit, tag, note):
    return Param(name, float(value), unit, tag, note)


_ENG = "Owner: engineering authority (placeholder value, not set by the software team)."

_DEFAULTS: List[Param] = [
    # ---- well and rod string --------------------------------------------------
    _p("depth_m", 1150, "m", "Known", "Jodhpur Sandstone average depth, OIL public information."),
    _p("api_gravity", 18, "deg API", "Known", "OIL reports 17-19 API heavy oil."),
    _p("oil_density_kgm3", 945, "kg/m3", "Estimated", "From 18 API: 141.5/(131.5+API)*1000."),
    _p("water_cut", 0.10, "fraction", "Assumed", "Constant water cut for the demo."),
    _p("plunger_d_mm", 25.4, "mm", "Assumed", "Pump plunger diameter (1 in), sized for the demo well rates."),
    _p("rod_d_mm", 22.2, "mm", "Assumed", "Single 7/8 in rod taper (real strings are tapered)."),
    _p("tubing_id_mm", 62, "mm", "Assumed", "2-7/8 in tubing inside diameter."),
    _p("rod_E_gpa", 205, "GPa", "Known", "Steel Young's modulus."),
    _p("rod_rho_kgm3", 7850, "kg/m3", "Known", "Steel density."),
    # ---- reservoir ------------------------------------------------------------
    _p("t_res_c", 55, "degC", "Assumed", "Undisturbed reservoir temperature."),
    _p("p_res_mpa", 6.0, "MPa", "Assumed", "Average reservoir pressure at cycle 1 (depleted)."),
    _p("res_depl_mpa_per_cycle", 0.25, "MPa/cycle", "Assumed", "Pressure decline per completed cycle."),
    _p("perm_d", 0.85, "D", "Assumed", "Effective permeability to oil."),
    _p("pay_h_m", 30, "m", "Assumed", "Net pay thickness."),
    _p("r_e_m", 80, "m", "Assumed", "Drainage radius."),
    _p("r_w_m", 0.108, "m", "Assumed", "Wellbore radius (8.5 in hole)."),
    _p("vhc_mj_m3k", 2.3, "MJ/m3/K", "Assumed", "Volumetric heat capacity of rock plus fluids."),
    _p("ob_diffusivity_m2_day", 0.06, "m2/day", "Assumed", "Overburden thermal diffusivity (Marx-Langenheim)."),
    # ---- steam and thermal ------------------------------------------------------
    _p("inj_rate_m3d", 140, "m3/day CWE", "Assumed", "Steam injection rate (cold-water equivalent)."),
    _p("steam_quality", 0.70, "fraction", "Assumed", "Bottom-hole steam quality."),
    _p("boiler_eff", 0.82, "fraction", "Assumed", "Steam generator fuel-to-steam efficiency."),
    _p("wb_loss_frac", 0.07, "fraction", "Assumed", "Heat lost in wellbore/VIT during injection."),
    _p("wb_temp_drop_c", 15, "degC", "Assumed", "Steam temperature drop from surface to sandface (VIT)."),
    _p("r_char_m", 6.0, "m", "Assumed", "Characteristic radius: near-wellbore peak temperature vs heated radius."),
    _p("r_ref_m", 9.0, "m", "Assumed", "Reference heated radius for the decay constant."),
    _p("k_decay_ref_per_day", 0.018, "1/day", "Assumed", "Thermal decay constant at the reference radius (brief: 0.015-0.03)."),
    _p("k_decay_exp", 0.8, "-", "Assumed", "Larger heated zones cool more slowly: k ~ (r_ref/r_h)^exp."),
    _p("cycle_k_growth", 0.05, "fraction/cycle", "Assumed", "Faster cooling with each cycle."),
    _p("cycle_peak_degrade", 0.025, "fraction/cycle", "Assumed", "Lower peak heating with each cycle."),
    _p("soak_cooling_factor", 0.4, "-", "Assumed", "Cooling during soak relative to production."),
    _p("zone_avg_frac", 0.75, "fraction", "Assumed", "Heated-zone mean temperature rise relative to sandface rise."),
    # ---- fluid ---------------------------------------------------------------
    _p("visc_ref_cp", 3000, "cP", "Assumed", "Viscosity at the reference temperature (brief: ~3000 cP near reservoir T)."),
    _p("visc_ref_temp_c", 55, "degC", "Assumed", "Reference temperature for the viscosity curve."),
    _p("visc_B_K", 5670, "K", "Assumed", "Arrhenius constant; gives ~15 cP near 200 degC. Fit to OIL lab data in a pilot."),
    # ---- wellbore ------------------------------------------------------------------
    _p("t_amb_c", 30, "degC", "Assumed", "Mean ambient temperature at surface."),
    _p("pump_temp_eff", 0.85, "fraction", "Assumed", "Fraction of sandface temperature rise reaching the pump."),
    _p("tubing_loss_frac", 0.20, "fraction", "Assumed", "Temperature loss pump-to-surface as fraction of (T_pump - T_amb) (VIT)."),
    _p("p_wellhead_mpa", 0.5, "MPa", "Assumed", "Tubing head (flowline) pressure."),
    _p("p_min_intake_mpa", 0.5, "MPa", "Assumed", "Minimum practical pump-intake pressure (pump-off)."),
    # ---- pump and rods ---------------------------------------------------------------
    _p("spm_baseline", 6.0, "strokes/min", "Assumed", "Current fixed-setting operation (baseline)."),
    _p("stroke_baseline_m", 2.7, "m", "Assumed", "Current fixed-setting operation (baseline)."),
    _p("spm_min", 2.0, "strokes/min", "Assumed", "Safe SPM range. " + _ENG),
    _p("spm_max", 8.0, "strokes/min", "Assumed", "Safe SPM range. " + _ENG),
    _p("stroke_min_m", 1.5, "m", "Assumed", "Safe stroke range. " + _ENG),
    _p("stroke_max_m", 3.0, "m", "Assumed", "Safe stroke range. " + _ENG),
    _p("drag_enhancement", 2.5, "-", "Assumed", "Couplings, guides and deposits multiply annular viscous drag."),
    _p("base_damping_factor", 0.10, "-", "Assumed", "Gibbs dimensionless rod damping for light fluid (typical 0.05-0.15)."),
    _p("valve_resist_m", 800, "N/(Pa.s*m/s)", "Assumed", "Traveling-valve viscous resistance on the downstroke."),
    _p("fill_eff_max", 0.90, "fraction", "Assumed", "Maximum volumetric efficiency (slippage, shrinkage)."),
    _p("fill_visc_kappa", 0.15, "-", "Assumed", "Viscous barrel-filling loss coefficient."),
    _p("drive_eff", 0.75, "fraction", "Assumed", "Motor, gearbox and belt efficiency."),
    # ---- hard limits (engineering authority) ---------------------------------------------
    _p("limit_inj_pressure_mpa", 12.0, "MPa", "Assumed", "Maximum injection pressure. " + _ENG),
    _p("limit_min_inj_pressure_mpa", 4.0, "MPa", "Assumed", "Minimum useful injection pressure (steam temperature)."),
    _p("limit_peak_load_kn", 60.0, "kN", "Assumed", "Maximum polished-rod load (rod stress envelope). " + _ENG),
    _p("limit_min_fillage", 0.45, "fraction", "Assumed", "Minimum pump fillage. " + _ENG),
    _p("limit_float_prob", 0.20, "probability", "Assumed", "Maximum rod-float probability. " + _ENG),
    _p("alert_float_prob", 0.10, "probability", "Assumed", "Float-risk alert threshold. " + _ENG),
    _p("sigma_float", 0.12, "fraction of buoyant weight", "Assumed", "Model uncertainty on the minimum downstroke load."),
    _p("limit_margin_frac", 0.05, "fraction", "Assumed", "Uncertainty margin the optimizer keeps from hard limits. " + _ENG),
    # ---- economics (placeholders) ------------------------------------------------------------
    _p("oil_price_usd_bbl", 70, "USD/bbl", "Assumed", "Placeholder. Replace with OIL realisation."),
    _p("steam_fuel_usd_gj", 6.0, "USD/GJ", "Assumed", "Placeholder fuel cost."),
    _p("power_usd_kwh", 0.09, "USD/kWh", "Assumed", "Placeholder electricity cost."),
    _p("workover_cost_usd", 30000, "USD", "Assumed", "Placeholder rod-failure workover cost."),
    _p("failure_hazard_per_day", 0.005, "1/day per unit risk", "Assumed", "Daily failure hazard per unit of float/impact risk."),
]

_BY_NAME = {p.name: p for p in _DEFAULTS}


class ParamSet:
    """Immutable-style parameter bundle. Use p['name'] to read a value."""

    def __init__(self, overrides: Optional[Dict[str, float]] = None):
        self._p: Dict[str, Param] = dict(_BY_NAME)
        for k, v in (overrides or {}).items():
            if k not in self._p:
                raise KeyError(f"Unknown parameter: {k}")
            self._p[k] = replace(self._p[k], value=float(v))

    def __getitem__(self, name: str) -> float:
        return self._p[name].value

    def with_values(self, **vals: float) -> "ParamSet":
        new = ParamSet()
        new._p = dict(self._p)
        for k, v in vals.items():
            new._p[k] = replace(new._p[k], value=float(v))
        return new

    def scaled(self, **factors: float) -> "ParamSet":
        return self.with_values(**{k: self._p[k].value * f for k, f in factors.items()})

    def as_list(self) -> List[dict]:
        return [
            {"name": q.name, "value": q.value, "unit": q.unit, "tag": q.tag, "note": q.note}
            for q in self._p.values()
        ]

    def names(self) -> Iterable[str]:
        return self._p.keys()


DEFAULT_PARAMS = ParamSet()

WELL_INFO = {
    "id": "BGW-DEMO-01",
    "name": "Baghewala demo well (synthetic)",
    "pump_type": "conventional",
    "rod_string_description": "Single 7/8 in steel rod string, 25.4 mm plunger (synthetic demo configuration)",
}
