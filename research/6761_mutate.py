#!/usr/bin/env python3
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(sys.argv[1]).resolve()
LOWER = ROOT / "ProximityPrize" / "SubmissionLower"


def edit(path: Path, replacements: list[tuple[str, str]], *, required: bool = True) -> None:
    text = path.read_text()
    original = text
    for old, new in replacements:
        if old not in text:
            if required:
                raise RuntimeError(f"missing replacement in {path}: {old!r}")
            continue
        text = text.replace(old, new)
    if text != original:
        path.write_text(text)


def regex(path: Path, pattern: str, replacement: str, *, count: int = 0) -> None:
    text = path.read_text()
    updated, n = re.subn(pattern, replacement, text, count=count, flags=re.MULTILINE)
    if n == 0:
        raise RuntimeError(f"regex did not match in {path}: {pattern}")
    path.write_text(updated)


# Row-wide constants. Longer tokens are replaced first.
global_replacements = [
    ("18178600", "17632272"),
    ("17269670", "17268720"),
    ("13088592", "13087872"),
    ("10180016", "10179456"),
    ("9816444", "9815904"),
    ("9634658", "9815904"),
    ("10285930", "10287190"),
    ("23268502", "23267242"),
    ("1515716567", "1526259209"),
    ("80358", "80368"),
    ("181786", "181776"),
    ("50716", "50706"),
    ("50715", "50705"),
    ("6760", "6761"),
    ("67.60", "67.61"),
]
for path in LOWER.glob("*.lean"):
    edit(path, global_replacements, required=False)

# Profile-shape replacements shared across the proof chain.
profile_replacements = [
    ("17268720 131071 40000 29 95", "17268720 131071 57385 29 95"),
    ("17268720 131071 40000 29", "17268720 131071 57385 29"),
    ("10179456 131071 40000 15 56", "10179456 131071 57385 15 56"),
    ("10179456 131071 40000 15", "10179456 131071 57385 15"),
    ("17632272 131071 2031 31 100", "17632272 131071 2085 30 97"),
    ("17632272 131071 2031 31", "17632272 131071 2085 30"),
    ("localRankBound 100 2031 31", "localRankBound 97 2085 30"),
]
for path in LOWER.glob("*.lean"):
    edit(path, profile_replacements, required=False)

