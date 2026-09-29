"""Service layer: everything the API needs, as plain functions (no web framework here, so it is unit-testable).

optimize()   -> constrained recommendation + Pareto set + engineering receipt   (recommend-only, L2)
replay()     -> held-out cycle: baseline vs recommended, predicted vs actual (synthetic)
audit log    -> JSON file, append-only from the API's point of view
"""
from __future__ import annotations

import copy
import hashlib
import json
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np

from physics import calibration as cal
from physics import twin
from physics.config import DEFAULT_PARAMS, MODEL_VERSION, ParamSet
from physics.twin import _clean

from . import search as Sr
from . import settings as S

try:
    from simdata.generator import HISTORY_CSS, get_history, true_params
except ImportError:  # package layout
    from ..simdata.generator import HISTORY_CSS, get_history, true_params

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
AUDIT_FILE = DATA_DIR / "audit_log.json"
_LOCK = threading.Lock()
_CACHE: Dict[str, dict] = {}
_CSS_KEYS = ("steam_volume_m3", "injection_pressure_mpa", "soak_days", "cutoff_day")
SCENARIO_LABELS = {"requested": "Balanced (requested weights)", "max_oil": "Maximum oil",
                   "efficiency": "Steam / energy efficiency", "safety": "Lowest risk"}


# ----------------------------------------------------------------------------------------- defaults
def default_css(cycle: int) -> dict:
    """Operator's CSS design for a cycle: the historical design for cycles 1-4, the current baseline otherwise."""
    return dict(HISTORY_CSS[cycle]) if cycle in HISTORY_CSS else twin.baseline_css()


def _srp_of(schedule: List[dict]) -> List[dict]:
    return [{k: s[k] for k in ("start_day", "end_day", "spm", "stroke_m")} for s in schedule]


def _baseline_schedule(p: ParamSet, css: dict) -> List[dict]:
    ps = Sr.prod_start_day(twin.normalize_css(css), p)
    return [{"start_day": ps, "end_day": int(css.get("cutoff_day", 220)), "spm": p["spm_baseline"],
             "stroke_m": p["stroke_baseline_m"]}]


# ----------------------------------------------------------------------------------------- shaping
def _shape(css: dict, schedule: List[dict], e: dict, viol: List[str], label: Optional[str] = None) -> dict:
    out = {
        "css": {k: float(css[k]) for k in _CSS_KEYS},
        "srp": _srp_of(schedule),
        "oil_bbl": e["oil_bbl"], "oil_per_cycle_day": e["oil_per_cycle_day"], "sor": e["sor"], "energy": e["energy_kwh_per_bbl"], "risk": e["risk"],
        "feasible": len(viol) == 0, "violations": viol,
        "max_float_probability": e["max_float_probability"], "min_fillage": e["min_fillage"],
        "max_peak_load_kn": e["max_peak_load_kn"], "net_value_usd": e["net_value_usd"],
        "value_per_cycle_day": e["value_per_cycle_day"],
    }
    if label:
        out["label"] = label
    return out


def _run(cycle: int, css: dict, schedule_srp, p: ParamSet, from_day: float = 0.0):
    res = twin.simulate_cycle(cycle, css, schedule_srp, p)
    viol = [r["name"] for r in Sr.constraint_rows(res, from_day) if r["violated"]]
    return res, Sr.economics(res, p), viol


def _label_extremes(pts: List[dict]) -> None:
    """Name Pareto points by the objective they are best at."""
    if not pts:
        return
    best = {"Most oil per cycle-day": max(range(len(pts)), key=lambda i: pts[i]["oil_per_cycle_day"]),
            "Lowest SOR": min(range(len(pts)), key=lambda i: pts[i]["sor"]),
            "Lowest energy": min(range(len(pts)), key=lambda i: pts[i]["energy"]),
            "Lowest risk": min(range(len(pts)), key=lambda i: pts[i]["risk"])}
    names: Dict[int, List[str]] = {}
    for k, i in best.items():
        names.setdefault(i, []).append(k)
    n = 0
    for i, q in enumerate(pts):
        if i in names:
            q["label"] = " / ".join(names[i])
        else:
            n += 1
            q["label"] = f"Alternative {n}"


