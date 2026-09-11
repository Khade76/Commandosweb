#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path.cwd()
SESSIONS = ROOT / "src/lib/server/sessions.ts"
OBSERVE = ROOT / "src/lib/server/observe.ts"
MARKER = "export function updateOpenSession(session: OpenSession, player: Player, now: number): void"


def fail(message: str) -> None:
    print(f"[44th WARCON] ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        fail(f"Expected exactly one {label} block, found {count}. WARCON upstream may have changed.")
    return text.replace(old, new, 1)


if not SESSIONS.is_file() or not OBSERVE.is_file():
    fail("Run this script from the WARCON source directory (the folder containing src/lib/server).")

sessions = SESSIONS.read_text(encoding="utf-8")
observe = OBSERVE.read_text(encoding="utf-8")

if MARKER in sessions:
    print("[44th WARCON] Session delta patch is already applied.")
    raise SystemExit(0)

sessions = replace_once(
    sessions,
    """\tfaction: string | null;\n\tkills: number;\n\tdeaths: number;\n\tcash: number;""",
    """\tfaction: string | null;\n\t/** Cumulative kills/deaths for this connection session. */\n\tkills: number;\n\tdeaths: number;\n\t/** Last raw game counters seen. Undefined after a WARCON restart until the first observation. */\n\trawKills?: number;\n\trawDeaths?: number;\n\tcash: number;""",
    "OpenSession fields",
)

sessions = replace_once(
    sessions,
    """export const newPresence = (): Presence => ({ loaded: false, open: new Map(), heartbeatAt: 0 });\n""",
    """export const newPresence = (): Presence => ({ loaded: false, open: new Map(), heartbeatAt: 0 });\n\n/**\n * Advances an open session from the current game counters. WARDOGS resets kills/deaths when a\n * match changes; keeping the raw counter separately lets the session retain the deltas from every\n * match the player stayed connected for. After a WARCON process restart rawKills/rawDeaths are\n * unknown, so the first observation only establishes a baseline and avoids double counting.\n */\nexport function updateOpenSession(session: OpenSession, player: Player, now: number): void {\n\tsession.name = player.name;\n\tsession.faction = player.faction;\n\tif (session.rawKills === undefined) session.rawKills = player.kills;\n\telse {\n\t\tsession.kills += player.kills >= session.rawKills ? player.kills - session.rawKills : player.kills;\n\t\tsession.rawKills = player.kills;\n\t}\n\tif (session.rawDeaths === undefined) session.rawDeaths = player.deaths;\n\telse {\n\t\tsession.deaths +=\n\t\t\tplayer.deaths >= session.rawDeaths ? player.deaths - session.rawDeaths : player.deaths;\n\t\tsession.rawDeaths = player.deaths;\n\t}\n\tsession.cash = player.cash;\n\tsession.lastSeen = now;\n}\n""",
    "newPresence",
)

sessions = replace_once(
    sessions,
    """\t\t\t\tkills: p.kills,\n\t\t\t\tdeaths: p.deaths,\n\t\t\t\tcash: p.cash,""",
    """\t\t\t\tkills: p.kills,\n\t\t\t\tdeaths: p.deaths,\n\t\t\t\trawKills: p.kills,\n\t\t\t\trawDeaths: p.deaths,\n\t\t\t\tcash: p.cash,""",
    "joined session raw counters",
)

sessions = replace_once(
    sessions,
    """\n\tfor (const { player: p, session: s } of diff.stayed) {\n\t\ts.name = p.name;\n\t\ts.faction = p.faction;\n\t\ts.kills = p.kills;\n\t\ts.deaths = p.deaths;\n\t\ts.cash = p.cash;\n\t\ts.lastSeen = now;\n\t}\n\tif (heartbeatDue && diff.stayed.length) {""",
    """\n\tif (heartbeatDue && diff.stayed.length) {""",
    "persistPresence raw overwrite loop",
)

observe = replace_once(
    observe,
    """\tnewPresence,\n\tpersistPresence,\n\ttype Presence,""",
    """\tnewPresence,\n\tpersistPresence,\n\tupdateOpenSession,\n\ttype Presence,""",
    "observe import",
)

observe = replace_once(
    observe,
    """\t// Memory follows every player observation; the database only when something is due.\n\tfor (const { player: p, session: s } of diff.stayed) {\n\t\ts.name = p.name;\n\t\ts.faction = p.faction;\n\t\ts.kills = p.kills;\n\t\ts.deaths = p.deaths;\n\t\ts.cash = p.cash;\n\t\ts.lastSeen = started;\n\t}""",
    """\t// Memory follows every player observation; the database only when something is due.\n\tfor (const { player: p, session: s } of diff.stayed) updateOpenSession(s, p, started);""",
    "observe session update loop",
)

SESSIONS.write_text(sessions, encoding="utf-8")
OBSERVE.write_text(observe, encoding="utf-8")
print("[44th WARCON] Applied cumulative kill/death session tracking.")
