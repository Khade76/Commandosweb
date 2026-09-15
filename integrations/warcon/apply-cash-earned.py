#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path.cwd()
SCHEMA = ROOT / "src/lib/server/db/schema.ts"
SESSIONS = ROOT / "src/lib/server/sessions.ts"
MARKER = "cashEarned: number;"


def fail(message: str) -> None:
    print(f"[44th WARCON] ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        fail(f"Expected exactly one {label} block, found {count}. WARCON upstream may have changed.")
    return text.replace(old, new, 1)


def replace_exact(text: str, old: str, new: str, expected: int, label: str) -> str:
    count = text.count(old)
    if count != expected:
        fail(f"Expected exactly {expected} {label} blocks, found {count}. WARCON upstream may have changed.")
    return text.replace(old, new)


if not SCHEMA.is_file() or not SESSIONS.is_file():
    fail("Run this script from the WARCON source directory.")

schema = SCHEMA.read_text(encoding="utf-8")
sessions = SESSIONS.read_text(encoding="utf-8")

if MARKER in sessions:
    print("[44th WARCON] Forward cash-earned tracking is already applied.")
    raise SystemExit(0)

if "export function updateOpenSession" not in sessions:
    fail("Apply integrations/warcon/apply-session-deltas.py before this patch.")

schema = replace_once(
    schema,
    "\tbigserial,\n",
    "\tbigint,\n\tbigserial,\n",
    "bigint import",
)
schema = replace_once(
    schema,
    "\t\tcash: integer('cash').notNull().default(0)\n",
    "\t\tcash: integer('cash').notNull().default(0),\n"
    "\t\tcashEarned: bigint('cash_earned', { mode: 'number' }).notNull().default(0)\n",
    "player session cash schema",
)

sessions = replace_once(
    sessions,
    "\trawDeaths?: number;\n\tcash: number;",
    "\trawDeaths?: number;\n"
    "\t/** Positive cash deltas observed since this connection began. */\n"
    "\tcashEarned: number;\n"
    "\t/** Last raw cash value seen; undefined after a worker restart until its first observation. */\n"
    "\trawCash?: number;\n"
    "\tcash: number;",
    "OpenSession cash fields",
)
sessions = replace_once(
    sessions,
    "\t\t\tdeaths: r.deaths,\n\t\t\tcash: r.cash,",
    "\t\t\tdeaths: r.deaths,\n"
    "\t\t\tcashEarned: r.cashEarned,\n"
    "\t\t\trawCash: undefined,\n"
    "\t\t\tcash: r.cash,",
    "reloaded cash state",
)
sessions = replace_once(
    sessions,
    "\t\ts.rawDeaths = p.deaths;\n\t}\n\ts.cash = p.cash;",
    "\t\ts.rawDeaths = p.deaths;\n"
    "\t}\n"
    "\tif (s.rawCash === undefined) s.rawCash = p.cash;\n"
    "\telse {\n"
    "\t\ts.cashEarned += Math.max(0, p.cash - s.rawCash);\n"
    "\t\ts.rawCash = p.cash;\n"
    "\t}\n"
    "\ts.cash = p.cash;",
    "cash delta update",
)
sessions = replace_once(
    sessions,
    "\t\t\t\trawDeaths: p.deaths,\n\t\t\t\tcash: p.cash,",
    "\t\t\t\trawDeaths: p.deaths,\n"
    "\t\t\t\tcashEarned: 0,\n"
    "\t\t\t\trawCash: p.cash,\n"
    "\t\t\t\tcash: p.cash,",
    "joined cash state",
)

sessions = replace_exact(
    sessions,
    "name = v.name, faction = v.faction, kills = v.kills, deaths = v.deaths, cash = v.cash\n",
    "name = v.name, faction = v.faction, kills = v.kills, deaths = v.deaths, cash = v.cash,\n"
    "\t\t\t       cash_earned = v.cash_earned\n",
    2,
    "session cash update",
)
sessions = replace_exact(
    sessions,
    "\t\t\t\t\t\tdeaths: s.deaths,\n\t\t\t\t\t\tcash: s.cash\n",
    "\t\t\t\t\t\tdeaths: s.deaths,\n"
    "\t\t\t\t\t\tcash: s.cash,\n"
    "\t\t\t\t\t\tcash_earned: s.cashEarned\n",
    2,
    "session cash payload",
)
sessions = replace_once(
    sessions,
    ")}) AS v(id bigint, left_at timestamptz, name text, faction text, kills int, deaths int, cash int)\n",
    ")}) AS v(id bigint, left_at timestamptz, name text, faction text, kills int, deaths int, cash int, cash_earned bigint)\n",
    "closed session cash recordset",
)
sessions = replace_once(
    sessions,
    ")}) AS v(id bigint, last_seen timestamptz, name text, faction text, kills int, deaths int, cash int)\n",
    ")}) AS v(id bigint, last_seen timestamptz, name text, faction text, kills int, deaths int, cash int, cash_earned bigint)\n",
    "heartbeat cash recordset",
)

SCHEMA.write_text(schema, encoding="utf-8")
SESSIONS.write_text(sessions, encoding="utf-8")
print("[44th WARCON] Applied forward-only cash-earned tracking.")
