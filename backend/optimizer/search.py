"""Constrained search for CSS design + SRP schedule.

Structure
  outer  : space-filling (Sobol) + local refinement over steam volume, injection pressure, soak days
  inner  : exact dynamic programme over the pump schedule (blocks of BLOCK_DAYS days)
           - hard constraints (peak load, fillage, float probability) enforced per day, with an uncertainty margin
           - bounded set-point changes between blocks (SPM, stroke)
           - the cut-off day is chosen from the best prefix of the schedule (score = value per cycle-day)
  verify : every reported plan is re-simulated with the twin and re-checked against the true (margin-free) limits;
           if a violation is found the margin is raised and the plan re-solved (repair loop).

No learning, no black box: every number in a plan comes from the same physics as the twin.
"""
from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

import numpy as np
from scipy.stats import qmc

from physics import thermal, twin
from physics.config import ParamSet
from physics.twin import BBL_PER_M3, KWH_PER_GJ

from . import settings as S
from .evaluator import evaluate_states

NEG = -1.0e18
WEIGHT_KEYS = ("oil", "sor", "energy", "failure", "risk")


# ----------------------------------------------------------------------------------------- helpers
def norm_weights(w: Optional[dict]) -> Dict[str, float]:
    out = dict(S.DEFAULT_WEIGHTS)
    for k, v in (w or {}).items():
        if k in out:
            out[k] = float(max(v, 0.0))
    return out


def pressure_bounds(p: ParamSet) -> Tuple[float, float]:
    """Injection pressure range: model validity 4-12 MPa; the upper limit keeps the uncertainty margin."""
    m = p["limit_margin_frac"]
    return max(5.0, p["limit_min_inj_pressure_mpa"] * (1 + m)), p["limit_inj_pressure_mpa"] * (1 - m)


def round_css(c: dict) -> dict:
    return {
        "steam_volume_m3": float(round(c["steam_volume_m3"] / 10.0) * 10.0),
        "injection_pressure_mpa": float(round(c["injection_pressure_mpa"] * 10.0) / 10.0),
        "soak_days": float(round(c["soak_days"])),
    }


def make_grid(fine: bool) -> Tuple[np.ndarray, np.ndarray]:
    spm_l, st_l = (S.SPM_FINE, S.STROKE_FINE) if fine else (S.SPM_COARSE, S.STROKE_COARSE)
    spm, st = np.meshgrid(spm_l, st_l, indexing="ij")
    return spm.ravel().astype(float), st.ravel().astype(float)


def transition_matrix(spm: np.ndarray, st: np.ndarray) -> np.ndarray:
    """trans[i, j]: value added when moving from state i (previous block) to state j."""
    ok = (np.abs(spm[:, None] - spm[None, :]) <= S.MAX_DSPM + 1e-9) & \
         (np.abs(st[:, None] - st[None, :]) <= S.MAX_DSTROKE + 1e-9)
    same = (np.abs(spm[:, None] - spm[None, :]) < 1e-9) & (np.abs(st[:, None] - st[None, :]) < 1e-9)
    trans = np.where(ok, -S.COEFFS["switch_cost_usd"], NEG)
    trans[same] = 0.0
    return trans


def prod_start_day(css: dict, p: ParamSet) -> int:
    z = thermal.heated_zone(css["steam_volume_m3"], css["injection_pressure_mpa"], p)
    return int(np.ceil(z.inj_days + css["soak_days"]))


# ----------------------------------------------------------------------------------------- candidate
@dataclass
class Candidate:
    css: dict
    zone: object
    prod_start: int
    days: np.ndarray
    ev: Dict[str, np.ndarray]
    spm: np.ndarray
    stroke: np.ndarray


def make_candidate(cycle: int, css3: dict, p: ParamSet, fine: bool = False, horizon: Optional[int] = None,
                   kind: str = "conventional") -> Optional[Candidate]:
    css = round_css(css3)
    ps = prod_start_day(css, p)
    end = int(horizon if horizon is not None else S.CSS_BOUNDS["cutoff_day"][1])
    if end - ps < 20:
        return None
    days = np.arange(ps, end + 1)
    spm, st = make_grid(fine)
    full = dict(css, cutoff_day=float(end))
    ev = evaluate_states(cycle, full, p, days, spm, st, kind)
    zone = thermal.heated_zone(css["steam_volume_m3"], css["injection_pressure_mpa"], p)
    return Candidate(css, zone, ps, days, ev, spm, st)


