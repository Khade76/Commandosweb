import { sql } from 'drizzle-orm';

function finite(value: unknown): number {
	const n = Number(value ?? 0);
	return Number.isFinite(n) ? n : 0;
}

function sqlList(values: string[]) {
	return sql.join(values.map((value) => sql`${value}`), sql`, `);
}

function feedStartValues(ids: string[], feedStarts: Date[]) {
	return sql.join(ids.map((id, index) => sql`(${id}, ${feedStarts[index]}::timestamptz)`), sql`, `);
}

function stringArray(value: unknown): string[] {
	return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function objectNumbers(value: unknown): Record<string, number> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
	return Object.fromEntries(Object.entries(value).map(([key, count]) => [key, finite(count)]));
}

export type StatsRow = Record<string, unknown> & {
	// Leader cards intentionally supply fewer fields than enriched profile rows.
	steamId: string; name: string | null;
};

// Frozen 44th legacy contract: pre-feed session totals plus feed events, including
// its historical match rule. Do not replace this with native completed-match
// rollups without an explicit migration; website and Discord rely on these totals.
export function boardBase(ids: string[], from: Date, feedStarts: Date[]) {
	const selected = sqlList(ids);
	return sql`
		feed_start(server_id, starts_at) AS (VALUES ${feedStartValues(ids, feedStarts)}),
		s AS (
			SELECT id, server_id, steam_id, faction, joined_at, COALESCE(left_at, now()) AS left_at, last_seen
			FROM player_sessions WHERE server_id IN (${selected}) AND last_seen >= ${from}
		),
		sess AS (
			SELECT steam_id,
				SUM(EXTRACT(EPOCH FROM (COALESCE(left_at, now()) - GREATEST(joined_at, ${from}::timestamptz)))) / 60 AS minutes,
				SUM(seed_seconds) / 60.0 AS seed_minutes, SUM(cash) AS cash,
				MIN(joined_at) AS first_seen, MAX(last_seen) AS last_seen,
				COUNT(*) AS sessions, BOOL_OR(left_at IS NULL) AS online
			FROM player_sessions WHERE server_id IN (${selected}) AND last_seen >= ${from}
			GROUP BY steam_id
		),
		pre_feed AS (
			SELECT ps.steam_id, SUM(ps.kills) AS kills, SUM(ps.deaths) AS deaths
			FROM player_sessions ps JOIN feed_start fs ON fs.server_id = ps.server_id
			WHERE ps.joined_at >= ${from} AND ps.left_at <= fs.starts_at
			GROUP BY ps.steam_id
		),
		kl AS (
			SELECT killer_steam_id AS steam_id,
				COUNT(*) FILTER (WHERE NOT suicide) AS kills,
				COUNT(*) FILTER (WHERE headshot AND NOT suicide) AS headshots,
				COUNT(*) FILTER (WHERE team_kill) AS team_kills,
				MAX(ts) AS first_kill
			FROM kills WHERE server_id IN (${selected}) AND ts >= ${from} AND killer_steam_id IS NOT NULL
			GROUP BY killer_steam_id
		),
		dt AS (
			SELECT victim_steam_id AS steam_id, COUNT(*) AS deaths,
				COUNT(*) FILTER (WHERE suicide) AS suicides, MAX(ts) AS first_death
			FROM kills WHERE server_id IN (${selected}) AND ts >= ${from} AND victim_steam_id IS NOT NULL
			GROUP BY victim_steam_id
		),
		bounds AS (
			SELECT s.*, a.id AS last_id,
				CASE WHEN p.id IS NOT NULL AND COALESCE(p.ended_at, now()) > s.joined_at THEN p.id ELSE n.id END AS first_id
			FROM s
			LEFT JOIN LATERAL (SELECT id FROM matches m WHERE m.server_id = s.server_id AND m.started_at < s.left_at
				ORDER BY m.started_at DESC LIMIT 1) a ON true
			LEFT JOIN LATERAL (SELECT id, ended_at FROM matches m WHERE m.server_id = s.server_id AND m.started_at <= s.joined_at
				ORDER BY m.started_at DESC LIMIT 1) p ON true
			LEFT JOIN LATERAL (SELECT id FROM matches m WHERE m.server_id = s.server_id AND m.started_at > s.joined_at
				ORDER BY m.started_at LIMIT 1) n ON true
		),
		pairs AS (
			SELECT DISTINCT ON (b.steam_id, m.id) b.steam_id, m.id AS match_id,
				CASE WHEN b.faction IS NULL THEN NULL
					WHEN m.winner IS NOT NULL THEN CASE WHEN m.winner = b.faction THEN 'win' ELSE 'loss' END
					WHEN jsonb_typeof(m.final_scores) = 'array'
						AND (SELECT MAX((e->>'score')::numeric) FROM jsonb_array_elements(m.final_scores) e) > 0 THEN 'draw'
					ELSE NULL END AS result
			FROM bounds b JOIN matches m ON m.server_id = b.server_id AND m.id BETWEEN b.first_id AND b.last_id
			WHERE b.first_id <= b.last_id AND m.started_at >= ${from}
			ORDER BY b.steam_id, m.id, b.last_seen DESC
		),
		mt AS (
			SELECT steam_id, COUNT(*) AS matches,
				COUNT(*) FILTER (WHERE result = 'win') AS wins,
				COUNT(*) FILTER (WHERE result = 'loss') AS losses,
				COUNT(*) FILTER (WHERE result = 'draw') AS draws
			FROM pairs GROUP BY steam_id
		),
		a AS (
			SELECT steam_id,
				COALESCE(sess.minutes, 0) AS minutes, COALESCE(sess.seed_minutes, 0) AS seed_minutes,
				COALESCE(sess.cash, 0) AS cash, sess.first_seen,
				COALESCE(sess.last_seen, kl.first_kill, dt.first_death) AS last_seen,
				COALESCE(sess.sessions, 0) AS sessions, COALESCE(sess.online, false) AS online,
				COALESCE(kl.kills, 0) + COALESCE(pre_feed.kills, 0) AS kills,
				COALESCE(kl.headshots, 0) AS headshots,
				COALESCE(kl.team_kills, 0) AS team_kills,
				COALESCE(dt.deaths, 0) + COALESCE(pre_feed.deaths, 0) AS deaths,
				COALESCE(dt.suicides, 0) AS suicides,
				COALESCE(mt.matches, 0) AS matches, COALESCE(mt.wins, 0) AS wins,
				COALESCE(mt.losses, 0) AS losses, COALESCE(mt.draws, 0) AS draws
			FROM sess FULL JOIN kl USING (steam_id) FULL JOIN dt USING (steam_id)
				FULL JOIN mt USING (steam_id) FULL JOIN pre_feed USING (steam_id)
		)
	`;
}

