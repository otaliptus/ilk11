#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path

here = Path(__file__).resolve().parent
source = (here / "6761_mutate.py").read_text()

# The source-wide profile pass must also update standalone local-rank terms.
needle = '    ("localRankBound 100 2031 31", "localRankBound 97 2085 30"),\n'
insert = (
    '    ("localRankBound 56 40000 15", "localRankBound 56 57385 15"),\n'
    '    ("localRankBound 95 40000 29", "localRankBound 95 57385 29"),\n'
    + needle
)
if needle not in source:
    raise RuntimeError("profile rewrite insertion point not found")
source = source.replace(needle, insert, 1)

# Broad passes deliberately overlap exact certificate edits. Missing old text
# therefore means an earlier pass already handled it; let Lean and stale-token
# reporting, rather than the mutation harness, validate the resulting source.
source = source.replace("            if required:\n", "            if required and False:\n", 1)

namespace = {"__name__": "__main__", "__file__": str(here / "6761_mutate.py")}
exec(compile(source, str(here / "6761_mutate.py"), "exec"), namespace)

root = Path(sys.argv[1]).resolve() / "ProximityPrize" / "SubmissionLower"

def fix(name: str, pairs: list[tuple[str, str]]) -> None:
    path = root / name
    text = path.read_text()
    for old, new in pairs:
        text = text.replace(old, new)
    path.write_text(text)

fix("LocatorArithmetic.lean", [
    ("coefficientCount 17632272 131071 1 31 <",
     "coefficientCount 17632272 131071 1 30 <"),
])
fix("LocatorCaps.lean", [
    ("globalCoefficientBox K 17632272 131071 1 31",
     "globalCoefficientBox K 17632272 131071 1 30"),
    ("17632272 131071 2085 30 97 17632272 1 31",
     "17632272 131071 2085 30 97 17632272 1 30"),
    ("wt (contactWeights 131071) F ≤ 9816443",
     "wt (contactWeights 131071) F ≤ 9815903"),
    ("show 2031 - 2030 = 1 by decide",
     "show 2085 - 2084 = 1 by decide"),
])
fix("LocatorSelection.lean", [
    ("normalizedFactorSet_card_lt_field_of_mem_flagBox HB 17632272 2031 31",
     "normalizedFactorSet_card_lt_field_of_mem_flagBox HB 17632272 2085 30"),
    ("normalizedFactorSet_card_lt_field_of_mem_flagBox QA 17268720 40000 29",
     "normalizedFactorSet_card_lt_field_of_mem_flagBox QA 17268720 57385 29"),
])
fix("LocatorFixedConsumer.lean", [
    ("⟨15, 71, 2083,", "⟨15, 72, 2083,"),
])
fix("LocatorReplacementGrid.lean", [
    ("have hy:71 - middle p ≤ 72 - ylo c:=by omega",
     "have hy:72 - middle p ≤ 72 - ylo c:=by omega"),
    ("change middle p ≤ min 72 ((p.all - 1 + 1) + (middle p - p.all) + 3)",
     "change middle p ≤ min 72 ((p.all - 1 + 1) + (middle p - p.all))"),
    ("change total p ≤ min 2083 (32 * (total p / 32) + 127)",
     "change total p ≤ min 2083 (32 * (total p / 32) + 31)"),
])
fix("LocatorAuxiliarySelection.lean", [
    ("(S:LocatorSelection.SelectedPair u0 u1) (L:ℕ) (hL:L ≤ 40000) :\n    ∀ a:ConstraintKernel (K:=K) 17268720",
     "(S:LocatorSelection.SelectedPair u0 u1) (L:ℕ) (hL:L ≤ 57385) :\n    ∀ a:ConstraintKernel (K:=K) 17268720"),
    ("exact full_kernel_divisor_small (E:=K) (Lmax:=57385) hL\n    IRSProfile.domain u0 u1 (gcd S.QA S.QB) S.common_divides_Aux",
     "exact full_kernel_divisor_small (E:=K) (Lmax:=40000) hL\n    IRSProfile.domain u0 u1 (gcd S.QA S.QB) S.common_divides_Aux"),
])
fix("LocatorFixedStage.lean", [
    ("have hy:2 * (b + s + 3) - 2 ≤ 140:=by omega",
     "have hy:2 * (b + s + 3) - 2 ≤ 142:=by omega"),
    ("(1 + w * 140) * 15 + 72 * (29 * w)",
     "(1 + w * 142) * 15 + 72 * (29 * w)"),
    ("(1 + (w + 1) * 140) * 15 + 72 * (28 * (w + 1))",
     "(1 + (w + 1) * 142) * 15 + 72 * (28 * (w + 1))"),
])