def _delta(a: dict, b: dict) -> dict:
    """b relative to a for the headline numbers."""
    out = {}
    for k in ("oil_bbl", "oil_per_cycle_day", "sor", "energy_kwh_per_bbl", "risk", "net_value_usd", "value_per_cycle_day"):
        out[k] = {"baseline": a[k], "recommended": b[k], "delta": b[k] - a[k],
                  "delta_pct": (b[k] / a[k] - 1.0) * 100.0 if abs(a[k]) > 1e-9 else None}
    return out


# ----------------------------------------------------------------------------------------- robustness
def robustness(cycle: int, css: dict, srp, from_day: float = 0.0, n: int = 20, seed: int = 3) -> dict:
    """Re-run a plan under parameter draws from the calibration uncertainty. Reports how often a hard limit is hit."""
    info = cal.calibration_info()
    rng = np.random.default_rng(seed)
    oil, viol, maxpf = [], 0, []
    for _ in range(n):
        sc = {k: float(np.clip(rng.normal(info["scales"][k], info["sd"][k]), 0.6, 1.6)) for k in cal.FIT_NAMES}
        pp = DEFAULT_PARAMS.scaled(**sc)
        res = twin.simulate_cycle(cycle, css, srp, pp)
        oil.append(float(np.nansum(res.a["oil_rate_bpd"][res.producing])))
        bad = Sr.violation_days(res, from_day)
        viol += int(bad.any())
        maxpf.append(float(np.nanmax(res.a["float_probability"][res.producing & (res.days >= from_day)])))
    oil = np.array(oil)
    return {"n_draws": n, "oil_bbl_p05": float(np.percentile(oil, 5)), "oil_bbl_p50": float(np.percentile(oil, 50)),
            "oil_bbl_p95": float(np.percentile(oil, 95)), "violation_fraction": viol / n,
            "worst_max_float_probability": float(np.max(maxpf))}


def _confidence(rec: dict, base: dict) -> dict:
    spread = (rec["oil_bbl_p95"] - rec["oil_bbl_p05"]) / max(rec["oil_bbl_p50"], 1.0)
    if rec["violation_fraction"] == 0.0 and spread < 0.10:
        level = "high"
    elif rec["violation_fraction"] <= 0.10:
        level = "medium"
    else:
        level = "low"
    return {
        "level": level, "recommended": rec, "no_action": base,
        "basis": ("Plan re-run under %d draws from the calibration parameter uncertainty (fitted on SYNTHETIC history). "
                  "Structural model error and real-plant differences are NOT covered." % rec["n_draws"]),
    }


# ----------------------------------------------------------------------------------------- receipt
def _what_if(label: str, cycle: int, css: dict, srp, p: ParamSet, from_day: float) -> dict:
    res, e, viol = _run(cycle, css, srp, p, from_day)
    fut = {r["name"]: r["value"] for r in Sr.constraint_rows(res, from_day)}      # decision day onward, like 'violations'
    return {"label": label, "oil_bbl": e["oil_bbl"], "sor": e["sor"], "energy": e["energy_kwh_per_bbl"],
            "max_float_probability": fut.get("float_probability", e["max_float_probability"]),
            "min_fillage": fut.get("min_fillage", e["min_fillage"]),
            "value_per_cycle_day": e["value_per_cycle_day"], "violations": viol}


def _delayed_srp(base_srp: dict, schedule: List[dict], t: int) -> List[dict]:
    """Baseline set-points until day t, then the recommended set-points."""
    out = [{"start_day": 0, "spm": base_srp["spm"], "stroke_m": base_srp["stroke_m"]}]
    cover = None
    for sg in schedule:
        if sg["start_day"] <= t:
            cover = sg
    if cover is not None:
        out.append({"start_day": t, "spm": cover["spm"], "stroke_m": cover["stroke_m"]})
    out += [{"start_day": sg["start_day"], "spm": sg["spm"], "stroke_m": sg["stroke_m"]}
            for sg in schedule if sg["start_day"] > t]
    return out


def _changes(cur: dict, new: dict) -> List[dict]:
    units = {"steam_volume_m3": "m3", "injection_pressure_mpa": "MPa", "soak_days": "days", "cutoff_day": "days"}
    return [{"variable": k, "from": cur[k], "to": new[k], "unit": units[k]}
            for k in _CSS_KEYS if abs(cur[k] - new[k]) > 1e-9]


