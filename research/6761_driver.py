#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path

here = Path(__file__).resolve().parent
source = (here / "6761_mutate.py").read_text()
needle = '    ("localRankBound 100 2031 31", "localRankBound 97 2085 30"),\n'
insert = (
    '    ("localRankBound 56 40000 15", "localRankBound 56 57385 15"),\n'
    '    ("localRankBound 95 40000 29", "localRankBound 95 57385 29"),\n'
    + needle
)
if needle not in source:
    raise RuntimeError("profile rewrite insertion point not found")
source = source.replace(needle, insert, 1)
namespace = {"__name__": "__main__", "__file__": str(here / "6761_mutate.py")}
exec(compile(source, str(here / "6761_mutate.py"), "exec"), namespace)
