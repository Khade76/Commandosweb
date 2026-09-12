import { timingSafeEqual } from 'node:crypto';
import { env as privateEnv } from '$env/dynamic/private';
import { sql } from 'drizzle-orm';
import { getEnv } from '$lib/server/env';
import { ApiError, apiJson, int, route, str } from '$lib/server/http';

const GROUPS = ['normal', 'hardcore'] as const;
type StatsGroup = (typeof GROUPS)[number];

function bearerToken(request: Request): string {
	const value = request.headers.get('authorization') || '';
	const match = /^Bearer\s+(.+)$/i.exec(value.trim());
	return match?.[1]?.trim() || '';
}

function secretMatches(expected: string, actual: string): boolean {
	const a = Buffer.from(expected);
	const b = Buffer.from(actual);
	return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

function groupFrom(value: string | null): StatsGroup {
	return value === 'hardcore' ? 'hardcore' : 'normal';
}

/**
 * All 44th servers participate in both stats groups. The ruleset is resolved from WARCON's
 * match history, not from a fixed server number. The old NORMAL/HARDCORE variables remain as a
 * migration fallback so an existing deployment keeps working until WARDOGS_STATS_SERVERS is set.
 */
function configuredServerRefs(): string[] {
	const explicit = (privateEnv.WARDOGS_STATS_SERVERS || '').trim();
	const legacy = [
		privateEnv.WARDOGS_STATS_NORMAL_SERVERS || '',
		privateEnv.WARDOGS_STATS_HARDCORE_SERVERS || ''
	]
		.filter(Boolean)
		.join(',');

	return [...new Set((explicit || legacy)
		.split(',')
		.map((value) => value.trim())
		.filter(Boolean))];
}

function finite(value: unknown): number {
	const n = Number(value ?? 0);
	return Number.isFinite(n) ? n : 0;
}

function objectNumbers(value: unknown): Record<string, number> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
	return Object.fromEntries(
		Object.entries(value as Record<string, unknown>).map(([key, count]) => [key, finite(count)])
	);
}

