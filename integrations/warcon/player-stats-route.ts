import { timingSafeEqual } from 'node:crypto';
import { env as privateEnv } from '$env/dynamic/private';
import { sql } from 'drizzle-orm';
import { getEnv } from '$lib/server/env';
import { ApiError, apiJson, int, route, str } from '$lib/server/http';

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

function configuredServerRefs(): string[] {
	const explicit = (privateEnv.WARDOGS_STATS_SERVERS || '').trim();
	const legacy = [privateEnv.WARDOGS_STATS_NORMAL_SERVERS || '', privateEnv.WARDOGS_STATS_HARDCORE_SERVERS || '']
		.filter(Boolean).join(',');
	return [...new Set((explicit || legacy).split(',').map((value) => value.trim()).filter(Boolean))];
}

function authorized(request: Request): boolean {
	const expected = (privateEnv.WARDOGS_STATS_API_KEY || '').trim();
	const match = /^Bearer\s+(.+)$/i.exec((request.headers.get('authorization') || '').trim());
	const actual = (match?.[1] || '').trim();
	const a = Buffer.from(expected);
	const b = Buffer.from(actual);
	return expected.length >= 20 && a.length === b.length && timingSafeEqual(a, b);
}

type StatsRow = Record<string, unknown> & {
	steamId: string; name: string | null; aliases: unknown;
	firstSeen: Date | null; lastSeen: Date | null;
	kills: string; deaths: string; headshots: string; teamKills: string; suicides: string;
	matches: string; wins: string; losses: string; draws: string;
	minutes: string; seedMinutes: string; cash: string; sessions: string;
	online: boolean; currentServer: string | null; currentFaction: string | null;
	currentCash: string | null; factionCounts: unknown; serverCounts: unknown; serversPlayed: unknown;
};

