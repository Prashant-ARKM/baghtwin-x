"""Optimizer tests: the hard-constraint guarantee, verification against the full twin, receipts, replay, audit log."""
import json
import tempfile
import time
from pathlib import Path

import numpy as np

from optimizer import search as Sr
from optimizer import service as sv
from optimizer import settings as S
from optimizer.evaluator import evaluate_states
from physics import credibility, twin
from physics.config import DEFAULT_PARAMS as P

CONSTRAINT_FILE = Path(__file__).resolve().parent.parent / "data" / "constraint_test.json"
WEIGHT_SETS = [
    None,                                                                     # defaults
    {"oil": 5, "sor": 0, "energy": 0, "failure": 0, "risk": 0},              # pure oil: the hardest test of the limits
    {"oil": 1, "sor": 2, "energy": 3, "failure": 3, "risk": 4},              # cautious
]


def _check_plan_against_limits(cycle, css, schedule, from_day):
    """Re-simulate with the full twin and check the MARGIN-FREE limits on every day from from_day."""
    p = twin.active_params()
    res = twin.simulate_cycle(cycle, css, Sr.to_srp(schedule), p)
    rows = Sr.constraint_rows(res, from_day, margin=0.0)
    bad = [r["name"] for r in rows if r["violated"]]
    return bad, res


# ----------------------------------------------------------------------------------------------- core
def test_batch_evaluator_matches_twin_exactly():
    p = twin.active_params()
    css = twin.normalize_css(None)
    css["cutoff_day"] = 300.0
    days = np.arange(19, 301)
    ev = evaluate_states(4, css, p, days, np.array([6.0, 3.0]), np.array([2.7, 2.1]))
    for j, (spm, st) in enumerate([(6.0, 2.7), (3.0, 2.1)]):
        r = twin.simulate_cycle(4, css, {"spm": spm, "stroke_m": st}, p)
        m = r.days >= r.meta["prod_start_day"]
        for k, kk in [("oil_bpd", "oil_rate_bpd"), ("ppr_kn", "ppr_kn"), ("mprl_kn", "mprl_kn"), ("fillage", "fillage"),
                      ("p_float", "float_probability"), ("power_kw", "power_kw")]:
            assert np.allclose(ev[k][:, j], r.a[kk][m][:len(days)], rtol=1e-9, atol=1e-9), k


def test_baseline_breaks_limits_and_srp_only_fixes_it():
    o = sv.optimize({"cycle": 4, "mode": "srp_only"})
    assert o["baseline"]["feasible"] is False
    assert {"peak_load_kn", "min_fillage", "float_probability"} <= set(o["baseline"]["violations"])
    assert o["recommended"]["feasible"] is True and o["recommended"]["violations"] == []
    # same oil, far lower risk, lower energy per barrel
    assert abs(o["recommended"]["oil_bbl"] / o["baseline"]["oil_bbl"] - 1.0) < 0.02
    assert o["recommended"]["risk"] < 0.01 * o["baseline"]["risk"]
    assert o["recommended"]["energy"] < o["baseline"]["energy"]
    assert o["recommended"]["max_float_probability"] < P["limit_float_prob"]


def test_plan_numbers_equal_full_resimulation():
    p = twin.active_params()
    css = twin.normalize_css(None)
    cand = Sr.make_candidate(4, css, p, fine=True, horizon=int(css["cutoff_day"]))
    plan, res, rounds = Sr.solve_verified(4, cand, p, Sr.norm_weights(None), fixed_cutoff=int(css["cutoff_day"]))
    e = Sr.economics(res, p)
    assert abs(plan["oil_bbl"] - e["oil_bbl"]) < 1e-6 * e["oil_bbl"]
    assert abs(plan["net_value_usd"] - e["net_value_usd"]) < 1e-4 * abs(e["net_value_usd"])
    assert rounds == 0                                              # DP and twin agree: no repair needed


def test_dp_beats_every_feasible_constant_setting():
    p = twin.active_params()
    css = twin.normalize_css(None)
    o = sv.optimize({"cycle": 4, "mode": "srp_only"})
    best_const = -1e18
    for spm in (2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0):
        for st in (1.8, 2.1, 2.4, 2.7, 3.0):
            res = twin.simulate_cycle(4, css, {"spm": spm, "stroke_m": st}, p)
            if not [r for r in Sr.constraint_rows(res) if r["violated"]]:
                best_const = max(best_const, Sr.economics(res, p)["net_value_usd"])
    assert best_const > 0
    assert o["recommended"]["net_value_usd"] >= 0.97 * best_const