def _describe_schedule(schedule: List[dict]) -> str:
    return "; ".join(f"days {s['start_day']}-{s['end_day']}: {s['spm']:.1f} SPM x {s['stroke_m']:.1f} m" for s in schedule)


def build_receipt(cycle, mode, weights, decision_day, cur_css, rec_css, base_res, rec_res, base_e, rec_e,
                  rec_sched, base_srp, p, from_day, robust_rec, robust_base, input_hash, rec_plan_emergency=False) -> dict:
    a, b = base_res.a, rec_res.a
    ps = int(base_res.meta["prod_start_day"])
    day0 = int(max(decision_day, ps))
    state = base_res.state_dict(day0)
    keep = ("day", "phase", "temperature_c", "viscosity_cp", "tubing_viscosity_cp", "oil_rate_bpd", "fillage",
            "float_probability", "risk_level", "spm", "stroke_m")
    current_state = {k: state.get(k) for k in keep}

    viol_days = Sr.violation_days(base_res, 0.0)                      # narrative: first breach anywhere in the cycle
    first_viol = int(base_res.days[viol_days][0]) if viol_days.any() else None
    pred_no_action = {
        "alert_day": base_res.alert_day(), "float_event_day": base_res.float_event_day(),
        "first_limit_violation_day": first_viol, "events": base_res.events(),
        "max_float_probability": base_e["max_float_probability"], "min_fillage": base_e["min_fillage"],
        "max_peak_load_kn": base_e["max_peak_load_kn"], "oil_bbl": base_e["oil_bbl"],
        "violations": [r["name"] for r in Sr.constraint_rows(base_res, from_day) if r["violated"]],
    }

    nxt = next((s for s in rec_sched if s["start_day"] <= day0 <= s["end_day"]), rec_sched[0])
    recommended_action = {
        "mode": mode, "effective_day": day0, "css_changes": _changes(cur_css, rec_css),
        "next_setpoint": {"spm": nxt["spm"], "stroke_m": nxt["stroke_m"], "from_day": day0},
        "schedule": _srp_of(rec_sched), "schedule_text": _describe_schedule(rec_sched),
        "autonomy": "L2: recommend-only. A human must approve; nothing is sent to the well.",
    }

    # ---- why: every sentence is computed from the two simulations
    why: List[str] = []
    m0 = (base_res.days >= max(from_day, ps)) & base_res.producing
    fb = {r["name"]: r["value"] for r in Sr.constraint_rows(base_res, from_day)}
    fr = {r["name"]: r["value"] for r in Sr.constraint_rows(rec_res, from_day)}
    since = f" (from day {from_day:.0f} on)" if from_day > 0 else ""
    if first_viol is not None:
        i = int(np.where(base_res.days == first_viol)[0][0])
        why.append(
            f"Without action ({base_srp['spm']:.1f} SPM x {base_srp['stroke_m']:.1f} m) the twin predicts the first hard-limit "
            f"breach on day {first_viol}: tubing viscosity has risen to {a['mu_tub_cp'][i]:.0f} cP as the near-wellbore "
            f"temperature cooled to {a['temperature_c'][i]:.0f} C. Peak polished-rod load reaches {fb['peak_load_kn']:.0f} kN, "
            f"minimum pump fillage falls to {fb['min_fillage']:.0%} and float probability reaches "
            f"{fb['float_probability']:.0%}{since}.")
    else:
        why.append("Without action the twin predicts no hard-limit breach in this cycle; the recommendation improves value.")
    first, last = rec_sched[0], rec_sched[-1]
    if len(rec_sched) > 1:
        i0 = int(np.where(rec_res.days == max(first["start_day"], day0))[0][0])
        i1 = int(np.where(rec_res.days == last["start_day"])[0][0])
        why.append(
            f"The schedule starts at {first['spm']:.1f} SPM x {first['stroke_m']:.1f} m "
            f"({'while the oil is still thin, ' if b['mu_tub_cp'][i0] < 300 else 'with '}{b['mu_tub_cp'][i0]:.0f} cP in the tubing) "
            f"and steps down to {last['spm']:.1f} SPM x {last['stroke_m']:.1f} m "
            f"by day {last['start_day']}, when it averages {b['mu_tub_cp'][i1]:.0f} cP: slower strokes cut viscous downstroke "
            f"drag and let the pump fill, keeping every hard limit inside its margin.")
    if rec_plan_emergency:
        why.append("The well is already breaching a hard limit at its current settings, so the first change is larger than the "
                   "normal per-step limit. Apply it under operator supervision.")
    why.append(
        f"Result under the same twin{since}: max float probability {fr['float_probability']:.1%} "
        f"(limit {p['limit_float_prob']:.0%}), min fillage {fr['min_fillage']:.0%} (limit {p['limit_min_fillage']:.0%}), "
        f"peak load {fr['peak_load_kn']:.0f} kN (limit {p['limit_peak_load_kn']:.0f} kN).")
    d_oil = rec_e["oil_bbl"] - base_e["oil_bbl"]
    why.append(
        f"Oil {rec_e['oil_bbl']:.0f} bbl ({d_oil:+.0f} bbl vs no action), SOR {rec_e['sor']:.2f} (was {base_e['sor']:.2f}), "
        f"energy {rec_e['energy_kwh_per_bbl']:.0f} kWh/bbl (was {base_e['energy_kwh_per_bbl']:.0f}), "
        f"value per cycle-day {rec_e['value_per_cycle_day']:.0f} USD (was {base_e['value_per_cycle_day']:.0f}, placeholder prices).")
    ch = _changes(cur_css, rec_css)
    if ch:
        why.append("CSS design changes (kept inside a +/-%d%% steam, +/-%.0f MPa, +/-%.0f day trust region around current practice): %s." % (
            round(S.CSS_TRUST["steam_volume_frac"] * 100), S.CSS_TRUST["pressure_mpa"], S.CSS_TRUST["soak_days"],
            ", ".join(f"{c['variable']} {c['from']:.4g} -> {c['to']:.4g} {c['unit']}" for c in ch)))

    rows = Sr.constraint_rows(rec_res, from_day)
    audit = {
        "status": "pending_human_decision", "autonomy_level": "L2 recommend-only", "simulation": True,
        "model_version": MODEL_VERSION, "created_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "input_hash": input_hash, "cycle": cycle, "mode": mode, "weights": weights,
        "calibration": {"cycles_used": cal.calibration_info()["cycles_used"], "data": "SYNTHETIC"},
    }
    return {
        "current_state": current_state, "prediction_no_action": pred_no_action,
        "recommended_action": recommended_action, "why": why,
        "constraint_margins": rows, "uncertainty_margin_frac": p["limit_margin_frac"],
        "confidence": _confidence(robust_rec, robust_base),
        "audit_stub": audit,
    }


