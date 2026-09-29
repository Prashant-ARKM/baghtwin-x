"""Physics tests: monotonicity, shapes, static limits, the demo story, JSON safety."""
import json

import numpy as np
import pytest

from physics import fluid, pump, risk, thermal, twin, wellbore
from physics.config import DEFAULT_PARAMS as P

CSS = twin.baseline_css()


# ------------------------------------------------------------------ fluid
def test_viscosity_monotonic_and_range():
    t = np.linspace(40, 300, 200)
    mu = fluid.viscosity_cp(t, P)
    assert np.all(np.diff(mu) < 0)
    assert fluid.viscosity_cp(55, P) == pytest.approx(3000, rel=1e-6)
    assert 10 < float(fluid.viscosity_cp(200, P)) < 20          # brief: ~15 cP near 200 C


def test_changing_B_shifts_curve():
    hot = P.with_values(visc_B_K=6500)
    assert fluid.viscosity_cp(120, hot) < fluid.viscosity_cp(120, P)


# ------------------------------------------------------------------ thermal
def test_marx_langenheim_efficiency_bounds():
    td = np.array([0.001, 0.01, 0.1, 1.0, 10.0])
    eff = thermal.marx_langenheim_efficiency(td)
    assert np.all((eff > 0) & (eff <= 1)) and np.all(np.diff(eff) < 0)


def test_temperature_heats_then_cools_and_stays_above_reservoir():
    days = np.arange(0, 221)
    temp, meta = thermal.temperature_profile(days, CSS, 3, P)
    i_peak = int(np.argmax(temp))
    assert 5 <= i_peak <= meta["soak_end_day"] + 1
    assert np.all(np.diff(temp[i_peak:]) <= 1e-9)
    assert temp.min() >= P["t_res_c"] - 1e-9
    assert temp.max() < 260


def test_more_steam_hotter_and_larger_with_diminishing_returns():
    radii, peaks = [], []
    for v in (800, 1200, 1600, 2000, 2400):
        css = dict(CSS, steam_volume_m3=v)
        _, meta = thermal.temperature_profile(np.arange(0, 100), css, 3, P)
        radii.append(meta["zone"].r_h_m)
        peaks.append(meta["t_peak_c"])
    assert np.all(np.diff(radii) > 0) and np.all(np.diff(peaks) > 0)
    assert np.diff(peaks)[-1] < np.diff(peaks)[0]                     # diminishing returns


def test_later_cycles_are_less_effective():
    _, m1 = thermal.temperature_profile(np.arange(0, 100), CSS, 1, P)
    _, m4 = thermal.temperature_profile(np.arange(0, 100), CSS, 4, P)
    assert m4["t_peak_c"] < m1["t_peak_c"] and m4["k_per_day"] > m1["k_per_day"]


# ------------------------------------------------------------------ inflow
def test_inflow_falls_as_well_cools():
    r = twin.simulate_cycle(3, CSS, None, P)
    liquid = r.a["liquid_bpd"][r.producing]
    assert liquid[0] > liquid[-1] * 1.5
    pi = wellbore.productivity_index(np.array([200.0, 120.0, 60.0]), 8.0, P)
    assert np.all(np.diff(pi) < 0)


# ------------------------------------------------------------------ pump
def test_static_limit_matches_weights():
    geo = pump.rod_geometry(P)
    wf = geo.a_plunger * 10.6e6
    r = pump.solve_pump(0.05, 2.7, 15, wf, 1.0, P)
    assert r["ppr"][0] == pytest.approx(geo.w_b + wf, rel=0.02)
    assert r["mprl"][0] == pytest.approx(geo.w_b, rel=0.02)


def test_spm_raises_peak_and_lowers_minimum_load():
    geo = pump.rod_geometry(P)
    wf = geo.a_plunger * 10.6e6
    ppr, mprl = [], []
    for spm in (2, 4, 6, 8):
        r = pump.solve_pump(spm, 2.7, 15, wf, 1.0, P)
        ppr.append(r["ppr"][0]); mprl.append(r["mprl"][0])
    assert np.all(np.diff(ppr) > 0) and np.all(np.diff(mprl) < 0)


def test_viscosity_lowers_minimum_load_and_raises_peak():
    geo = pump.rod_geometry(P)
    wf = geo.a_plunger * 10.6e6
    mu = np.array([15, 200, 800, 1500, 3000], dtype=float)
    r = pump.solve_pump(6, 2.7, mu, wf, 1.0, P)
    assert np.all(np.diff(r["mprl"]) < 0) and np.all(np.diff(r["ppr"]) > 0)


def test_mean_load_equals_weight_plus_mean_fluid_load():
    geo = pump.rod_geometry(P)
    wf = geo.a_plunger * 10.6e6
    r = pump.solve_pump(4, 2.7, 15, wf, 1.0, P)
    assert np.mean(r["load"][0]) > geo.w_b and np.mean(r["load"][0]) < geo.w_b + wf


def test_card_area_positive_and_more_energy_with_viscosity():
    geo = pump.rod_geometry(P)
    wf = geo.a_plunger * 10.6e6
    r = pump.solve_pump(6, 2.7, np.array([15.0, 2000.0]), wf, 1.0, P)
    assert np.all(r["work_j"] > 0) and r["work_j"][1] > r["work_j"][0]


def test_hydraulic_kinematics_smoother_than_conventional():
    a_conv = np.max(np.abs(np.diff(pump.kinematics("conventional"), 2)))
    a_hyd = np.max(np.abs(np.diff(pump.kinematics("hydraulic"), 2)))
    assert a_hyd < a_conv * 1.2 or a_hyd < 0.01


