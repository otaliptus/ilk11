#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path

root = Path(sys.argv[1]).resolve() / "ProximityPrize" / "SubmissionLower"


def fix(name: str, pairs: list[tuple[str, str]]) -> None:
    path = root / name
    text = path.read_text()
    for old, new in pairs:
        if old not in text and new not in text:
            raise RuntimeError(f"missing post-fix in {name}: {old!r}")
        text = text.replace(old, new)
    path.write_text(text)


fix("LocatorFixed.lean", [
    ("have halg:(2*S-1)*T ≤ 58841:=by",
     "have halg:(2*S-1)*T ≤ 60407:=by"),
])

print("67.61 exact-certificate post-pass applied")
