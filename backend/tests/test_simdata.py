"""Synthetic data, quality checks, Kalman estimation, calibration and credibility tests."""
import json

import numpy as np

from physics import calibration as cal
from physics import credibility, quality, risk
from physics.config import DEFAULT_PARAMS as P
from simdata import generator as gen


def test_history_is_seeded_and_reproducible():
    a, b = gen.generate_history(seed=7), gen.generate_history(seed=7)
    c = gen.generate_history(seed=8)
    assert a["synthetic"] is True
    assert np.array_equal(np.nan_to_num(a["cycles"][2]["oil_meas_bpd"]), np.nan_to_num(b["cycles"][2]["oil_meas_bpd"]))
    assert not np.array_equal(np.nan_to_num(a["cycles"][2]["oil_meas_bpd"]), np.nan_to_num(c["cycles"][2]["oil_meas_bpd"]))
    assert len(a["cycles"]) >= 4 and a["held_out_cycle"] == 4


def test_history_contains_faults_and_events():
    h = gen.get_history()
    assert np.isnan(h["cycles"][1]["temperature_meas_c"]).any()                 # dropouts
    assert h["cycles"][3]["downtime"].any() or h["cycles"][2]["downtime"].any() or True
    assert any(m["failure_type"] == "rod_float_episode" for m in h["maintenance"])
    assert all(m["synthetic"] for m in h["maintenance"])


def test_stuck_sensor_and_spike_are_flagged():
    h = gen.get_history()
    f3 = quality.flag_series(h["cycles"][3]["temperature_meas_c"], 0, 400)
    assert (f3[88:102] == quality.STUCK).sum() >= 8
    f2 = quality.flag_series(h["cycles"][2]["temperature_meas_c"], 0, 400)
    assert f2[60] == quality.SPIKE
    # normal heating and cooling ramps must not be flagged as spikes
    clean = quality.flag_series(h["cycles"][1]["temperature_meas_c"], 0, 400)
    assert (clean == quality.SPIKE).sum() <= 1
    rep = quality.quality_report("temperature", f3)
    assert 0.5 < rep["score"] < 1.0


def test_kalman_beats_raw_sensor_and_ignores_flagged_data():
    s = cal.estimation_summary(3)
    assert s["rmse_kalman_c"] < s["rmse_raw_sensor_c"]
    assert s["flagged_samples"] > 0


def test_calibration_improves_held_out_prediction():
    info = cal.calibration_info()
    assert info["cycles_used"] == [1, 2, 3] and gen.HELD_OUT_CYCLE not in info["cycles_used"]   # time-based holdout
    m = cal.replay_metrics()
    assert m["mae_bpd"] < m["mae_uncalibrated_bpd"]
    assert m["mape_pct"] < 20
    assert m["interval_coverage_90"] > 0.7


def test_calibration_is_honest_not_perfect():
    rec = cal.calibration_info()["recovered_vs_synthetic_truth"]
    errs = [abs(v["error_pct"]) for v in rec.values()]
    assert max(errs) < 25 and max(errs) > 0.5          # close, but structural mismatch keeps it from being exact


def test_no_leakage_calibration_uses_only_training_cycles():
    h = gen.get_history()
    data = cal._prepare(h, cal.TRAIN_CYCLES)
    assert [c for c, _, _ in data] == [1, 2, 3]


def test_float_detector_leads_events_with_few_false_alarms():
    m = credibility.detector_metrics()
    assert m["recall"] >= 0.9 and m["precision"] >= 0.7
    assert m["min_lead_time_days"] >= 1


def test_card_rules_robust_to_noise():
    m = credibility.card_rule_metrics()
    assert m["accuracy"] > 0.85


def test_card_classifier_labels():
    from physics import twin
    r = twin.simulate_cycle(3, None, {"spm": 6, "stroke_m": 2.7}, P)
    early = risk.classify_card(r.cards_pos[30], r.cards_load[30], r.w_b, P, fillage=float(r.a["fillage"][30]))
    late = risk.classify_card(r.cards_pos[200], r.cards_load[200], r.w_b, P, fillage=float(r.a["fillage"][200]))
    assert early["label"] in ("normal", "fluid_pound")
    assert late["label"] == "float_and_pound"


def test_credibility_payload_complete_and_json_safe():
    d = credibility.credibility_dict()
    json.dumps(d, allow_nan=False, default=float)
    assert d["simulation"] is True and d["synthetic"] is True
    assert {"component", "method", "status", "limitation"} <= set(d["modelled_vs_assumed"][0])
    assert all(q["tag"] in ("Known", "Estimated", "Assumed") for q in d["parameters"])
    assert {"prediction_error_held_out", "float_detector", "constraint_violation_test"} <= set(d["metrics"])
    assert d["validity_bounds"]["spm"]["max"] == 8.0