# Core arithmetic certificate.
p = LOWER / "LocatorArithmetic.lean"
edit(p, [
    ("def LA:ℕ:=40000", "def LA:ℕ:=57385"),
    ("def LB:ℕ:=2031", "def LB:ℕ:=2085"),
    ("weightedB = 100 * agreements", "weightedB = 97 * agreements"),
    ("theorem kernelThin_rank:localRankBound 56 57385 15 = 801780976:=by decide",
     "theorem kernelThin_rank:localRankBound 56 57385 15 = 1150454536:=by decide"),
    ("theorem kernelC_rank:localRankBound 95 57385 29 = 4156917435:=by decide",
     "theorem kernelC_rank:localRankBound 95 57385 29 = 5965478985:=by decide"),
    ("theorem kernelB_rank:localRankBound 97 2085 30 = 243290032:=by decide",
     "theorem kernelB_rank:localRankBound 97 2085 30 = 228164092:=by decide"),
    ("= 49646098138:=by", "= 25068190378:=by"),
    ("= 15249078268:=by", "= 320628:=by"),
    ("= 1329938895098:=by", "= 1273307576618:=by"),
    ("= 5303371189990:=by", "= 7540953967865:=by"),
    ("= 90903496:=by", "= 144598632:=by"),
    ("40000 15 78 (by decide)", "57385 15 78 (by decide)"),
    ("40000 29 132 (by decide)", "57385 29 132 (by decide)"),
    ("2085 30 139 (by decide)", "2085 30 135 (by decide)"),
    ("def fixedRegularCap:ℕ:=267000000000000000",
     "def fixedRegularCap:ℕ:=261100000000000000"),
    ("def residualStage:UnequalParameters:=⟨n, w, agreements, 138, 31, LB, 131, 29, LA⟩",
     "def residualStage:UnequalParameters:=⟨n, w, agreements, 134, 30, LB, 131, 29, LA⟩"),
    ("def residualSingular:TightParameters:=⟨n, w, agreements, weightedB, LB, 31⟩",
     "def residualSingular:TightParameters:=⟨n, w, agreements, weightedB, LB, 30⟩"),
    ("fixedSingular.countCap = 259648857430282",
     "fixedSingular.countCap = 266611930673852"),
    ("residualStage.regularCountCap = 459514589312880",
     "residualStage.regularCountCap = 624928112009876"),
    ("residualSingular.countCap = 2130351132432475",
     "residualSingular.countCap = 1984663161193171"),
    ("ledger = 269849514579175638", "ledger = 263976203203876900"),
    ("(2:ℕ)^60 * 1000000000^100", "(2:ℕ)^61 * 1000000000^100"),
    ("((60:ℝ)/100)", "((61:ℝ)/100)"),
    ("^(60:ℕ)", "^(61:ℕ)"),
    ("-((60:ℝ)/100)", "-((61:ℝ)/100)"),
    ("-((60:ℝ)/100) by norm_num", "-((61:ℝ)/100) by norm_num"),
])
# Replace the dimension-obstruction block.
regex(p,
      r"theorem A_ys72_quotient_upper[\s\S]*?theorem kernelB_total_quotient_lt",
      """theorem A_ys73_quotient_upper :\n    coefficientCount 247737 131071 39927 16 = 19207929627:=by\n  rw [coefficientCount_eq_sum_range_of_weighted_cutoff\n    247737 131071 39927 16 2 (by decide) (by decide)]\n  decide\ntheorem kernelA_ys73_quotient_lt (r:ℕ) (hr:r ≤ 16) :\n    coefficientCount (9815904 - (73 * 131071 - r)) 131071\n      (40000 - 73) (16 - r) <\n    coefficientCount 9815904 131071 40000 16 -\n      262144 * localRankBound 54 40000 16:=by\n  rw [kernelA_nullity]\n  have hmono:=RCN180.Numeric6733.coefficientCount_mono_D_s\n    (D:=9815904 - (73 * 131071 - r)) (D':=247737)\n    (w:=131071) (L:=39927) (s:=16 - r) (s':=16)\n    (by omega) (by omega)\n  rw [A_ys73_quotient_upper] at hmono\n  exact hmono.trans_lt (by decide)\ntheorem kernelB_total_quotient_lt""")
edit(p, [
    ("def fixedSingular:TightParameters:=⟨n, w, agreements, weightedA, 2029, 15⟩",
     "def fixedSingular:TightParameters:=⟨n, w, agreements, weightedA, 2083, 15⟩"),
])

# Source arithmetic reflects the enlarged ambient total cap.
p = LOWER / "LocatorSourceArithmetic.lean"
edit(p, [
    ("= 4156917435 :=", "= 5965478985 :="),
    ("= 5303371189990 :=", "= 7540953967865 :="),
])

# Whole-kernel cap proof profiles and thresholds.
p = LOWER / "LocatorCaps.lean"
edit(p, [
    ("≤ 71:=by", "≤ 72:=by"),
    ("have hy:72 ≤", "have hy:73 ≤"),
    ("have hc:9437096 ≤", "have hc:9568167 ≤"),
    ("have ht:72 ≤", "have ht:73 ≤"),
    ("9815904 131071 40000 16 54 9437096 72 0",
     "9815904 131071 40000 16 54 9568167 73 0"),
    ("globalCoefficientBox K 379348 131071 39928 16",
     "globalCoefficientBox K 247737 131071 39927 16"),
    ("show 9815904 - 9437096 = 379348", "show 9815904 - 9568167 = 247737"),
    ("show 40000 - 72 = 39928", "show 40000 - 73 = 39927"),
    ("9815904 131071 40000 16 54 379348 39928 16",
     "9815904 131071 40000 16 54 247737 39927 16"),
    ("LocatorArithmetic.A_ys72_quotient_upper",
     "LocatorArithmetic.A_ys73_quotient_upper"),
    ("wt residualTotalWeights F ≤ 2029", "wt residualTotalWeights F ≤ 2083"),
    ("have ht:2030 ≤", "have ht:2084 ≤"),
    ("2085 30 97 0 2030 0", "2085 30 97 0 2084 0"),
    ("show 2085 - 2030 = 1", "show 2085 - 2084 = 1"),
])