def test_schedule_changes_are_bounded():
    o = sv.optimize({"cycle": 4, "mode": "srp_only"})
    segs = o["recommended"]["srp"]
    for a, b in zip(segs[:-1], segs[1:]):
        assert abs(b["spm"] - a["spm"]) <= S.MAX_DSPM + 1e-9
        assert abs(b["stroke_m"] - a["stroke_m"]) <= S.MAX_DSTROKE + 1e-9
        assert b["start_day"] == a["end_day"] + 1                    # contiguous


def test_rolling_horizon_keeps_the_past_fixed():
    o = sv.optimize({"cycle": 4, "mode": "srp_only", "current_day": 90})
    segs = o["recommended"]["srp"]
    assert segs[0]["spm"] == P["spm_baseline"] and segs[0]["stroke_m"] == P["stroke_baseline_m"]
    assert segs[0]["end_day"] >= 85                                  # baseline held until (about) day 90
    assert o["recommended"]["feasible"] is True                      # future days respect every limit


def test_pareto_filter_keeps_only_non_dominated_points():
    pts = [{"oil_per_cycle_day": 20, "sor": 2.0, "energy_kwh_per_bbl": 200, "risk": 0.01},
           {"oil_per_cycle_day": 25, "sor": 3.0, "energy_kwh_per_bbl": 300, "risk": 0.01},
           {"oil_per_cycle_day": 15, "sor": 2.5, "energy_kwh_per_bbl": 250, "risk": 0.02},     # dominated by the first
           {"oil_per_cycle_day": 10, "sor": 1.0, "energy_kwh_per_bbl": 100, "risk": 0.05}]
    keep = Sr.pareto_filter(pts)
    assert pts[2] not in keep and len(keep) == 3


# ----------------------------------------------------------------------------------------------- the guarantee
def test_no_recommended_point_violates_a_hard_constraint():
    """Sweep cycles, weights, rolling-horizon days and both modes. Every recommended plan and every feasible-flagged Pareto
    point is re-simulated with the full twin and checked against the MARGIN-FREE limits. Result is written to
    data/constraint_test.json and shown on the Credibility screen."""
    t0 = time.time()
    runs, plans_checked, violations, details = 0, 0, [], []
    jobs = [("srp_only", c, w, d) for c in (2, 4, 5) for w in WEIGHT_SETS for d in (0.0, 90.0)]
    jobs += [("joint", 4, WEIGHT_SETS[0], 0.0), ("joint", 2, WEIGHT_SETS[2], 0.0), ("joint", 5, WEIGHT_SETS[1], 0.0)]
    for mode, cycle, w, day in jobs:
        o = sv.optimize({"cycle": cycle, "mode": mode, "weights": w, "current_day": day})
        runs += 1
        from_day = day if mode == "srp_only" else 0.0
        for item in [o["recommended"]] + [q for q in o["pareto"] if q["feasible"]]:
            bad, _ = _check_plan_against_limits(cycle, item["css"], item["srp"], from_day)
            plans_checked += 1
            if bad:
                violations.append({"mode": mode, "cycle": cycle, "day": day, "violated": bad})
        p = twin.active_params()
        lo_p, hi_p = p["limit_min_inj_pressure_mpa"], p["limit_inj_pressure_mpa"]
        assert lo_p <= o["recommended"]["css"]["injection_pressure_mpa"] <= hi_p
        assert 120 <= o["recommended"]["css"]["cutoff_day"] <= 300 or mode == "srp_only"
        details.append({"mode": mode, "cycle": cycle, "current_day": day, "weights": w or "default"})
    result = {
        "status": "passed" if not violations else "FAILED", "simulation": True,
        "scenarios_run": runs, "plans_rechecked_with_full_twin": plans_checked, "violations_found": len(violations),
        "check": "margin-free limits (peak load, min fillage, float probability, SPM, stroke, injection pressure) "
                 "on every production day from the decision day",
        "scenario_grid": {"modes": ["srp_only", "joint"], "cycles": [2, 4, 5],
                          "weights": ["default", "oil only", "cautious"], "current_days": [0, 90]},
        "seconds": round(time.time() - t0, 1),
        "run_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "note": "Synthetic twin. Shows the optimizer never returns a plan the twin says breaks a limit; "
                "it does not prove safety on a real well.",
    }
    try:
        CONSTRAINT_FILE.parent.mkdir(parents=True, exist_ok=True)
        CONSTRAINT_FILE.write_text(json.dumps(result, indent=2))
    except OSError:
        pass
    assert not violations, violations
    assert credibility.constraint_test_result().get("status") in ("passed", "pending")