export function rowToPlayer(row: StatsRow, server: number | null) {
	const kills = finite(row.kills);
	const deaths = finite(row.deaths);
	const minutes = finite(row.minutes);
	const rawCounts = objectNumbers(row.serverCounts);
	const serverCounts: Record<string, number> = {};
	for (const [name, count] of Object.entries(rawCounts)) {
		const match = /#(\d+)/.exec(name);
		serverCounts[match ? `server-${match[1]}` : name] = count;
	}
	const currentServerName = typeof row.currentServer === 'string' ? row.currentServer : null;
	const currentServerMatch = currentServerName ? /#(\d+)/.exec(currentServerName) : null;
	const wins = finite(row.wins), losses = finite(row.losses), draws = finite(row.draws);
	return {
		id: row.steamId, name: row.name || row.steamId, group: 'all', server,
		aliases: stringArray(row.aliases).filter((name) => name !== row.name),
		firstSeen: row.firstSeen ? new Date(row.firstSeen as string | Date).toISOString() : null,
		lastSeen: row.lastSeen ? new Date(row.lastSeen as string | Date).toISOString() : null,
		online: Boolean(row.online),
		currentServer: currentServerMatch ? Number(currentServerMatch[1]) : null,
		currentServerName, currentFaction: row.currentFaction || null,
		currentCash: row.currentCash === null ? null : finite(row.currentCash),
		cash: finite(row.cash), totalKills: kills, totalDeaths: deaths,
		kd: deaths > 0 ? Number((kills / deaths).toFixed(2)) : kills,
		killsPerHour: minutes > 0 ? Number((kills / (minutes / 60)).toFixed(2)) : null,
		headshots: finite(row.headshots), teamKills: finite(row.teamKills), suicides: finite(row.suicides),
		wins, losses, draws, winRate: wins + losses + draws > 0 ? wins / (wins + losses + draws) : null,
		sessionsSeen: finite(row.sessions), matchesSeen: finite(row.matches),
		secondsTracked: Math.round(minutes * 60), seedMinutes: Math.round(finite(row.seedMinutes)),
		factionCounts: objectNumbers(row.factionCounts), serverCounts,
		serversPlayed: stringArray(row.serversPlayed)
	};
}