# ----------------------------------------------------------------------------------------- dynamic programme
def _block_starts(n_days: int) -> np.ndarray:
    return np.arange(0, n_days, S.BLOCK_DAYS)


def solve_plan(c: Candidate, p: ParamSet, weights: dict, margin: float, cycle: int,
               fixed_until_day: Optional[float] = None, fixed_state: Optional[Tuple[float, float]] = None,
               fixed_cutoff: Optional[int] = None, extra_margin: Optional[np.ndarray] = None,
               free_first: bool = False) -> Optional[dict]:
    """Best feasible schedule (and cut-off) for one CSS candidate.

    fixed_until_day/fixed_state : blocks starting before this day are held at the given (spm, stroke)
    fixed_cutoff                : evaluate only that cut-off (srp_only mode)
    free_first                  : emergency step: the first move after the pinned past ignores the step limit
    extra_margin                : per-block extra margin (repair loop)
    """
    ev, w = c.ev, weights
    d, s = ev["oil_bpd"].shape
    price = p["oil_price_usd_bbl"]
    hazard = p["failure_hazard_per_day"]
    kw_cost = p["power_usd_kwh"] * 24.0

    value = (w["oil"] * ev["oil_bpd"] * price
             - w["energy"] * ev["power_kw"] * kw_cost
             - w["failure"] * hazard * p["workover_cost_usd"] * (ev["p_float"] + 0.5 * ev["p_impact"])
             - w["risk"] * S.COEFFS["risk_coeff_usd_per_day"] * ev["p_float"])
    fail = hazard * (ev["p_float"] + 0.5 * ev["p_impact"])

    starts = _block_starts(d)
    nb = len(starts)
    bmargin = np.full(nb, margin) if extra_margin is None else margin + np.resize(extra_margin, nb)
    dm = np.repeat(bmargin, np.diff(np.append(starts, d)))[:, None]      # per-day margin, D x 1
    feas = ((ev["ppr_kn"] <= p["limit_peak_load_kn"] * (1 - dm)) &
            (ev["fillage"] >= p["limit_min_fillage"] * (1 + dm)) &
            (ev["p_float"] <= p["limit_float_prob"] * (1 - dm)))

    red = lambda a: np.add.reduceat(a, starts, axis=0)
    bv, b_oil = red(value), red(ev["oil_bpd"])
    b_kwh, b_fail = red(ev["power_kw"]) * 24.0, red(fail)
    b_pf = red(ev["p_float"])
    b_pfmax = np.maximum.reduceat(ev["p_float"], starts, axis=0)
    b_fill = np.minimum.reduceat(ev["fillage"], starts, axis=0)
    b_ppr = np.maximum.reduceat(ev["ppr_kn"], starts, axis=0)
    bf = np.minimum.reduceat(feas.astype(np.int8), starts, axis=0).astype(bool)

    if fixed_until_day is not None and fixed_state is not None:
        base_idx = np.where((np.abs(c.spm - fixed_state[0]) < 1e-9) & (np.abs(c.stroke - fixed_state[1]) < 1e-9))[0]
        if base_idx.size == 0:
            return None
        pinned = (c.days[np.minimum(starts + S.BLOCK_DAYS, d) - 1] < fixed_until_day)   # block wholly in the past
        for b in np.where(pinned)[0]:
            keep = bv[b, base_idx[0]]
            bv[b, :] = NEG
            bv[b, base_idx[0]] = keep
            bf[b, :] = False
            bf[b, base_idx[0]] = True                 # the past is what it is: not re-checked

    trans = transition_matrix(c.spm, c.stroke)
    trans_free = np.where(trans < NEG / 2, -S.COEFFS["switch_cost_usd"], trans)
    first_free = -1
    if free_first and fixed_until_day is not None:
        pinned_now = c.days[np.minimum(starts + S.BLOCK_DAYS, d) - 1] < fixed_until_day
        if pinned_now.any() and not pinned_now.all():
            first_free = int(np.argmax(~pinned_now))
    cum = np.full((nb, s), NEG)
    arg = np.zeros((nb, s), dtype=int)
    cum[0] = np.where(bf[0], bv[0], NEG)
    ar = np.arange(s)
    for b in range(1, nb):
        prev = cum[b - 1][:, None] + (trans_free if b == first_free else trans)
        j = prev.argmax(axis=0)
        best = prev[j, ar]
        cum[b] = np.where(bf[b] & (best > NEG / 2), best + bv[b], NEG)
        arg[b] = j

    steam_cost = c.zone.fuel_gj * p["steam_fuel_usd_gj"] * S.COEFFS["steam_all_in_factor"]
    steam_bbl = c.css["steam_volume_m3"] * BBL_PER_M3
    fuel_kwh = c.zone.fuel_gj * KWH_PER_GJ
    lo_cut, hi_cut = S.CSS_BOUNDS["cutoff_day"]

    best_plan, best_score = None, -np.inf
    for b in range(nb):
        if fixed_cutoff is not None and b != nb - 1:
            continue                                   # srp_only: candidate horizon == the fixed cut-off
        if cum[b].max() <= NEG / 2:
            continue
        end_day = int(c.days[min(starts[b] + S.BLOCK_DAYS, d) - 1])
        if fixed_cutoff is None and (end_day < lo_cut or end_day > hi_cut or end_day < c.prod_start + 10):
            continue
        st_i = int(cum[b].argmax())
        path = [0] * (b + 1)
        path[b] = st_i
        for k in range(b, 0, -1):
            path[k - 1] = int(arg[k, path[k]])
        idx = np.arange(b + 1)
        pa = np.array(path)
        oil = float(b_oil[idx, pa].sum())
        if oil <= 1.0:
            continue
        kwh = float(b_kwh[idx, pa].sum())
        exp_fail = float(b_fail[idx, pa].sum())
        sor = steam_bbl / oil
        switches = int(np.sum(pa[1:] != pa[:-1]))
        j_val = (float(cum[b, st_i]) - w["energy"] * steam_cost - w["sor"] * S.COEFFS["sor_coeff_usd"] * sor)
        score = j_val / (end_day + S.COEFFS["turnaround_days"])
        if score > best_score:
            best_score = score
            net = (oil * price - steam_cost - kwh * p["power_usd_kwh"] - exp_fail * p["workover_cost_usd"])
            best_plan = {
                "css": dict(c.css, cutoff_day=float(end_day)),
                "path": pa, "n_blocks": b + 1, "cutoff_day": end_day, "score": float(score), "j_value": float(j_val),
                "oil_bbl": oil, "oil_per_cycle_day": float(oil / (end_day + S.COEFFS["turnaround_days"])), "sor": float(sor), "energy_kwh_per_bbl": float((fuel_kwh + kwh) / oil),
                "expected_failures": exp_fail,
                "risk": exp_fail,
                "max_float_probability": float(b_pfmax[idx, pa].max()),
                "min_fillage": float(b_fill[idx, pa].min()),
                "max_peak_load_kn": float(b_ppr[idx, pa].max()),
                "net_value_usd": float(net),
                "value_per_cycle_day": float(net / (end_day + S.COEFFS["turnaround_days"])),
                "switches": switches, "emergency_step": bool(first_free >= 0 and first_free <= b and
                                                           pa[first_free] != pa[first_free - 1] and
                                                           trans[pa[first_free - 1], pa[first_free]] < NEG / 2),
            }
    if best_plan is None:
        return None
    best_plan["schedule"] = path_to_schedule(c, best_plan["path"], best_plan["cutoff_day"])
    return best_plan


