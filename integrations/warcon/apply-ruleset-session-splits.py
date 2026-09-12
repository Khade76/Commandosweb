#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path.cwd()
SESSIONS = ROOT / "src/lib/server/sessions.ts"
OBSERVE = ROOT / "src/lib/server/observe.ts"
DELTA_MARKER = "export function updateOpenSession(session: OpenSession, player: Player, now: number): void"
MARKER = "const statsGroupOfStatus = (status: Status): PublicStatsGroup =>"


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

if MARKER in observe:
    print("[44th WARCON] Dynamic Standard/Hardcore session splitting is already applied.")
    raise SystemExit(0)

if DELTA_MARKER not in sessions:
    fail("Apply integrations/warcon/apply-session-deltas.py first, then run this patch.")

observe = replace_once(
    observe,
    "\tlastMatchSeconds: number | null;\n\tlastScores: unknown;",
    "\tlastMatchSeconds: number | null;\n\t/** Ruleset currently associated with open public-stats sessions. */\n\tstatsGroup: 'normal' | 'hardcore' | null;\n\tlastScores: unknown;",
    "ServerMemory statsGroup field",
)

observe = replace_once(
    observe,
    "\t\t\tlastMatchSeconds: null,\n\t\t\tlastScores: null,",
    "\t\t\tlastMatchSeconds: null,\n\t\t\tstatsGroup: null,\n\t\t\tlastScores: null,",
    "ServerMemory statsGroup initial value",
)

observe = replace_once(
    observe,
    "\t\tm.lastMatchSeconds = null;\n\t\tm.lastScores = null;",
    "\t\tm.lastMatchSeconds = null;\n\t\tm.statsGroup = null;\n\t\tm.lastScores = null;",
    "forgetRemembered statsGroup reset",
)

helper = r'''type PublicStatsGroup = 'normal' | 'hardcore';

/**
 * Public stats are ruleset based, not server based. WARDOGS Hardcore rotations expose the
 * Hardcore marker in the live map/experience identifiers (for example KOTH_Hardcore).
 */
const statsGroupOfStatus = (status: Status): PublicStatsGroup => {
	const values = [status.map, ...(status.experiences ?? [])];
	return values.some((value) => String(value || '').toLowerCase().includes('hardcore'))
		? 'hardcore'
		: 'normal';
};

'''
observe = replace_once(
    observe,
    "// ---- the observation ----------------------------------------------------------------------------\n",
    helper + "// ---- the observation ----------------------------------------------------------------------------\n",
    "stats ruleset helper insertion point",
)

split_block = r'''\tif (!m.presence.loaded) await loadPresence(env.db, server.id, m.presence);

\t// A physical server may switch between Standard and Hardcore rotations. player_sessions can
\t// otherwise span several matches, so close the old ruleset session and let the current player
\t// list immediately open a fresh one. This keeps cumulative K/D on the correct ruleset while
\t// avoiding fake join triggers. On a WARCON process restart we also reopen existing sessions once
\t// a current player list is available, because the in-memory ruleset marker was intentionally lost.
\tlet rulesetSplit = false;
\tconst observedStatsGroup = m.status ? statsGroupOfStatus(m.status) : null;
\tif (observedStatsGroup) {
\t\tconst previousStatsGroup = m.statsGroup;
\t\tconst canSplit = players !== null;
\t\tconst reopenAfterProcessRestart =
\t\t\tpreviousStatsGroup === null && canSplit && m.presence.open.size > 0;
\t\tconst changedRuleset =
\t\t\tpreviousStatsGroup !== null && previousStatsGroup !== observedStatsGroup && canSplit;

\t\tif (reopenAfterProcessRestart || changedRuleset) {
\t\t\ttry {
\t\t\t\tawait withOwnedTransaction(env, async (tx) => {
\t\t\t\t\tawait closeAllSessions(tx, m.presence);
\t\t\t\t});
\t\t\t} catch (err) {
\t\t\t\tm.presence = newPresence();
\t\t\t\tthrow err;
\t\t\t}
\t\t\trulesetSplit = true;
\t\t}

\t\t// If an old open session is waiting for the next player poll, keep null/old state so that
\t\t// the next observation performs the split before updating counters.
\t\tif (previousStatsGroup !== null || canSplit || m.presence.open.size === 0)
\t\t\tm.statsGroup = observedStatsGroup;
\t}

\t// Joins are trusted only when the previous look at the player list is recent enough that
'''
observe = replace_once(
    observe,
    "\tif (!m.presence.loaded) await loadPresence(env.db, server.id, m.presence);\n\n\t// Joins are trusted only when the previous look at the player list is recent enough that\n",
    split_block,
    "ruleset session split block",
)

observe = replace_once(
    observe,
    "\tconst joined = joinsTrusted ? diff.joined : [];",
    "\tconst joined = rulesetSplit ? [] : joinsTrusted ? diff.joined : [];",
    "join-trigger suppression on ruleset split",
)

OBSERVE.write_text(observe, encoding="utf-8")
print("[44th WARCON] Applied dynamic Standard/Hardcore session splitting.")