# Enlarged ambient and thin kernels throughout selection and extension modules.
for name in ["LocatorSelection.lean", "LocatorAuxiliarySelection.lean"]:
    p = LOWER / name
    edit(p, [
        ("CoefficientIndex 17268720 131071 40000 29", "CoefficientIndex 17268720 131071 57385 29"),
        ("reconstruct K 17268720 131071 40000 29", "reconstruct K 17268720 131071 57385 29"),
        ("globalCoefficientBox K 17268720 131071 40000 29", "globalCoefficientBox K 17268720 131071 57385 29"),
        ("Lmax:=40000", "Lmax:=57385"),
    ], required=False)

# Exact fixed auxiliary kernels.
p = LOWER / "LocatorAuxiliaryArithmetic.lean"
p.write_text("""import ProximityPrize.SubmissionLower.LocatorArithmetic\nnamespace ProximityPrize.SubmissionLower.LocatorAuxiliaryArithmetic\nopen RCN100 RCN119 RCN302\nset_option maxRecDepth 100000\nset_option maxHeartbeats 5000000\ntheorem auxiliary95_rank:localRankBound 95 2840 29 = 291162635:=by decide\ntheorem auxiliary95_nullity :\n    coefficientCount 17268720 131071 2840 29 -\n      262144 * localRankBound 95 2840 29 = 101080058240:=by\n  rw [auxiliary95_rank, coefficientCount_eq_sum_range_of_weighted_cutoff\n    17268720 131071 2840 29 132 (by decide) (by decide)]\n  decide\ntheorem auxiliary95_shape:17268720 + 29 ≤ 131071 * (131 + 1):=by decide\ntheorem auxiliary95_capacity :\n    17268720 - 50706 ≤ (95 - 1) * 181776 + (131071 - 1):=by decide\ntheorem auxiliary72_rank:localRankBound 72 40000 21 = 1778443381:=by decide\ntheorem auxiliary72_nullity :\n    coefficientCount 13087872 131071 40000 21 -\n      262144 * localRankBound 72 40000 21 = 1273307576618:=by\n  rw [auxiliary72_rank, coefficientCount_eq_sum_range_of_weighted_cutoff\n    13087872 131071 40000 21 100 (by decide) (by decide)]\n  decide\ntheorem auxiliary72_shape:13087872 + 21 ≤ 131071 * (99 + 1):=by decide\ntheorem auxiliary72_capacity :\n    13087872 - 50706 ≤ (72 - 1) * 181776 + (131071 - 1):=by decide\nend ProximityPrize.SubmissionLower.LocatorAuxiliaryArithmetic\n""")

# Unit YS and 32-wide total locator partition.
p = LOWER / "LocatorReplacementGrid.lean"
edit(p, [
    ("Fin 15 × Fin 18 × Fin 16", "Fin 15 × Fin 72 × Fin 66"),
    ("r c + 4 * c.2.1.val", "r c + c.2.1.val"),
    ("min 71 (ylo c + 3)", "min 72 (ylo c)"),
    ("128 * c.2.2.val", "32 * c.2.2.val"),
    ("min 2029 (tlo c + 127)", "min 2083 (tlo c + 31)"),
    ("ylo c ≤ 71", "ylo c ≤ 72"),
    ("2029 - tlo c", "2083 - tlo c"),
    ("71 - ylo c", "72 - ylo c"),
    ("remainingCap 2029 71 15", "remainingCap 2083 72 15"),
    ("cellCost 2029 71 15", "cellCost 2083 72 15"),
    ("middle p ≤ 71", "middle p ≤ 72"),
    ("total p ≤ 2029", "total p ≤ 2083"),
    ("⟨(middle p - p.all) / 4, by omega⟩", "⟨middle p - p.all, by omega⟩"),
    ("⟨total p / 128, by omega⟩", "⟨total p / 32, by omega⟩"),
    ("(p.all - 1 + 1) + 4 * ((middle p - p.all) / 4)",
     "(p.all - 1 + 1) + (middle p - p.all)"),
    ("min 71 ((p.all - 1 + 1) + 4 * ((middle p - p.all) / 4) + 3)",
     "min 72 ((p.all - 1 + 1) + (middle p - p.all))"),
    ("128 * (total p / 128)", "32 * (total p / 32)"),
    ("min 2029 (128 * (total p / 128) + 127)",
     "min 2083 (32 * (total p / 32) + 31)"),
    ("yhi c ≤ 71", "yhi c ≤ 72"),
])