def path_to_schedule(c: Candidate, path: np.ndarray, cutoff_day: int) -> List[dict]:
    """Merge equal consecutive blocks into segments [{start_day, end_day, spm, stroke_m}]."""
    starts = c.days[_block_starts(len(c.days))]
    segs: List[dict] = []
    for k, si in enumerate(path):
        spm, stroke = float(c.spm[si]), float(c.stroke[si])
        if segs and abs(segs[-1]["spm"] - spm) < 1e-9 and abs(segs[-1]["stroke_m"] - stroke) < 1e-9:
            continue
        segs.append({"start_day": int(starts[k]), "spm": spm, "stroke_m": stroke})
    for i, sg in enumerate(segs):
        sg["end_day"] = int(segs[i + 1]["start_day"] - 1) if i + 1 < len(segs) else int(cutoff_day)
    return segs


def to_srp(schedule: List[dict], first_from_zero: bool = True) -> List[dict]:
    """Twin-readable schedule ([{'start_day','spm','stroke_m'}]) from segments."""
    srp = [{"start_day": s["start_day"], "spm": s["spm"], "stroke_m": s["stroke_m"]} for s in schedule]
    if first_from_zero and srp:
        srp[0] = dict(srp[0], start_day=0)
    return srp


# ----------------------------------------------------------------------------------------- economics
def economics(res, p: ParamSet) -> dict:
    """Metrics of a simulated cycle on the SAME basis as the optimizer's plans (all-in steam cost, cycle-day value)."""
    tot = res.totals()
    steam_cost = tot["fuel_gj"] * p["steam_fuel_usd_gj"] * S.COEFFS["steam_all_in_factor"]
    net = tot["revenue_usd"] - steam_cost - tot["power_cost_usd"] - tot["failure_cost_usd"]
    days = tot["cycle_days"] + S.COEFFS["turnaround_days"]
    return {
        "oil_bbl": tot["cumulative_oil_bbl"], "sor": tot["sor"],
        "oil_per_cycle_day": tot["cumulative_oil_bbl"] / days, "energy_kwh_per_bbl": tot["energy_kwh_per_bbl"],
        "risk": tot["expected_failures"], "expected_failures": tot["expected_failures"],
        "max_float_probability": tot["max_float_probability"], "min_fillage": tot["min_fillage"],
        "max_peak_load_kn": tot["max_peak_load_kn"], "net_value_usd": net, "steam_cost_usd": steam_cost,
        "value_per_cycle_day": net / days, "cutoff_day": int(res.days[-1]),
    }


