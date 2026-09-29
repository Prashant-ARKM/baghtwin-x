"""Tunable constants for the optimizer. Every value here is a PLACEHOLDER owned by OIL engineering/economics."""
from __future__ import annotations

# ---- objective:  S = J / (cycle_days + turnaround)   [USD per cycle-day]
#      J = w_oil*revenue - w_energy*(steam + power cost) - w_failure*expected failure cost
#          - w_sor*SOR_COEFF*SOR - w_risk*RISK_COEFF*sum(P_float)
COEFFS = {
    "turnaround_days": 20.0,        # well down-time between cycles (gives an economic cut-off day)
    "steam_all_in_factor": 3.0,     # all-in steam cost = fuel cost x this (water treatment, O&M, capital charge)
    "sor_coeff_usd": 3000.0,        # penalty per unit steam-oil ratio
    "risk_coeff_usd_per_day": 1500.0,  # soft penalty per day per unit float probability
    "switch_cost_usd": 25.0,        # cost of each pump set-point change
}
DEFAULT_WEIGHTS = {"oil": 1.0, "sor": 1.0, "energy": 1.0, "failure": 1.0, "risk": 1.0}

# ---- schedule resolution
BLOCK_DAYS = 5                      # pump set-point held for this many days
MAX_DSPM = 2.0                      # bounded change per block
MAX_DSTROKE = 0.6

SPM_COARSE = [2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0]
STROKE_COARSE = [2.1, 2.7, 3.0]
SPM_FINE = [2.0 + 0.5 * i for i in range(13)]           # 2.0 ... 8.0
STROKE_FINE = [1.8, 2.1, 2.4, 2.7, 3.0]

# ---- search
SEED = 20260929
N_SOBOL = 16                        # space-filling design over the CSS variables (power of two)
REFINE_ROUNDS = 2
REFINE_TOP = 3                      # best candidates refined per round
REFINE_SAMPLES = 2                  # local samples around each
REPAIR_ROUNDS = 6
REPAIR_STEP = 0.03                  # extra margin applied to blocks that violate after verification

# ---- trust region around the current CSS design (recommend-only: no wild jumps from current practice)
CSS_TRUST = {"steam_volume_frac": 0.30, "pressure_mpa": 2.0, "soak_days": 3.0}

# ---- CSS decision-variable bounds (validity range of the model; pressure limits come from ParamSet)
CSS_BOUNDS = {
    "steam_volume_m3": (800.0, 2600.0),
    "soak_days": (3.0, 14.0),
    "cutoff_day": (120.0, 300.0),
}
CSS_ROUND = {"steam_volume_m3": 10.0, "injection_pressure_mpa": 0.1, "soak_days": 1.0, "cutoff_day": 5.0}

ACTIVE_TOL_PCT = 10.0               # a constraint is reported as active when within this % of its limit