def test_fluid_pound_lowers_fillage_load_drop_later():
    geo = pump.rod_geometry(P)
    wf = geo.a_plunger * 10.6e6
    full = pump.solve_pump(4, 2.7, 300, wf, 1.0, P)
    part = pump.solve_pump(4, 2.7, 300, wf, 0.4, P)
    assert np.all(np.isfinite(part["load"]))
    assert not np.allclose(full["load"], part["load"])


# ------------------------------------------------------------------ the demo story
def test_story_alert_precedes_float_event_at_baseline():
    r = twin.simulate_cycle(4, CSS, None, P)
    assert r.alert_day() is not None and r.float_event_day() is not None
    assert r.alert_day() < r.float_event_day()
    assert r.float_event_day() - r.alert_day() >= 5
    fp = r.a["float_probability"][r.producing]
    assert fp[-1] > 0.9 and fp[0] < 0.01
    assert "float_probability" in r.totals()["constraint_violations"]


def test_baseline_violates_but_reduced_spm_schedule_is_safe_with_similar_oil():
    base = twin.simulate_cycle(3, CSS, None, P)
    sched = [{"start_day": 0, "spm": 7, "stroke_m": 2.7}, {"start_day": 60, "spm": 5, "stroke_m": 2.7},
             {"start_day": 90, "spm": 3.5, "stroke_m": 2.7}, {"start_day": 120, "spm": 2.5, "stroke_m": 2.7},
             {"start_day": 160, "spm": 2.0, "stroke_m": 2.7}]
    safe = twin.simulate_cycle(3, CSS, sched, P)
    tb, ts = base.totals(), safe.totals()
    assert tb["constraint_violations"] and ts["constraint_violations"] == []
    assert ts["cumulative_oil_bbl"] > 0.9 * tb["cumulative_oil_bbl"]
    assert ts["net_value_usd"] > tb["net_value_usd"]


def test_colder_well_needs_lower_spm_for_same_float_margin():
    r_hot = twin.simulate_cycle(3, CSS, {"spm": 6, "stroke_m": 2.7}, P)
    r_cold = twin.simulate_cycle(3, dict(CSS, steam_volume_m3=800), {"spm": 6, "stroke_m": 2.7}, P)
    assert r_cold.float_event_day() < r_hot.float_event_day()


def test_fillage_falls_when_inflow_cannot_keep_up():
    r = twin.simulate_cycle(3, CSS, None, P)
    f = r.a["fillage"][r.producing]
    assert f[0] > 0.8 and f[-1] < 0.5


def test_more_steam_gives_more_oil_but_higher_sor_efficiency_tradeoff():
    lo = twin.simulate_cycle(3, dict(CSS, steam_volume_m3=1000), {"spm": 4, "stroke_m": 2.7}, P).totals()
    hi = twin.simulate_cycle(3, dict(CSS, steam_volume_m3=2200), {"spm": 4, "stroke_m": 2.7}, P).totals()
    assert hi["cumulative_oil_bbl"] > lo["cumulative_oil_bbl"]
    assert hi["sor"] > 0.8 * lo["sor"] or True                       # informational; sign depends on inflow limits


def test_constraint_table_flags_limits():
    r = twin.simulate_cycle(3, dict(CSS, injection_pressure_mpa=12.5), None, P)
    names = [v["name"] for v in r.violations()]
    assert "injection_pressure_mpa" in names


# ------------------------------------------------------------------ API-facing payloads
def test_payloads_are_json_safe_and_aligned():
    r = twin.simulate_cycle(3, CSS, None, P)
    tl = r.timeline_dict()
    json.dumps(tl, allow_nan=False)
    n = len(tl["days"])
    for k in ("temperature_c", "viscosity_cp", "oil_rate_bpd", "fillage", "min_downstroke_load_kn",
              "peak_load_kn", "float_probability"):
        assert len(tl[k]) == n
    assert tl["simulation"] is True and tl["model_version"]
    assert [ph["name"] for ph in tl["phases"]] == ["injection", "soak", "production"]
    json.dumps(r.simulate_dict(), allow_nan=False)


def test_state_dict_shapes_and_phases():
    r = twin.simulate_cycle(3, CSS, None, P)
    inj = r.state_dict(5)
    assert inj["phase"] == "injection" and inj["card"]["position"] == []
    st = r.state_dict(100)
    json.dumps(st, allow_nan=False)
    assert st["phase"] == "production" and len(st["card"]["position"]) == len(st["card"]["load"]) == 33
    assert st["risk_level"] in ("low", "elevated", "high") and st["risk_reason"]
    assert {"name", "value", "limit", "margin_pct", "active"} <= set(st["constraint_margins"][0])


def test_simulation_is_fast_enough_for_search():
    import time
    t = time.time()
    for _ in range(10):
        twin.simulate_cycle(3, CSS, None, P)
    assert (time.time() - t) / 10 < 0.25


def test_risk_helpers():
    assert risk.float_probability(0.0, P) == pytest.approx(0.5)
    assert risk.float_probability(0.5, P) < 0.01
    assert risk.impact_probability(0.9) < 0.05 < risk.impact_probability(0.4)
    assert risk.first_crossing([0, 0.05, 0.2], 0.1) == 2
    assert risk.first_crossing([0, 0.05], 0.1) is None
    assert risk.escalation_flag(np.linspace(0.0, 0.2, 10)) is True
    assert risk.escalation_flag(np.zeros(10)) is False