function stringArray(value: unknown): string[] {
	return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

export const GET = route(async (event) => {
	const expected = (privateEnv.WARDOGS_STATS_API_KEY || '').trim();
	if (expected.length < 20) throw new ApiError(503, 'Public stats API is not configured.');
	if (!secretMatches(expected, bearerToken(event.request))) throw new ApiError(401, 'Unauthorized.');

	const env = getEnv();
	const group = groupFrom(event.url.searchParams.get('group'));
	const refs = configuredServerRefs();
	if (!refs.length) throw new ApiError(503, 'No WARDOGS servers are configured for public stats.');

	const serverRows = await env.db.execute<{ id: string; name: string }>(sql`
		SELECT id, name FROM servers WHERE id IN ${refs} OR name IN ${refs}
	`);
	const byId = new Map(serverRows.map((server) => [server.id, server]));
	const byName = new Map(serverRows.map((server) => [server.name, server]));
	const resolved = refs.map((ref) => byId.get(ref) ?? byName.get(ref)).filter(Boolean) as {
		id: string;
		name: string;
	}[];
	const serverIds = [...new Set(resolved.map((server) => server.id))];
	if (!serverIds.length || serverIds.length !== refs.length) {
		const found = new Set(resolved.flatMap((server) => [server.id, server.name]));
		const missing = refs.filter((ref) => !found.has(ref));
		throw new ApiError(503, `Unknown public stats server reference(s): ${missing.join(', ')}`);
	}

	const search = str(event.url.searchParams.get('search'), 80);
	const pattern = `%${search}%`;
	const sort = str(event.url.searchParams.get('sort') || 'kills', 20);
	const limit = int(event.url.searchParams.get('limit'), 100, 1, 500);
	const offset = int(event.url.searchParams.get('offset'), 0, 0, 100000);

	const searchFilter = search
		? sql`(s.steam_id ILIKE ${pattern} OR EXISTS (
			SELECT 1 FROM scoped names
			WHERE names.steam_id = s.steam_id AND names.name ILIKE ${pattern}
		))`
		: sql`true`;

	const orderBy =
		sort === 'deaths'
			? sql`a.total_deaths DESC, a.total_kills DESC`
			: sort === 'kd'
				? sql`(CASE WHEN a.total_deaths > 0 THEN a.total_kills::numeric / a.total_deaths ELSE a.total_kills END) DESC, a.total_kills DESC`
				: sort === 'time'
					? sql`a.seconds_tracked DESC`
					: sort === 'matches'
						? sql`a.sessions DESC`
						: sort === 'lastSeen'
							? sql`a.last_seen DESC`
							: sort === 'name'
								? sql`name ASC`
								: sql`a.total_kills DESC, a.total_deaths ASC`;

	// A session belongs to the ruleset of the WARCON match active when that session began.
	// apply-ruleset-session-splits.py makes a new session whenever the live ruleset flips, so a
	// player who stays connected across Standard -> Hardcore does not move their earlier totals.
	const classifiedSessions = sql`
		SELECT
			ps.*,
			srv.name AS server_name,
			CASE
				WHEN LOWER(COALESCE(match_at_join.map, '')) LIKE '%hardcore%'
					OR LOWER(COALESCE(match_at_join.experiences, '')) LIKE '%hardcore%'
				THEN 'hardcore'
				ELSE 'normal'
			END AS stats_group
		FROM player_sessions ps
		INNER JOIN servers srv ON srv.id = ps.server_id
		LEFT JOIN LATERAL (
			SELECT m.map, m.experiences
			FROM matches m
			WHERE m.server_id = ps.server_id
				AND m.started_at <= ps.joined_at
				AND COALESCE(m.ended_at, 'infinity'::timestamptz) >= ps.joined_at
			ORDER BY m.started_at DESC
			LIMIT 1
		) match_at_join ON true
		WHERE ps.server_id IN ${serverIds}
	`;

	const matchGroupFilter =
		group === 'hardcore'
			? sql`(
				LOWER(COALESCE(m.map, '')) LIKE '%hardcore%'
				OR LOWER(COALESCE(m.experiences, '')) LIKE '%hardcore%'
			)`
			: sql`NOT (
				LOWER(COALESCE(m.map, '')) LIKE '%hardcore%'
				OR LOWER(COALESCE(m.experiences, '')) LIKE '%hardcore%'
			)`;

	const rows = await env.db.execute<{
		steamId: string;
		name: string;
		aliases: unknown;
		firstSeen: Date;
		lastSeen: Date;
		totalKills: string | number;
		totalDeaths: string | number;
		sessions: string | number;
		secondsTracked: string | number;
		matchesSeen: string | number;
		online: boolean;
		currentServer: string | null;
		currentFaction: string | null;
		currentCash: string | number | null;
		factionCounts: unknown;
		serverCounts: unknown;
		serversPlayed: unknown;
	}>(sql`
		WITH classified AS (${classifiedSessions}),
		scoped AS (
			SELECT * FROM classified WHERE stats_group = ${group}
		),
		player_matches AS (
			SELECT ps.steam_id, COUNT(DISTINCT m.id)::bigint AS matches_seen
			FROM scoped ps
			INNER JOIN matches m
				ON m.server_id = ps.server_id
				AND m.started_at <= COALESCE(ps.left_at, now())
				AND COALESCE(m.ended_at, now()) >= ps.joined_at
				AND ${matchGroupFilter}
			GROUP BY ps.steam_id
		),
		a AS (
			SELECT
				s.steam_id,
				MIN(s.joined_at) AS first_seen,
				MAX(s.last_seen) AS last_seen,
				SUM(s.kills)::bigint AS total_kills,
				SUM(s.deaths)::bigint AS total_deaths,
				COUNT(*)::bigint AS sessions,
				SUM(EXTRACT(EPOCH FROM (COALESCE(s.left_at, now()) - s.joined_at)))::bigint AS seconds_tracked,
				BOOL_OR(s.left_at IS NULL) AS online
			FROM scoped s
			WHERE ${searchFilter}
			GROUP BY s.steam_id
		)
		SELECT
			a.steam_id AS "steamId",
			(SELECT x.name FROM scoped x WHERE x.steam_id = a.steam_id ORDER BY x.last_seen DESC LIMIT 1) AS name,
			COALESCE((
				SELECT json_agg(n.name ORDER BY n.last_seen DESC)
				FROM (
					SELECT x.name, MAX(x.last_seen) AS last_seen
					FROM scoped x WHERE x.steam_id = a.steam_id
					GROUP BY x.name ORDER BY last_seen DESC LIMIT 10
				) n
			), '[]'::json) AS aliases,
			a.first_seen AS "firstSeen",
			a.last_seen AS "lastSeen",
			a.total_kills AS "totalKills",
			a.total_deaths AS "totalDeaths",
			a.sessions,
			a.seconds_tracked AS "secondsTracked",
			COALESCE(pm.matches_seen, 0)::bigint AS "matchesSeen",
			a.online,
			(SELECT x.server_name FROM scoped x WHERE x.steam_id = a.steam_id AND x.left_at IS NULL ORDER BY x.last_seen DESC LIMIT 1) AS "currentServer",
			(SELECT x.faction FROM scoped x WHERE x.steam_id = a.steam_id AND x.left_at IS NULL ORDER BY x.last_seen DESC LIMIT 1) AS "currentFaction",
			(SELECT x.cash FROM scoped x WHERE x.steam_id = a.steam_id AND x.left_at IS NULL ORDER BY x.last_seen DESC LIMIT 1) AS "currentCash",
			COALESCE((
				SELECT json_object_agg(f.faction, f.n)
				FROM (
					SELECT COALESCE(NULLIF(x.faction, ''), 'Unknown') AS faction, COUNT(*)::bigint AS n
					FROM scoped x WHERE x.steam_id = a.steam_id
					GROUP BY COALESCE(NULLIF(x.faction, ''), 'Unknown')
				) f
			), '{}'::json) AS "factionCounts",
			COALESCE((
				SELECT json_object_agg(sc.server_name, sc.n)
				FROM (
					SELECT x.server_name, COUNT(*)::bigint AS n
					FROM scoped x WHERE x.steam_id = a.steam_id
					GROUP BY x.server_name
				) sc
			), '{}'::json) AS "serverCounts",
			COALESCE((
				SELECT json_agg(sp.server_name ORDER BY sp.server_name)
				FROM (
					SELECT DISTINCT x.server_name FROM scoped x WHERE x.steam_id = a.steam_id
				) sp
			), '[]'::json) AS "serversPlayed"
		FROM a
		LEFT JOIN player_matches pm ON pm.steam_id = a.steam_id
		ORDER BY ${orderBy}
		LIMIT ${limit} OFFSET ${offset}
	`);

	const [countRow] = await env.db.execute<{ total: string | number }>(sql`
		WITH classified AS (${classifiedSessions}),
		scoped AS (SELECT * FROM classified WHERE stats_group = ${group})
		SELECT COUNT(DISTINCT s.steam_id)::bigint AS total
		FROM scoped s
		WHERE ${searchFilter}
	`);

	const [summaryRow] = await env.db.execute<{
		trackedPlayers: string | number;
		onlinePlayers: string | number;
		totalKills: string | number;
		totalDeaths: string | number;
		secondsTracked: string | number;
		updatedAt: Date | null;
	}>(sql`
		WITH classified AS (${classifiedSessions}),
		scoped AS (SELECT * FROM classified WHERE stats_group = ${group})
		SELECT
			COUNT(DISTINCT steam_id)::bigint AS "trackedPlayers",
			COUNT(DISTINCT steam_id) FILTER (WHERE left_at IS NULL)::bigint AS "onlinePlayers",
			COALESCE(SUM(kills), 0)::bigint AS "totalKills",
			COALESCE(SUM(deaths), 0)::bigint AS "totalDeaths",
			COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(left_at, now()) - joined_at))), 0)::bigint AS "secondsTracked",
			MAX(last_seen) AS "updatedAt"
		FROM scoped
	`);

	const players = rows.map((row) => {
		const kills = finite(row.totalKills);
		const deaths = finite(row.totalDeaths);
		const sessions = finite(row.sessions);
		const rawServerCounts = objectNumbers(row.serverCounts);
		const serverCounts: Record<string, number> = {};
		for (const [name, count] of Object.entries(rawServerCounts)) {
			const match = /#(\d+)/.exec(name);
			serverCounts[match ? `server-${match[1]}` : name] = count;
		}
		const currentServerName = row.currentServer || null;
		const currentServerMatch = currentServerName ? /#(\d+)/.exec(currentServerName) : null;
		return {
			id: row.steamId,
			name: row.name || row.steamId,
			aliases: stringArray(row.aliases).filter((name) => name !== row.name),
			group,
			firstSeen: row.firstSeen?.toISOString?.() ?? new Date(row.firstSeen).toISOString(),
			lastSeen: row.lastSeen?.toISOString?.() ?? new Date(row.lastSeen).toISOString(),
			online: Boolean(row.online),
			currentServer: currentServerMatch ? Number(currentServerMatch[1]) : null,
			currentServerName,
			currentFaction: row.currentFaction || null,
			currentCash: row.currentCash === null ? null : finite(row.currentCash),
			totalKills: kills,
			totalDeaths: deaths,
			kd: deaths > 0 ? Number((kills / deaths).toFixed(2)) : kills,
			sessionsSeen: sessions,
			matchesSeen: finite(row.matchesSeen),
			secondsTracked: finite(row.secondsTracked),
			factionCounts: objectNumbers(row.factionCounts),
			serverCounts,
			serversPlayed: stringArray(row.serversPlayed),
			peakKillsInMatch: null
		};
	});

	const summary = summaryRow ?? {
		trackedPlayers: 0,
		onlinePlayers: 0,
		totalKills: 0,
		totalDeaths: 0,
		secondsTracked: 0,
		updatedAt: null
	};

	return apiJson({
		group,
		total: finite(countRow?.total),
		players,
		summary: {
			group,
			trackedPlayers: finite(summary.trackedPlayers),
			onlinePlayers: finite(summary.onlinePlayers),
			totalKillsRecorded: finite(summary.totalKills),
			totalDeathsRecorded: finite(summary.totalDeaths),
			secondsTracked: finite(summary.secondsTracked),
			updatedAt: summary.updatedAt ? new Date(summary.updatedAt).toISOString() : null
		},
		source: 'warcon',
		generatedAt: new Date().toISOString()
	});
});
