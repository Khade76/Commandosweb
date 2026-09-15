#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path.cwd()
OBSERVE = ROOT / "src/lib/server/observe.ts"
RULESET_MARKER = "const statsGroupOfStatus = (status: Status): PublicStatsGroup =>"
MARKER = "const roundRestarted ="


def fail(message: str) -> None:
    print(f"[44th WARCON] ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        fail(f"Expected exactly one {label} block, found {count}. WARCON upstream may have changed.")
    return text.replace(old, new, 1)


if not OBSERVE.is_file():
    fail("Run this script from the WARCON source directory (the folder containing src/lib/server).")

observe = OBSERVE.read_text(encoding="utf-8")

if MARKER in observe:
    print("[44th WARCON] Per-round public-stat session splitting is already applied.")
    raise SystemExit(0)

if RULESET_MARKER not in observe:
    fail("Apply integrations/warcon/apply-ruleset-session-splits.py before this patch.")

observe = replace_once(
    observe,
    "\t\tconst canSplit = players !== null;\n\t\tconst reopenAfterProcessRestart =",
    "\t\tconst canSplit = players !== null;\n"
    "\t\t// A substantial backwards jump in the game-reported match clock marks a new round.\n"
    "\t\t// Split while the current player list is available so every new session starts with\n"
    "\t\t// that player's new-round cash baseline and records only this round's earnings.\n"
    "\t\tconst roundRestarted =\n"
    "\t\t\tcanSplit &&\n"
    "\t\t\tm.lastMatchSeconds !== null &&\n"
    "\t\t\tm.status?.matchSeconds !== null &&\n"
    "\t\t\tm.status.matchSeconds + 30 < m.lastMatchSeconds;\n"
    "\t\tconst reopenAfterProcessRestart =",
    "round-boundary detection insertion point",
)

observe = replace_once(
    observe,
    "\t\tif (reopenAfterProcessRestart || changedRuleset) {",
    "\t\tif (reopenAfterProcessRestart || changedRuleset || roundRestarted) {",
    "round-boundary session split condition",
)

OBSERVE.write_text(observe, encoding="utf-8")
print("[44th WARCON] Applied per-round public-stat session splitting.")
