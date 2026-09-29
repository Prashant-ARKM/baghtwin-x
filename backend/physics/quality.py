"""Sensor data-quality checks (ingestion layer): dropouts, range errors, spikes, stuck values.

Flag codes: 0 ok | 1 dropout | 2 stuck | 3 spike | 4 out of range
Downstream models (Kalman estimator, calibration) use only flag == 0 samples.
"""
from __future__ import annotations

from typing import Dict

import numpy as np

OK, DROPOUT, STUCK, SPIKE, RANGE = 0, 1, 2, 3, 4
NAMES = {OK: "ok", DROPOUT: "dropout", STUCK: "stuck", SPIKE: "spike", RANGE: "out_of_range"}


def _rolling_median(v: np.ndarray, w: int) -> np.ndarray:
    half = w // 2
    pad = np.pad(v, half, mode="edge")
    return np.array([np.median(pad[i:i + w]) for i in range(len(v))])


def flag_series(values, lo: float, hi: float, stuck_run: int = 4, spike_abs: float = 12.0, spike_z: float = 5.0):
    v = np.asarray(values, dtype=float)
    flags = np.zeros(v.size, dtype=int)
    finite = np.isfinite(v)
    flags[~finite] = DROPOUT
    flags[finite & ((v < lo) | (v > hi))] = RANGE

    # stuck: >= stuck_run identical consecutive finite values
    i = 0
    while i < v.size:
        j = i
        while j + 1 < v.size and finite[j + 1] and finite[i] and v[j + 1] == v[i]:
            j += 1
        if finite[i] and (j - i + 1) >= stuck_run:
            flags[i:j + 1] = np.where(flags[i:j + 1] == OK, STUCK, flags[i:j + 1])
        i = j + 1

    # spikes: residual against a rolling median (exact for monotone ramps, so heating/cooling are not flagged)
    ok = flags == OK
    if ok.sum() > 10:
        filled = np.where(ok, v, np.nan)
        idx = np.arange(v.size)
        filled = np.interp(idx, idx[ok], v[ok])
        res = filled - _rolling_median(filled, 5)
        sigma = 1.4826 * np.median(np.abs(res[2:-2] - np.median(res[2:-2]))) + 1e-9
        thr = max(spike_abs, spike_z * sigma)
        bad = ok & (np.abs(res) > thr)
        bad[:2] = False
        bad[-2:] = False
        flags[bad] = SPIKE
    return flags


def quality_report(name: str, flags) -> Dict[str, object]:
    f = np.asarray(flags)
    counts = {NAMES[k]: int((f == k).sum()) for k in NAMES}
    return {"channel": name, "n": int(f.size), "score": float((f == OK).mean()), "counts": counts}