# Route arithmetic and exact decidable receipts.
p = LOWER / "LocatorReplacementData.lean"
edit(p, [
    ("private abbrev bound:ℕ:=267000000000000000",
     "private abbrev bound:ℕ:=261100000000000000"),
    ("def quotient95T (c:Cell):ℕ:=2800 - tlo c",
     "def quotient95T (c:Cell):ℕ:=2840 - tlo c"),
    ("def quotient72T (c:Cell):ℕ:=7000 - tlo c",
     "def quotient72T (c:Cell):ℕ:=40000 - tlo c"),
    ("2029 * LocatorFactorAggregate", "2083 * LocatorFactorAggregate"),
    ("cap 2029 (yhi c)", "cap 2083 (yhi c)"),
    ("band95 c < 104761399990", "band95 c < 101080058240"),
    ("band72 c < 155878194098", "band72 c < 1273307576618"),
    ("Fin 18", "Fin 72"),
    ("Fin 16", "Fin 66"),
])

# Scalar list certificate at (54,74,15).
p = LOWER / "LocatorScalarArithmetic.lean"
edit(p, [
    ("def multiplicity:ℕ:=53", "def multiplicity:ℕ:=54"),
    ("def yTotalCap:ℕ:=73", "def yTotalCap:ℕ:=74"),
    ("= 1289890160", "= 1318889520"),
    ("= 1080176560", "= 1109175920"),
    ("= 870462960", "= 899462320"),
    ("= 660749360", "= 689748720"),
    ("= 451035760", "= 480035120"),
    ("= 241386741", "= 270321520"),
    ("= 64642165", "= 83027130"),
    ("Finset.range 4, coefficientRow (70+i)) = 1975470",
     "Finset.range 5, coefficientRow (70+i)) = 4371190"),
    ("coefficientCount weightedCap w yTotalCap slopeCap = 4660319176",
     "coefficientCount weightedCap w yTotalCap slopeCap = 4855031440"),
    ("Finset.range 74", "Finset.range 75"),
    ("Finset.sum_range_add coefficientRow 70 4", "Finset.sum_range_add coefficientRow 70 5"),
    ("= 4596", "= 4647"),
    ("= 3792", "= 4116"),
    ("Finset.range 5, rankRow (48+i)) = 940",
     "Finset.range 6, rankRow (48+i)) = 1309"),
    ("localRankBound multiplicity yTotalCap slopeCap = 17776",
     "localRankBound multiplicity yTotalCap slopeCap = 18520"),
    ("Finset.range 53", "Finset.range 54"),
    ("Finset.sum_range_add rankRow 48 5", "Finset.sum_range_add rankRow 48 6"),
    ("= 447432:=by", "= 124560:=by"),
    ("singularListCap=2117", "singularListCap=2146"),
    ("listNumerator=73993805900931", "listNumerator=75007419632003"),
    ("listNumerator/gap+1=1459012243", "listNumerator/gap+1=1479290399"),
    ("listNumerator<1459012243*gap", "listNumerator<1479290399*gap"),
    ("1459012243<listBudget", "1479290399<listBudget"),
])

# Shared caps, row values, and allocation in remaining locator files.
for path in LOWER.glob("Locator*.lean"):
    edit(path, [
        ("267000000000000000", "261100000000000000"),
        ("2029", "2083"),
        ("≤ 71", "≤ 72"),
        (" 71 ", " 72 "),
        ("2800", "2840"),
        ("7000", "40000"),
    ], required=False)

# Repair profile-specific substitutions that generic cap replacement must not alter.
p = LOWER / "LocatorArithmetic.lean"
edit(p, [
    ("def LB:ℕ:=2083", "def LB:ℕ:=2085"),
    ("weightedB, LB, 31", "weightedB, LB, 30"),
], required=False)

# Score metadata.
(LOWER / "score.txt").write_text("67.61\n")
(LOWER / "radius.txt").write_text("10287190/33554432\n")

stale = ["80358", "181786", "50716", "50715", "10285930", "6760"]
for token in stale:
    hits=[]
    for path in LOWER.glob("*.lean"):
        if token in path.read_text():
            hits.append(path.name)
    if hits:
        print(f"STALE {token}: {', '.join(hits)}")

print("67.61 mutation applied")