# ----------------------------------------------------------------------------------------- optimize
def _req_hash(req: dict) -> str:
    blob = json.dumps(req, sort_keys=True, default=str) + cal.calibration_info()["fingerprint"] + MODEL_VERSION
    return hashlib.md5(blob.encode()).hexdigest()[:16]


def optimize(req: Optional[dict] = None) -> dict:
    req = dict(req or {})
    cycle = int(req.get("cycle", 4))
    mode = req.get("mode", "joint")
    if mode not in ("joint", "srp_only"):
        raise ValueError("mode must be 'joint' or 'srp_only'")
    if not 1 <= cycle <= 6:
        raise ValueError("cycle must be 1-6 (model validity range)")
    weights = Sr.norm_weights(req.get("weights"))
    current_day = float(req.get("current_day", 0.0) or 0.0)
    norm_req = {"cycle": cycle, "mode": mode, "weights": weights, "current_day": current_day, "css": req.get("css")}
    key = _req_hash(norm_req)
    if key in _CACHE:
        out = copy.deepcopy(_CACHE[key])
        out["receipt"]["audit_stub"]["created_utc"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
        out["cache_hit"] = True
        return out

    t0 = time.time()
    p = twin.active_params()
    cur_css = twin.normalize_css(req.get("css") or default_css(cycle))
    base_srp = twin.baseline_srp(p)
    ps = Sr.prod_start_day(cur_css, p)
    from_day = 0.0 if mode == "joint" else max(current_day, 0.0)

    # ---------------- no action
    base_res, base_e, base_viol = _run(cycle, cur_css, None, p, from_day)

    # ---------------- search
    if mode == "srp_only":
        cutoff = int(cur_css["cutoff_day"])
        cand = Sr.make_candidate(cycle, cur_css, p, fine=True, horizon=cutoff)
        pin = dict(fixed_until_day=current_day if current_day > ps else None,
                   fixed_state=(base_srp["spm"], base_srp["stroke_m"]), fixed_cutoff=cutoff, from_day=from_day)
        rec_plan, rec_res, rounds = Sr.solve_verified(cycle, cand, p, weights, **pin)
        if rec_plan is None:
            raise RuntimeError("No schedule satisfies the hard constraints for this request.")
        rec_css = dict(cur_css)
        pareto_plans = []
        for name, wv in Sr.weight_scenarios(weights).items():
            pl, rs, _ = Sr.solve_verified(cycle, cand, p, wv, **pin)
            if pl is not None:
                pl["scenario"] = name
                pareto_plans.append(pl)
        n_cand, search_s = 1, time.time() - t0
    else:
        js = Sr.joint_search(cycle, p, weights, current_css=cur_css)
        req_plans = [q for q in js["plans"] if q["scenario"] == "requested"]
        if not req_plans:
            raise RuntimeError("No CSS design satisfies the hard constraints for this request.")
        best = max(req_plans, key=lambda q: q["score"])
        fine = Sr.refine_fine(cycle, best["key"], p, weights, js["margin"])
        rec_plan, rec_res, rounds = (None, None, 0)
        if fine is not None:
            rec_plan, rec_res, rounds = Sr.solve_verified(cycle, fine[0], p, weights)
        if rec_plan is None:                                        # fall back to the verified coarse plan
            rec_plan = best
            rec_res, viol = Sr.verify_plan(cycle, best, p)
            if viol:
                raise RuntimeError("Best plan failed verification against hard limits.")
        rec_css = dict(rec_plan["css"])
        pareto_plans = js["plans"]
        n_cand, search_s = js["n_candidates"], js["seconds"]

    rec_sched = rec_plan["schedule"]
    rec_e = Sr.economics(rec_res, p)
    rec_viol = [r["name"] for r in Sr.constraint_rows(rec_res, from_day) if r["violated"]]

    # ---------------- Pareto set (re-simulated, so every number is the twin's own)
    pts = []
    for pl in Sr.pareto_filter([dict(q, energy_kwh_per_bbl=q["energy_kwh_per_bbl"]) for q in pareto_plans], max_points=8):
        css_full = dict(pl["css"]) if "cutoff_day" in pl["css"] else dict(pl["css"], cutoff_day=float(pl["cutoff_day"]))
        res, e, viol = _run(cycle, css_full, Sr.to_srp(pl["schedule"]), p, from_day)
        item = _shape(css_full, pl["schedule"], e, viol)
        item["is_recommended"] = False
        pts.append(item)
    _label_extremes(pts)
    rec_item = _shape(rec_css, rec_sched, rec_e, rec_viol, "Recommended")
    rec_item["is_recommended"] = True
    same = [i for i, q in enumerate(pts) if q["css"] == rec_item["css"] and q["srp"] == rec_item["srp"]]
    if same:
        pts[same[0]] = rec_item
    else:
        pts.append(rec_item)
    def _near(q):
        return all(abs(q[k] - rec_item[k]) <= 0.005 * max(abs(rec_item[k]), 1e-9) + 1e-9
                   for k in ("oil_per_cycle_day", "sor", "energy")) and abs(q["risk"] - rec_item["risk"]) <= 0.002
    pts = [q for q in pts if q["is_recommended"] or not _near(q)]
    pts.sort(key=lambda q: -q["oil_per_cycle_day"])

    base_item = _shape(cur_css, _baseline_schedule(p, cur_css), base_e, base_viol, "No action (fixed settings)")

    # ---------------- robustness, what-if
    srp_rec = Sr.to_srp(rec_sched)
    css_rec_full = dict(rec_css)
    rob_rec = robustness(cycle, css_rec_full, srp_rec, from_day)
    rob_base = robustness(cycle, cur_css, None, from_day)
    day0 = int(max(current_day, ps))
    plus2 = [dict(s, spm=min(s["spm"] + 2.0, p["spm_max"])) for s in srp_rec]
    vd = Sr.violation_days(base_res, 0.0)
    late_day = max(int(base_res.days[vd][0]) + 10, day0 + 5) if vd.any() else day0 + 14
    late_label = f"Recommended plan, but pump changes made only on day {late_day} (acting late)"
    what_if = [
        _what_if("No action: keep fixed settings", cycle, cur_css, None, p, from_day),
        _what_if("Recommended plan", cycle, css_rec_full, srp_rec, p, from_day),
        _what_if("Recommended plan, but every set-point +2 SPM", cycle, css_rec_full, plus2, p, from_day),
        _what_if(late_label, cycle, css_rec_full, _delayed_srp(base_srp, rec_sched, late_day), p, from_day),
    ]

    active = [r["name"] for r in Sr.constraint_rows(rec_res, from_day) if r["active"]]
    receipt = build_receipt(cycle, mode, weights, current_day, cur_css, rec_css, base_res, rec_res, base_e, rec_e,
                            rec_sched, base_srp, p, from_day, rob_rec, rob_base, key,
                            bool(rec_plan.get("emergency_step")))
    receipt["what_if"] = what_if

    out = {
        "simulation": True, "model_version": MODEL_VERSION, "cycle": cycle, "mode": mode, "weights": weights,
        "current_day": current_day,
        "recommended": rec_item, "baseline": base_item, "pareto": pts,
        "active_constraints": active, "receipt": receipt,
        "headline": _delta(base_e, rec_e),
        "trajectories": {"no_action": base_res.timeline_dict(), "with_action": rec_res.timeline_dict()},
        "search": {
            "method": "Sobol + local refinement over CSS design; exact dynamic programme over the pump schedule; "
                      "every reported plan re-simulated and re-checked against margin-free limits.",
            "candidates_evaluated": n_cand, "repair_rounds": rounds, "seconds": time.time() - t0,
            "uncertainty_margin_frac": p["limit_margin_frac"], "block_days": S.BLOCK_DAYS,
            "objective": "value per cycle-day = (oil revenue - all-in steam cost - power - expected failure cost - weighted "
                         "SOR/risk penalties) / (cycle days + turnaround). All prices/coefficients are PLACEHOLDERS.",
            "coefficients": S.COEFFS, "trust_region": S.CSS_TRUST if mode == "joint" else None,
            "no_reinforcement_learning": True,
        },
        "cache_hit": False,
    }
    out = _clean(out)
    _CACHE[key] = copy.deepcopy(out)
    return out


# ----------------------------------------------------------------------------------------- replay
def replay(cycle: int = 4) -> dict:
    """Held-out cycle: twin prediction vs synthetic 'actual', and baseline vs twin-recommended schedule.

    The recommendation is computed with the CALIBRATED twin and then scored on a plant proxy (the synthetic-truth
    parameters, which differ from the twin's), so the headline deltas are not the optimizer grading itself."""
    key = f"replay-{cycle}-{cal.calibration_info()['fingerprint']}"
    if key in _CACHE:
        return copy.deepcopy(_CACHE[key])
    hist = get_history()
    if cycle not in hist["cycles"]:
        raise ValueError("cycle must be 1-4 (synthetic history)")
    h = hist["cycles"][cycle]
    p = twin.active_params()
    css = twin.normalize_css(h["css"])
    ps = Sr.prod_start_day(css, p)
    cutoff = int(css["cutoff_day"])

    cand = Sr.make_candidate(cycle, css, p, fine=True, horizon=cutoff)
    plan, rec_res, _ = Sr.solve_verified(cycle, cand, p, Sr.norm_weights(None), fixed_cutoff=cutoff)
    if plan is None:
        raise RuntimeError("No feasible schedule for replay.")
    srp_rec = Sr.to_srp(plan["schedule"])

    base_twin = twin.simulate_cycle(cycle, css, None, p)
    tp = true_params()
    base_true = twin.simulate_cycle(cycle, css, None, tp)
    rec_true = twin.simulate_cycle(cycle, css, srp_rec, tp)
    e_base, e_rec = Sr.economics(base_true, tp), Sr.economics(rec_true, tp)
    viol_base = [r["name"] for r in Sr.constraint_rows(base_true) if r["violated"]]
    viol_rec = [r["name"] for r in Sr.constraint_rows(rec_true) if r["violated"]]

    pred = cal.predict_with_uncertainty(cycle, css, None)
    rm = cal.replay_metrics(cycle)
    meas = np.where(h["producing"] & ~h["downtime"], h["oil_meas_bpd"], np.nan)
    out = {
        "simulation": True, "synthetic": True, "model_version": MODEL_VERSION, "cycle": cycle,
        "held_out": cycle == hist["held_out_cycle"],
        "days": h["days"].astype(float),
        "predicted_vs_actual": {"predicted_oil_bpd": pred["oil_bpd"], "lo_bpd": pred["lo_bpd"], "hi_bpd": pred["hi_bpd"],
                                "actual_oil_bpd": meas},
        "mae": rm["mae_bpd"], "rmse": rm["rmse_bpd"], "mape_pct": rm["mape_pct"],
        "interval_coverage": rm["interval_coverage_90"], "mae_uncalibrated_bpd": rm["mae_uncalibrated_bpd"],
        "baseline": base_twin.timeline_dict(), "recommended": rec_res.timeline_dict(),
        "recommended_schedule": _srp_of(plan["schedule"]),
        "plant_proxy_check": {
            "description": "Recommendation made with the calibrated twin, then simulated with the synthetic-truth parameters "
                           "(a plant the twin does not know exactly).",
            "baseline": _shape(css, _baseline_schedule(p, css), e_base, viol_base),
            "recommended": _shape(css, plan["schedule"], e_rec, viol_rec),
        },
        "headline_deltas": _delta(e_base, e_rec),
        "label": "SIMULATED: synthetic history, synthetic plant proxy. Not a field result.",
    }
    out = _clean(out)
    _CACHE[key] = copy.deepcopy(out)
    return out


# ----------------------------------------------------------------------------------------- audit log
def _read_log() -> List[dict]:
    try:
        if AUDIT_FILE.exists():
            return json.loads(AUDIT_FILE.read_text())
    except Exception:
        pass
    return []


def list_recommendations() -> dict:
    with _LOCK:
        return {"simulation": True, "model_version": MODEL_VERSION, "entries": _read_log()}


def record_decision(receipt: dict, decision: str, reason: str = "") -> dict:
    if decision not in ("approve", "reject"):
        raise ValueError("decision must be 'approve' or 'reject'")
    if not isinstance(receipt, dict) or "recommended_action" not in receipt:
        raise ValueError("receipt must be an engineering receipt returned by /api/optimize")
    with _LOCK:
        log = _read_log()
        entry = {
            "id": len(log) + 1, "timestamp_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "decision": decision, "reason": reason or "", "simulation": True, "model_version": MODEL_VERSION,
            "autonomy_level": "L2 recommend-only: decision recorded, nothing sent to the well",
            "receipt": receipt,
        }
        log.append(entry)
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        tmp = AUDIT_FILE.with_suffix(".tmp")
        tmp.write_text(json.dumps(log, indent=2))
        tmp.replace(AUDIT_FILE)
        return entry


# ----------------------------------------------------------------------------------------- validation + warm-up
_BOUNDS = {"steam_volume_m3": (800.0, 2600.0), "injection_pressure_mpa": (4.0, 12.0), "soak_days": (3.0, 14.0),
           "cutoff_day": (120.0, 300.0)}


def validate_cycle(cycle) -> int:
    c = int(cycle)
    if not 1 <= c <= 6:
        raise ValueError("cycle must be between 1 and 6 (model validity range)")
    return c


def validate_css(css: Optional[dict]) -> Optional[dict]:
    if css is None:
        return None
    out = {}
    for k, v in css.items():
        if k not in _BOUNDS:
            raise ValueError(f"unknown css field '{k}'")
        lo, hi = _BOUNDS[k]
        if not lo <= float(v) <= hi:
            raise ValueError(f"{k}={v} is outside the model validity range {lo:g}-{hi:g}")
        out[k] = float(v)
    return out


def validate_srp(srp):
    """dict {spm, stroke_m} or list of {start_day, spm, stroke_m}; returns it unchanged if inside the validity range."""
    if srp is None:
        return None
    for s in ([srp] if isinstance(srp, dict) else list(srp)):
        if not 2.0 <= float(s["spm"]) <= 8.0:
            raise ValueError(f"spm={s['spm']} is outside the model validity range 2-8")
        if not 1.5 <= float(s["stroke_m"]) <= 3.0:
            raise ValueError(f"stroke_m={s['stroke_m']} is outside the model validity range 1.5-3.0")
    return srp


def warm_up() -> None:
    """Pre-compute the default views so the first click in the demo is instant. Safe to call from a thread."""
    try:
        cal.calibration_info()
        optimize({"cycle": 4, "mode": "srp_only"})
        replay(4)
        optimize({"cycle": 4, "mode": "joint"})
    except Exception:
        pass