# ----------------------------------------------------------------------------------------- verification
def constraint_rows(res, from_day: float = 0.0, margin: float = 0.0) -> List[dict]:
    """Same checks as CycleResult.constraint_table, optionally only for days >= from_day. Limits shown incl. margin."""
    p, a = res.params, res.a
    sel = res.producing & (res.days >= from_day)
    rows: List[dict] = []

    def add(name, value, limit, upper=True):
        lim = limit * (1 - margin) if upper else limit * (1 + margin)
        pct = (lim - value) / lim * 100.0 if upper else (value - lim) / lim * 100.0
        rows.append({"name": name, "value": float(value), "limit": float(lim), "margin_pct": float(pct),
                     "active": bool(pct <= S.ACTIVE_TOL_PCT), "violated": bool(pct < 0.0)})

    add("injection_pressure_mpa", res.css["injection_pressure_mpa"], p["limit_inj_pressure_mpa"])
    add("min_injection_pressure_mpa", res.css["injection_pressure_mpa"], p["limit_min_inj_pressure_mpa"], upper=False)
    if sel.any():
        add("peak_load_kn", np.nanmax(a["ppr_kn"][sel]), p["limit_peak_load_kn"])
        add("min_fillage", np.nanmin(a["fillage"][sel]), p["limit_min_fillage"], upper=False)
        add("float_probability", np.nanmax(a["float_probability"][sel]), p["limit_float_prob"])
        add("spm_max", np.nanmax(a["spm"][sel]), p["spm_max"])
        add("spm_min", np.nanmin(a["spm"][sel]), p["spm_min"], upper=False)
        add("stroke_max_m", np.nanmax(a["stroke_m"][sel]), p["stroke_max_m"])
        add("stroke_min_m", np.nanmin(a["stroke_m"][sel]), p["stroke_min_m"], upper=False)
    return rows


def violation_days(res, from_day: float = 0.0) -> np.ndarray:
    """Boolean per-day mask: any hard limit violated (margin-free)."""
    p, a = res.params, res.a
    bad = ((a["ppr_kn"] > p["limit_peak_load_kn"]) | (a["fillage"] < p["limit_min_fillage"]) |
           (a["float_probability"] > p["limit_float_prob"]))
    return np.nan_to_num(bad, nan=0).astype(bool) & res.producing & (res.days >= from_day)


def verify_plan(cycle: int, plan: dict, p: ParamSet, from_day: float = 0.0, kind: str = "conventional"):
    """Re-simulate the plan with the full twin. Returns (CycleResult, violation rows)."""
    res = twin.simulate_cycle(cycle, plan["css"], to_srp(plan["schedule"]), p, kind)
    rows = [r for r in constraint_rows(res, from_day) if r["violated"]]
    return res, rows