# ----------------------------------------------------------------------------------------------- joint + receipt
def test_joint_mode_contract_and_receipt():
    o = sv.optimize({"cycle": 4, "mode": "joint"})
    for k in ("pareto", "recommended", "baseline", "active_constraints", "receipt", "trajectories", "simulation",
              "model_version"):
        assert k in o
    for k in ("css", "srp", "oil_bbl", "sor", "energy", "risk", "feasible"):
        assert k in o["recommended"] and all(k in q for q in o["pareto"])
    r = o["receipt"]
    for k in ("current_state", "prediction_no_action", "recommended_action", "why", "constraint_margins", "confidence",
              "what_if", "audit_stub"):
        assert k in r
    assert o["recommended"]["feasible"] and any(q["is_recommended"] for q in o["pareto"])
    assert r["audit_stub"]["status"] == "pending_human_decision" and "recommend-only" in r["audit_stub"]["autonomy_level"]
    assert len(r["why"]) >= 3 and r["confidence"]["level"] in ("high", "medium", "low")
    labels = {w["label"]: w for w in r["what_if"]}
    assert any(w["violations"] for k, w in labels.items() if k.startswith("No action"))       # doing nothing is unsafe
    assert not labels["Recommended plan"]["violations"]
    # CSS stays inside the trust region and the model validity range
    css, cur = o["recommended"]["css"], o["baseline"]["css"]
    assert abs(css["steam_volume_m3"] / cur["steam_volume_m3"] - 1.0) <= S.CSS_TRUST["steam_volume_frac"] + 0.01
    assert abs(css["injection_pressure_mpa"] - cur["injection_pressure_mpa"]) <= S.CSS_TRUST["pressure_mpa"] + 0.06
    assert abs(css["soak_days"] - cur["soak_days"]) <= S.CSS_TRUST["soak_days"] + 0.5
    # trajectories are aligned arrays
    for key in ("no_action", "with_action"):
        t = o["trajectories"][key]
        assert len(t["days"]) == len(t["float_probability"]) == len(t["oil_rate_bpd"])
    assert o["trajectories"]["with_action"]["float_event_day"] is None


def test_optimizer_is_deterministic_and_json_safe():
    a = sv.optimize({"cycle": 4, "mode": "joint", "weights": {"oil": 1.3}})
    sv._CACHE.clear()
    b = sv.optimize({"cycle": 4, "mode": "joint", "weights": {"oil": 1.3}})
    assert a["recommended"]["css"] == b["recommended"]["css"] and a["recommended"]["srp"] == b["recommended"]["srp"]
    json.dumps(a, allow_nan=False)                                    # no NaN/inf leaks into the API


def test_bad_requests_are_rejected():
    for req in ({"cycle": 9}, {"mode": "wild"}):
        try:
            sv.optimize(req)
        except ValueError:
            continue
        raise AssertionError(f"accepted {req}")
    for bad in ({"steam_volume_m3": 5000}, {"injection_pressure_mpa": 20}, {"colour": 1}):
        try:
            sv.validate_css(bad)
        except ValueError:
            continue
        raise AssertionError(f"accepted {bad}")
    try:
        sv.validate_srp({"spm": 12, "stroke_m": 2.7})
    except ValueError:
        pass
    else:
        raise AssertionError("accepted spm 12")


# ----------------------------------------------------------------------------------------------- replay + audit
def test_replay_shows_recommendation_holding_on_a_different_plant():
    r = sv.replay(4)
    n = len(r["days"])
    pva = r["predicted_vs_actual"]
    assert len(pva["predicted_oil_bpd"]) == len(pva["actual_oil_bpd"]) == len(pva["lo_bpd"]) == n
    assert r["held_out"] is True and r["mae"] > 0 and 0.7 <= r["interval_coverage"] <= 1.0
    chk = r["plant_proxy_check"]
    assert chk["baseline"]["feasible"] is False and chk["recommended"]["feasible"] is True
    d = r["headline_deltas"]
    assert d["risk"]["delta"] < 0 and d["energy_kwh_per_bbl"]["delta"] < 0
    assert abs(d["oil_bbl"]["delta_pct"]) < 3.0
    assert "SIMULATED" in r["label"]
    json.dumps(r, allow_nan=False)


def test_audit_log_appends_and_reads_back():
    receipt = sv.optimize({"cycle": 4, "mode": "srp_only"})["receipt"]
    original = sv.AUDIT_FILE
    with tempfile.TemporaryDirectory() as d:
        sv.AUDIT_FILE = Path(d) / "audit_log.json"
        try:
            e1 = sv.record_decision(receipt, "approve", "Looks consistent with rod-float physics.")
            e2 = sv.record_decision(receipt, "reject", "Waiting for the next dyno card.")
            log = sv.list_recommendations()["entries"]
            assert [e["id"] for e in log] == [1, 2] and e1["decision"] == "approve" and e2["decision"] == "reject"
            assert log[0]["receipt"]["audit_stub"]["status"] == "pending_human_decision"
            assert "nothing sent to the well" in log[0]["autonomy_level"]
            try:
                sv.record_decision(receipt, "maybe", "")
            except ValueError:
                pass
            else:
                raise AssertionError("accepted invalid decision")
        finally:
            sv.AUDIT_FILE = original