// Keep the aggregates and match outcome rule aligned with WARCON's
// $lib/server/leaderboards.ts. The route is installed independently of WARCON releases.
function boardBase(ids: string[], from: Date, feedStarts: Date[]) {
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

function rowToPlayer(row: StatsRow, server: number | null) {
	const kills = finite(row.kills);
	const deaths = finite(row.deaths);
	const minutes = finite(row.minutes);
	const rawCounts = objectNumbers(row.serverCounts);
	const serverCounts: Record<string, number> = {};
	for (const [name, count] of Object.entries(rawCounts)) {
		const match = /#(\d+)/.exec(name);
		serverCounts[match ? `server-${match[1]}` : name] = count;
	}
	const currentServerName = row.currentServer || null;
	const currentServerMatch = currentServerName ? /#(\d+)/.exec(currentServerName) : null;
	const wins = finite(row.wins), losses = finite(row.losses), draws = finite(row.draws);
	return {
		id: row.steamId, name: row.name || row.steamId, group: 'all', server,
		aliases: stringArray(row.aliases).filter((name) => name !== row.name),
		firstSeen: row.firstSeen ? new Date(row.firstSeen).toISOString() : null,
		lastSeen: row.lastSeen ? new Date(row.lastSeen).toISOString() : null,
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

export const GET = route(async (event) => {
	const expected = (privateEnv.WARDOGS_STATS_API_KEY || '').trim();
	if (expected.length < 20) throw new ApiError(503, 'Public stats API is not configured.');
	if (!authorized(event.request)) throw new ApiError(401, 'Unauthorized.');

	const serverValue = event.url.searchParams.get('server');
	if (serverValue !== null && !/^[1-5]$/.test(serverValue)) throw new ApiError(400, 'Server must be 1 to 5.');
	const server = serverValue ? Number(serverValue) : null;
	const refs = configuredServerRefs();
	if (refs.length !== 5) throw new ApiError(503, 'All five WARDOGS servers must be configured.');
	const env = getEnv();
	const resolved = await env.db.execute<{ id: string; name: string }>(sql`
		SELECT id, name FROM servers WHERE id IN (${sqlList(refs)}) OR name IN (${sqlList(refs)})
	`);
	const byId = new Map(resolved.map((row) => [row.id, row]));
	const byName = new Map(resolved.map((row) => [row.name, row]));
	const configured = refs.map((ref) => byId.get(ref) ?? byName.get(ref));
	if (configured.some((row) => !row) || new Set(configured.map((row) => row?.id)).size !== 5) {
		throw new ApiError(503, 'WARDOGS stats server configuration is incomplete.');
	}
	const numbered = [1, 2, 3, 4, 5].map((number) => {
		const found = configured.filter((row) => new RegExp(`#${number}(?!\\d)`).test(row!.name));
		if (found.length !== 1) throw new ApiError(503, `WARDOGS Server #${number} is missing or ambiguous.`);
		return found[0]!;
	});
	const ids = server ? [numbered[server - 1].id] : numbered.map((row) => row.id);
	// These are the first feed.enable audit timestamps on each numbered 44th server.
	// Keep them fixed so later audit-log retention cannot erase historical K/D.
	const feedActivation = [
		'2026-09-19T18:26:43.514Z', '2026-09-19T18:27:02.148Z',
		'2026-09-19T18:27:08.676Z', '2026-09-19T18:27:15.037Z',
		'2026-09-19T18:27:20.663Z'
	];
	const feedStarts = (server ? [server] : [1, 2, 3, 4, 5]).map((number) => new Date(feedActivation[number - 1]));
	const range = event.url.searchParams.get('range') || 'all';
	const durations: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 };
	if (range !== 'all' && !(range in durations)) throw new ApiError(400, 'Invalid leaderboard range.');
	const from = range === 'all' ? new Date(0) : new Date(Date.now() - durations[range] * 86400_000);
	const base = boardBase(ids, from, feedStarts);
	const search = str(event.url.searchParams.get('search'), 80);
	const pattern = `%${search}%`;
	const searchWhere = search ? sql`(a.steam_id ILIKE ${pattern} OR EXISTS (
		SELECT 1 FROM player_sessions x WHERE x.steam_id = a.steam_id AND x.server_id IN (${sqlList(ids)}) AND x.name ILIKE ${pattern}
	))` : sql`true`;
	const sort = str(event.url.searchParams.get('sort') || 'kills', 20);
	const sorts: Record<string, ReturnType<typeof sql>> = {
		kills: sql`a.kills DESC, a.deaths ASC`, deaths: sql`a.deaths DESC, a.kills DESC`,
		kd: sql`(CASE WHEN a.deaths > 0 THEN a.kills::float / a.deaths WHEN a.kills > 0 THEN a.kills::float ELSE NULL END) DESC NULLS LAST, a.kills DESC`,
		perHour: sql`(CASE WHEN a.minutes > 0 THEN a.kills::float / (a.minutes / 60) ELSE NULL END) DESC NULLS LAST, a.kills DESC`,
		time: sql`a.minutes DESC, a.kills DESC`, playtime: sql`a.minutes DESC, a.kills DESC`,
		seeded: sql`a.seed_minutes DESC, a.kills DESC`, matches: sql`a.matches DESC, a.kills DESC`,
		wins: sql`a.wins DESC, a.kills DESC`,
		winRate: sql`(CASE WHEN a.wins + a.losses + a.draws > 0 THEN a.wins::float / (a.wins + a.losses + a.draws) ELSE NULL END) DESC NULLS LAST, a.kills DESC`,
		cash: sql`a.cash DESC, a.kills DESC`, lastSeen: sql`a.last_seen DESC NULLS LAST`,
		name: sql`(SELECT x.name FROM player_sessions x WHERE x.steam_id = a.steam_id AND x.server_id IN (${sqlList(ids)}) ORDER BY x.last_seen DESC LIMIT 1) ASC NULLS LAST`
	};
	if (!(sort in sorts)) throw new ApiError(400, 'Invalid leaderboard sort.');
	const limit = int(event.url.searchParams.get('limit'), 100, 1, 500);
	const offset = int(event.url.searchParams.get('offset'), 0, 0, 100000);

	if (event.url.searchParams.get('leaders') === '1') {
		const leadersRaw = await env.db.execute<StatsRow & { metric: string }>(sql`
			WITH ${base}, eligible AS (SELECT * FROM a WHERE minutes >= 60),
			leaders AS (
				(SELECT 'kills'::text AS metric, * FROM eligible ORDER BY kills DESC, steam_id LIMIT 1)
				UNION ALL (SELECT 'deaths', * FROM eligible ORDER BY deaths DESC, steam_id LIMIT 1)
				UNION ALL (SELECT 'kd', * FROM eligible ORDER BY CASE WHEN deaths > 0 THEN kills::float / deaths WHEN kills > 0 THEN kills::float ELSE NULL END DESC NULLS LAST, kills DESC, steam_id LIMIT 1)
				UNION ALL (SELECT 'perHour', * FROM eligible ORDER BY CASE WHEN minutes > 0 THEN kills::float / (minutes / 60) ELSE NULL END DESC NULLS LAST, kills DESC, steam_id LIMIT 1)
				UNION ALL (SELECT 'time', * FROM eligible ORDER BY minutes DESC, kills DESC, steam_id LIMIT 1)
				UNION ALL (SELECT 'seeded', * FROM eligible WHERE seed_minutes > 0 ORDER BY seed_minutes DESC, kills DESC, steam_id LIMIT 1)
				UNION ALL (SELECT 'matches', * FROM eligible ORDER BY matches DESC, kills DESC, steam_id LIMIT 1)
				UNION ALL (SELECT 'wins', * FROM eligible ORDER BY wins DESC, kills DESC, steam_id LIMIT 1)
				UNION ALL (SELECT 'winRate', * FROM eligible ORDER BY CASE WHEN wins + losses + draws > 0 THEN wins::float / (wins + losses + draws) ELSE NULL END DESC NULLS LAST, kills DESC, steam_id LIMIT 1)
				UNION ALL (SELECT 'cash', * FROM eligible ORDER BY cash DESC, kills DESC, steam_id LIMIT 1)
			)
			SELECT l.metric, l.steam_id AS "steamId", l.kills, l.deaths, l.headshots AS "headshots",
				l.team_kills AS "teamKills", l.suicides, l.matches, l.wins, l.losses, l.draws,
				l.minutes, l.seed_minutes AS "seedMinutes", l.cash,
				(SELECT x.name FROM player_sessions x WHERE x.steam_id = l.steam_id AND x.server_id IN (${sqlList(ids)}) ORDER BY x.last_seen DESC LIMIT 1) AS name
			FROM leaders l
		`);
		const leaders: Record<string, unknown> = {};
		for (const row of leadersRaw) {
			const player = rowToPlayer(row, server);
			leaders[row.metric] = { ...player, totalKills: player.totalKills, totalDeaths: player.totalDeaths };
		}
		return apiJson({ group: 'all', server, range, leaders, source: 'warcon-leaderboard', generatedAt: new Date().toISOString() });
	}

	const rows = await env.db.execute<StatsRow>(sql`
		WITH ${base}, page AS (
			SELECT * FROM a WHERE ${searchWhere} ORDER BY ${sorts[sort]}, a.steam_id LIMIT ${limit} OFFSET ${offset}
		)
		SELECT a.steam_id AS "steamId", a.first_seen AS "firstSeen", a.last_seen AS "lastSeen",
			a.kills, a.deaths, a.headshots, a.team_kills AS "teamKills", a.suicides,
			a.matches, a.wins, a.losses, a.draws, a.minutes, a.seed_minutes AS "seedMinutes", a.cash,
			a.sessions, a.online,
			(SELECT x.name FROM player_sessions x WHERE x.steam_id = a.steam_id AND x.server_id IN (${sqlList(ids)}) ORDER BY x.last_seen DESC LIMIT 1) AS name,
			COALESCE((SELECT json_agg(n.name ORDER BY n.last_seen DESC) FROM (
				SELECT x.name, MAX(x.last_seen) AS last_seen FROM player_sessions x
				WHERE x.steam_id = a.steam_id AND x.server_id IN (${sqlList(ids)})
				GROUP BY x.name ORDER BY last_seen DESC LIMIT 10
			) n), '[]'::json) AS aliases,
			(SELECT srv.name FROM player_sessions x JOIN servers srv ON srv.id = x.server_id
				WHERE x.steam_id = a.steam_id AND x.server_id IN (${sqlList(ids)}) AND x.left_at IS NULL ORDER BY x.last_seen DESC LIMIT 1) AS "currentServer",
			(SELECT x.faction FROM player_sessions x WHERE x.steam_id = a.steam_id AND x.server_id IN (${sqlList(ids)}) AND x.left_at IS NULL ORDER BY x.last_seen DESC LIMIT 1) AS "currentFaction",
			(SELECT x.cash FROM player_sessions x WHERE x.steam_id = a.steam_id AND x.server_id IN (${sqlList(ids)}) AND x.left_at IS NULL ORDER BY x.last_seen DESC LIMIT 1) AS "currentCash",
			COALESCE((SELECT json_object_agg(f.faction, f.n) FROM (
				SELECT COALESCE(NULLIF(x.faction, ''), 'Unknown') AS faction, COUNT(*) AS n FROM player_sessions x
				WHERE x.steam_id = a.steam_id AND x.server_id IN (${sqlList(ids)}) GROUP BY 1
			) f), '{}'::json) AS "factionCounts",
			COALESCE((SELECT json_object_agg(sc.name, sc.n) FROM (
				SELECT srv.name, COUNT(*) AS n FROM player_sessions x JOIN servers srv ON srv.id = x.server_id
				WHERE x.steam_id = a.steam_id AND x.server_id IN (${sqlList(ids)}) GROUP BY srv.name
			) sc), '{}'::json) AS "serverCounts",
			COALESCE((SELECT json_agg(sp.name ORDER BY sp.name) FROM (
				SELECT DISTINCT srv.name FROM player_sessions x JOIN servers srv ON srv.id = x.server_id
				WHERE x.steam_id = a.steam_id AND x.server_id IN (${sqlList(ids)})
			) sp), '[]'::json) AS "serversPlayed"
		FROM page a
	`);
	const [countRow] = await env.db.execute<{ total: string }>(sql`
		WITH player_ids AS (
			SELECT steam_id FROM player_sessions WHERE server_id IN (${sqlList(ids)}) AND last_seen >= ${from}
			UNION SELECT killer_steam_id FROM kills WHERE server_id IN (${sqlList(ids)}) AND ts >= ${from} AND killer_steam_id IS NOT NULL
			UNION SELECT victim_steam_id FROM kills WHERE server_id IN (${sqlList(ids)}) AND ts >= ${from} AND victim_steam_id IS NOT NULL
		)
		SELECT COUNT(*) AS total FROM player_ids a WHERE ${searchWhere}
	`);
	const [summary] = await env.db.execute<{
		trackedPlayers: string; onlinePlayers: string; totalKills: string; totalDeaths: string;
		secondsTracked: string; updatedAt: Date | null;
	}>(sql`
		WITH players AS (
			SELECT steam_id FROM player_sessions WHERE server_id IN (${sqlList(ids)}) AND last_seen >= ${from}
			UNION SELECT killer_steam_id FROM kills WHERE server_id IN (${sqlList(ids)}) AND ts >= ${from} AND killer_steam_id IS NOT NULL
			UNION SELECT victim_steam_id FROM kills WHERE server_id IN (${sqlList(ids)}) AND ts >= ${from} AND victim_steam_id IS NOT NULL
		), sessions AS (
			SELECT COUNT(DISTINCT steam_id) FILTER (WHERE left_at IS NULL) AS online_players,
				COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(left_at, now()) - GREATEST(joined_at, ${from}::timestamptz)))), 0) AS seconds_tracked,
				MAX(last_seen) AS updated_at
			FROM player_sessions WHERE server_id IN (${sqlList(ids)}) AND last_seen >= ${from}
		), feed AS (
			SELECT COUNT(*) FILTER (WHERE NOT suicide AND killer_steam_id IS NOT NULL) AS kills,
				COUNT(*) FILTER (WHERE victim_steam_id IS NOT NULL) AS deaths
			FROM kills WHERE server_id IN (${sqlList(ids)}) AND ts >= ${from}
		), pre_feed AS (
			SELECT COALESCE(SUM(ps.kills), 0) AS kills, COALESCE(SUM(ps.deaths), 0) AS deaths
			FROM player_sessions ps JOIN (VALUES ${feedStartValues(ids, feedStarts)})
				AS fs(server_id, starts_at) ON fs.server_id = ps.server_id
			WHERE ps.joined_at >= ${from} AND ps.left_at <= fs.starts_at
		)
		SELECT (SELECT COUNT(*) FROM players) AS "trackedPlayers", sessions.online_players AS "onlinePlayers",
			COALESCE(feed.kills, 0) + pre_feed.kills AS "totalKills",
			COALESCE(feed.deaths, 0) + pre_feed.deaths AS "totalDeaths",
			sessions.seconds_tracked AS "secondsTracked", sessions.updated_at AS "updatedAt"
		FROM sessions CROSS JOIN feed CROSS JOIN pre_feed
	`);
	return apiJson({
		group: 'all', server, range, total: finite(countRow?.total),
		players: rows.map((row) => rowToPlayer(row, server)),
		summary: {
			group: 'all', cashAvailable: true,
			trackedPlayers: finite(summary?.trackedPlayers), onlinePlayers: finite(summary?.onlinePlayers),
			totalKillsRecorded: finite(summary?.totalKills), totalDeathsRecorded: finite(summary?.totalDeaths),
			secondsTracked: finite(summary?.secondsTracked),
			updatedAt: summary?.updatedAt ? new Date(summary.updatedAt).toISOString() : null
		},
		source: 'warcon-leaderboard', generatedAt: new Date().toISOString()
	});
});