# ----------------------------------------------------------------------------------------- outer search
def css_box(p: ParamSet, current: Optional[dict] = None):
    """Search box for (steam, pressure, soak): model validity range intersected with a trust region around the
    current design."""
    cur = twin.normalize_css(current)
    lo_p, hi_p = pressure_bounds(p)
    (s0, s1), (k0, k1) = S.CSS_BOUNDS["steam_volume_m3"], S.CSS_BOUNDS["soak_days"]
    tr = S.CSS_TRUST
    return ((max(s0, cur["steam_volume_m3"] * (1 - tr["steam_volume_frac"])), min(s1, cur["steam_volume_m3"] * (1 + tr["steam_volume_frac"]))),
            (max(lo_p, cur["injection_pressure_mpa"] - tr["pressure_mpa"]), min(hi_p, cur["injection_pressure_mpa"] + tr["pressure_mpa"])),
            (max(k0, cur["soak_days"] - tr["soak_days"]), min(k1, cur["soak_days"] + tr["soak_days"])))


def _decode(u: np.ndarray, box) -> dict:
    (s0, s1), (lo_p, hi_p), (k0, k1) = box
    return {"steam_volume_m3": s0 + u[0] * (s1 - s0), "injection_pressure_mpa": lo_p + u[1] * (hi_p - lo_p),
            "soak_days": k0 + u[2] * (k1 - k0)}


def _encode(css: dict, box) -> np.ndarray:
    (s0, s1), (lo_p, hi_p), (k0, k1) = box
    return np.array([(css["steam_volume_m3"] - s0) / (s1 - s0), (css["injection_pressure_mpa"] - lo_p) / (hi_p - lo_p),
                     (css["soak_days"] - k0) / (k1 - k0)])


def weight_scenarios(user: dict) -> Dict[str, dict]:
    """The requested weights plus three contrasting preferences, so the Pareto set spans real trade-offs."""
    return {
        "requested": user,
        "max_oil": {"oil": 1.0, "sor": 0.15, "energy": 0.2, "failure": 0.3, "risk": 0.3},
        "efficiency": {"oil": 0.6, "sor": 3.0, "energy": 3.0, "failure": 1.0, "risk": 1.0},
        "safety": {"oil": 0.7, "sor": 1.0, "energy": 1.0, "failure": 3.0, "risk": 4.0},
    }


def pareto_objectives(q: dict) -> List[float]:
    """Minimised vector: (-oil per cycle-day, SOR, energy per bbl, expected failures).
    Oil is normalised per cycle-day so that simply running a longer cycle does not dominate."""
    return [-q["oil_per_cycle_day"], q["sor"], q["energy_kwh_per_bbl"], q["risk"]]


def pareto_filter(points: List[dict], max_points: int = 8, eps_frac: float = 0.01) -> List[dict]:
    """Non-dominated set (epsilon-dominance: differences under eps_frac of an objective's range count as ties),
    thinned to max_points by farthest-point sampling and sorted by oil per cycle-day."""
    if not points:
        return []
    m = np.array([pareto_objectives(q) for q in points])
    eps = np.maximum(eps_frac * np.ptp(m, axis=0), 0.005 * np.abs(m).mean(axis=0)) + 1e-12
    n = len(points)
    keep = []
    for i in range(n):
        dom = False
        for j in range(n):
            if j != i and np.all(m[j] <= m[i] + eps) and np.any(m[j] < m[i] - eps):
                dom = True
                break
        if not dom:
            keep.append(i)
    seen, uniq = set(), []                                   # drop near-duplicates
    for i in keep:
        sig = tuple(np.round(m[i] / np.maximum(eps, 1e-12)).astype(int))
        if sig not in seen:
            seen.add(sig)
            uniq.append(i)
    keep = uniq
    if len(keep) > max_points:
        z = (m[keep] - m[keep].min(0)) / np.maximum(np.ptp(m[keep], axis=0), 1e-12)
        chosen = [int(np.argmin(z[:, 0]))]
        while len(chosen) < max_points:
            dist = np.min(np.linalg.norm(z[:, None, :] - z[chosen][None, :, :], axis=2), axis=1)
            chosen.append(int(np.argmax(dist)))
        keep = [keep[i] for i in chosen]
    keep.sort(key=lambda i: m[i][0])
    return [points[i] for i in keep]


