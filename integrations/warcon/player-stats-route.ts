import { timingSafeEqual } from 'node:crypto';
import { env as privateEnv } from '$env/dynamic/private';
import { sql } from 'drizzle-orm';
import { getEnv } from '$lib/server/env';
import { ApiError, apiJson, int, route, str } from '$lib/server/http';
import { createStatsResponseCache } from '$lib/server/stats-response-cache';
import { boardBase, rowToPlayer, type StatsRow } from '$lib/server/wardogs-stats-base';
import { createSnapshotCache, makeRankings, METRICS, type Aggregate } from '$lib/server/wardogs-stats-snapshot';
import { orgSeasons, pickable, resolveWindow, seasonWindow } from '$lib/server/seasons';
import { loadCareer, rangeBase, seasonBase } from '$lib/server/leaderboards';
const finite = (v: unknown) => Number.isFinite(Number(v)) ? Number(v) : 0;
const sqlList = (v: string[]) => sql.join(v.map(x => sql`${x}`), sql`, `);
const feedStartValues = (ids: string[], dates: Date[]) => sql.join(ids.map((id, i) => sql`(${id}, ${dates[i]}::timestamptz)`), sql`, `);
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


type Snapshot = {
	rows: Aggregate[]; rankings: ReturnType<typeof makeRankings>; summary: Record<string, unknown>; at: string;
	pages: (key: string, load: () => Promise<StatsRow[]>) => Promise<StatsRow[]>;
};
const snapshots = createSnapshotCache<Snapshot>();
const careers = createSnapshotCache<Awaited<ReturnType<typeof loadCareer>>>(Date.now, 30_000, 24, 2);
const uncachedGET = route(async (event) => {
	if (!(privateEnv.WARDOGS_STATS_API_KEY || '').trim()) throw new ApiError(503, 'Public stats API is not configured.');
	if (!authorized(event.request)) throw new ApiError(401, 'Unauthorized.');
	const serverValue = event.url.searchParams.get('server');
	if (serverValue !== null && !/^[1-5]$/.test(serverValue)) throw new ApiError(400, 'Server must be 1 to 5.');
	const server = serverValue ? Number(serverValue) : null;
	const refs = configuredServerRefs();
	if (refs.length !== 5) throw new ApiError(503, 'All five WARDOGS servers must be configured.');
	const env = getEnv();
	const resolved = await env.db.execute<{ id: string; name: string; orgId: string }>(sql`
		SELECT id, name, org_id AS "orgId" FROM servers WHERE id IN (${sqlList(refs)}) OR name IN (${sqlList(refs)})
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


	const orgIds = [...new Set(numbered.map(row => row.orgId))];
	if (orgIds.length !== 1) throw new ApiError(503, 'Stats servers must belong to one organisation.');
	const organisationSeasons = await orgSeasons(env, orgIds[0]);
	const seasons = pickable(organisationSeasons);
	const currentWindow = resolveWindow('current', organisationSeasons);
	const head = { group: 'all', server, source: 'warcon-leaderboard', version: 2 };
	if (event.url.searchParams.get('meta') === '1') return apiJson({ ...head, seasons, defaultRange: currentWindow.range, currentSeason: currentWindow.season });
	const careerId = event.url.searchParams.get('career');
	if (careerId !== null) {
		if (!/^\d{17}$/.test(careerId)) throw new ApiError(400, 'Invalid Steam ID.');
		let career;
		try {
			career = await careers(JSON.stringify([ids, careerId]), () => loadCareer(env, {
				serverId: ids[0], orgId: orgIds[0], ids, nameOf: new Map(numbered.map(r => [r.id, r.name])), steamId: careerId
			}));
		} catch { throw new ApiError(503, 'Career details are temporarily unavailable.'); }
		// Explicit public allowlist, never the administrative player dossier.
		return apiJson({ ...head, playerId: careerId, career: {
			basis: 'completed-matches', period: 'all', matches: career.matches,
			vehicleKills: career.vehicleKills, longestM: career.longestM, killStreak: career.killStreak,
			streak: career.streak, maps: career.maps, factions: career.factions, last: career.last
		}});
	}
	const range = event.url.searchParams.get('range') || 'current';
	const resolvedRange = range === 'current' ? currentWindow.range : range;
	const durations: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 };
	const season = seasons.find(s => `s:${s.key}` === resolvedRange);
	if (resolvedRange !== 'all' && !(resolvedRange in durations) && !season) throw new ApiError(400, 'Invalid or not-yet-started period.');
	const from = season ? new Date(season.startsAt) : resolvedRange === 'all' ? new Date(0) : new Date(Date.now() - durations[resolvedRange] * 86400_000);
	const sort = str(event.url.searchParams.get('sort') || 'kills', 20);
	if (!METRICS.includes(sort)) throw new ApiError(400, 'Invalid leaderboard sort.');
	const playerId = event.url.searchParams.get('player');
	if (playerId !== null && !/^\d{17}$/.test(playerId)) throw new ApiError(400, 'Invalid Steam ID.');
	const search = str(event.url.searchParams.get('search'), 80);
	const limit = int(event.url.searchParams.get('limit'), 100, 1, 500);
	const offset = int(event.url.searchParams.get('offset'), 0, 0, 100000);
	const key = JSON.stringify([ids, resolvedRange, season?.startsAt, season?.endsAt, feedStarts]);
	let snapshot: Snapshot;
	try {
		snapshot = await snapshots(key, async () => {
			// Existing periods retain historical/feed totals. Seasons use labelled native match totals.
			const win = season ? seasonWindow(season) : null;
			const base = win ? sql`${win.to ? seasonBase(ids, win.from!, win.to) : rangeBase(ids, win.from!)},
				a AS (SELECT *, NULL::timestamptz AS first_seen, 0::bigint AS sessions, false AS online FROM base)`
				: boardBase(ids, from, feedStarts);
			const rows = (await env.db.execute<Aggregate>(sql`
				WITH ${base}, names AS (
					SELECT DISTINCT ON (steam_id) steam_id, name FROM player_sessions
					WHERE server_id IN (${sqlList(ids)}) ORDER BY steam_id, last_seen DESC, id DESC
				) SELECT a.*, names.name, DENSE_RANK() OVER (ORDER BY names.name ASC NULLS LAST) AS name_order
				FROM a LEFT JOIN names USING (steam_id)
			`)) as Aggregate[];
			let summary: Record<string, unknown>;
			if (!season) {
				const [legacySummary] = await env.db.execute<Record<string, unknown>>(sql`
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
				summary = legacySummary;
			} else {
				const [online] = await env.db.execute<{ n: string }>(sql`SELECT COUNT(DISTINCT steam_id) AS n FROM player_sessions WHERE server_id IN (${sqlList(ids)}) AND left_at IS NULL`);
				summary = { trackedPlayers: rows.length, onlinePlayers: finite(online?.n),
					totalKills: rows.reduce((n, r) => n + finite(r.kills), 0),
					totalDeaths: rows.reduce((n, r) => n + finite(r.deaths), 0),
					secondsTracked: rows.reduce((n, r) => n + finite(r.minutes) * 60, 0), updatedAt: null };
			}
			return { rows, summary, rankings: makeRankings(rows), at: new Date().toISOString(),
				pages: createSnapshotCache<StatsRow[]>(Date.now, 15_000, 24, 4) };
		});
	} catch { throw new ApiError(503, 'Stats are busy or temporarily unavailable; retry shortly.'); }
	const common = { ...head, range, resolvedRange, season: season || null, seasons, snapshotAt: snapshot.at,
		basis: season ? 'completed-matches' : 'historical-sessions-and-feed', generatedAt: new Date().toISOString() };
	const mapBasic = (r: Aggregate) => rowToPlayer({
		...r, steamId: r.steam_id, firstSeen: r.first_seen, lastSeen: r.last_seen,
		teamKills: r.team_kills, seedMinutes: r.seed_minutes
	} as StatsRow, server);
	if (event.url.searchParams.get('leaders') === '1') {
		const leaders = Object.fromEntries(['kills', 'deaths', 'kd', 'perHour', 'time', 'seeded', 'matches', 'wins', 'winRate', 'cash'].map(metric => {
			const r = snapshot.rankings.ordered(metric).find(r => finite(r.minutes) >= 60 && (metric !== 'seeded' || finite(r.seed_minutes) > 0));
			return [metric, r ? mapBasic(r) : null];
		}));
		return apiJson({ ...common, leaders });
	}
	let ordered = snapshot.rankings.ordered(sort);
	if (playerId) ordered = ordered.filter(r => r.steam_id === playerId);
	else if (search) {
		const pattern = `%${search}%`;
		const matches = await env.db.execute<{ steam_id: string }>(sql`
			SELECT DISTINCT steam_id FROM player_sessions
			WHERE server_id IN (${sqlList(ids)}) AND name ILIKE ${pattern}
			UNION SELECT steam_id FROM player_sessions WHERE server_id IN (${sqlList(ids)}) AND steam_id ILIKE ${pattern}
			UNION SELECT killer_steam_id FROM kills WHERE server_id IN (${sqlList(ids)}) AND killer_steam_id ILIKE ${pattern}
			UNION SELECT victim_steam_id FROM kills WHERE server_id IN (${sqlList(ids)}) AND victim_steam_id ILIKE ${pattern}
		`);
		const found = new Set(matches.map(r => r.steam_id));
		ordered = ordered.filter(r => found.has(r.steam_id));
	}
	const selected = ordered.slice(playerId ? 0 : offset, playerId ? 1 : offset + limit);
	// Enrich only the page, not every player or a 500-player comparison sample.
	const rows = selected.length ? await snapshot.pages(JSON.stringify(selected.map(r => r.steam_id)), async () => (await env.db.execute<StatsRow>(sql`
		WITH page AS (
			SELECT * FROM jsonb_to_recordset(${JSON.stringify(selected)}::text::jsonb) AS p(
				steam_id text, first_seen timestamptz, last_seen timestamptz, kills numeric, deaths numeric,
				headshots numeric, team_kills numeric, suicides numeric, matches numeric, wins numeric,
				losses numeric, draws numeric, minutes numeric, seed_minutes numeric, cash numeric,
				sessions bigint, online boolean)
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
	`)) as StatsRow[]) : [];
	const enriched = new Map(rows.map(r => [r.steamId, rowToPlayer(r, server)]));
	const s = snapshot.summary;
	return apiJson({ ...common, total: ordered.length,
		players: selected.map(r => ({ ...enriched.get(r.steam_id)!,
			online: season ? Boolean(enriched.get(r.steam_id)?.currentServerName) : Boolean(r.online),
			name: r.name || r.steam_id, ranks: playerId ? snapshot.rankings.positions(r.steam_id) : undefined })),
		summary: { group: 'all', cashAvailable: true, trackedPlayers: finite(s.trackedPlayers),
			onlinePlayers: finite(s.onlinePlayers), totalKillsRecorded: finite(s.totalKills),
			totalDeathsRecorded: finite(s.totalDeaths), secondsTracked: finite(s.secondsTracked),
			updatedAt: s.updatedAt ? new Date(s.updatedAt as string).toISOString() : null }
	});
});

// Preserve the original process-wide four-request bound and in-flight coalescing.
// Completed responses are not cached here: their lifetime belongs to the snapshot,
// so stacking two TTLs cannot accidentally double the promised freshness window.
const inFlight = createStatsResponseCache(Date.now, 0, 24, 4);
export const GET: typeof uncachedGET = async event => {
	if (!authorized(event.request)) return uncachedGET(event);
	const key = JSON.stringify([configuredServerRefs(), ...['server', 'range', 'search', 'sort', 'limit', 'offset', 'leaders', 'player', 'career', 'meta']
		.map(name => event.url.searchParams.get(name))]);
	return inFlight(key, async () => uncachedGET(event));
};