def joint_search(cycle: int, p: ParamSet, weights: dict, kind: str = "conventional",
                 n_sobol: int = S.N_SOBOL, refine_rounds: int = S.REFINE_ROUNDS,
                 current_css: Optional[dict] = None) -> dict:
    """Search CSS design + SRP schedule. Returns candidate plans for all weight scenarios (unverified)."""
    t0 = time.time()
    margin = p["limit_margin_frac"]
    scen = weight_scenarios(weights)
    rng = np.random.default_rng(S.SEED)
    sob = qmc.Sobol(d=3, scramble=True, seed=S.SEED)
    box = css_box(p, current_css)
    pts = [_decode(u, box) for u in sob.random(n_sobol)]

    evaluated: Dict[tuple, Candidate] = {}
    plans: List[dict] = []
    req_scores: List[Tuple[float, tuple]] = []

    def run(css_raw: dict):
        css = round_css(css_raw)
        key = (css["steam_volume_m3"], css["injection_pressure_mpa"], css["soak_days"])
        if key in evaluated:
            return
        cand = make_candidate(cycle, css, p, fine=False, kind=kind)
        if cand is None:
            return
        evaluated[key] = cand
        for name, wv in scen.items():
            pl = solve_plan(cand, p, wv, margin, cycle)
            if pl is None:
                continue
            pl["scenario"], pl["key"] = name, key
            plans.append(pl)
            if name == "requested":
                req_scores.append((pl["score"], key))

    for u in pts:
        run(u)
    for r in range(refine_rounds):
        top = [k for _, k in sorted(req_scores, key=lambda t: -t[0])[:S.REFINE_TOP]]
        sigma = 0.10 / (r + 1)
        for k in top:
            base = _encode(dict(zip(("steam_volume_m3", "injection_pressure_mpa", "soak_days"), k)), box)
            for _ in range(S.REFINE_SAMPLES):
                u = np.clip(base + rng.normal(0.0, sigma, 3), 0.0, 1.0)
                run(_decode(u, box))
    return {"plans": plans, "evaluated": evaluated, "scenarios": scen, "margin": margin, "box": box,
            "n_candidates": len(evaluated), "seconds": time.time() - t0}


def refine_fine(cycle: int, key: tuple, p: ParamSet, weights: dict, margin: float, kind: str = "conventional",
                extra_margin: Optional[np.ndarray] = None) -> Optional[Tuple[Candidate, dict]]:
    css = dict(zip(("steam_volume_m3", "injection_pressure_mpa", "soak_days"), key))
    cand = make_candidate(cycle, css, p, fine=True, kind=kind)
    if cand is None:
        return None
    pl = solve_plan(cand, p, weights, margin, cycle, extra_margin=extra_margin)
    return (cand, pl) if pl else None


def solve_verified(cycle: int, cand: Candidate, p: ParamSet, weights: dict, kind: str = "conventional",
                   fixed_until_day: Optional[float] = None, fixed_state=None, fixed_cutoff: Optional[int] = None,
                   from_day: float = 0.0):
    """DP + full-twin verification. If the twin disagrees (violation), raise the margin on the offending blocks
    and re-solve. Returns (plan, CycleResult, repair_rounds) with plan['schedule'] verified feasible."""
    margin = p["limit_margin_frac"]
    nb = len(_block_starts(len(cand.days)))
    extra = np.zeros(nb)
    for rnd in range(S.REPAIR_ROUNDS + 1):
        plan = solve_plan(cand, p, weights, margin, cycle, fixed_until_day, fixed_state, fixed_cutoff, extra)
        if plan is None and fixed_until_day is not None:
            plan = solve_plan(cand, p, weights, margin, cycle, fixed_until_day, fixed_state, fixed_cutoff, extra,
                              free_first=True)
        if plan is None:
            return None, None, rnd
        res, viol = verify_plan(cycle, plan, p, from_day, kind)
        if not viol:
            return plan, res, rnd
        bad = violation_days(res, from_day)
        for dday in res.days[bad]:
            b = int((dday - cand.prod_start) // S.BLOCK_DAYS)
            if 0 <= b < nb:
                extra[b] += S.REPAIR_STEP
    return None, None, S.REPAIR_ROUNDS + 1
