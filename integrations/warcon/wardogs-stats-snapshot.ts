// Pure helpers: one bounded snapshot per scope, not one aggregation per page/search/sort.
export function createSnapshotCache<T>(now = Date.now, ttl = 15_000, capacity = 6, concurrency = 2) {
	const entries = new Map<string, { until: number; pending: boolean; value: Promise<T> }>();
	return async (key: string, load: () => Promise<T>): Promise<T> => {
		for (const [k, e] of entries) if (!e.pending && e.until <= now()) entries.delete(k);
		const hit = entries.get(key);
		if (hit) return hit.value;
		if ([...entries.values()].filter(e => e.pending).length >= concurrency) throw new Error('Stats are busy; retry shortly.');
		if (entries.size >= capacity) {
			const victim = [...entries].find(([, e]) => !e.pending);
			if (!victim) throw new Error('Stats are busy; retry shortly.');
			entries.delete(victim[0]);
		}
		const entry: { until: number; pending: boolean; value: Promise<T> } = {
			until: Infinity, pending: true, value: Promise.resolve(null as T)
		};
		entries.set(key, entry);
		entry.value = Promise.resolve().then(load).then(value => {
			entry.pending = false;
			entry.until = now() + ttl;
			return value;
		}, error => { entries.delete(key); throw error; });
		return entry.value;
	};
}

export type Aggregate = Record<string, unknown> & { steam_id: string; name: string | null };
export const METRICS = ['kills', 'deaths', 'kd', 'perHour', 'time', 'playtime', 'seeded', 'matches', 'wins', 'winRate', 'cash', 'lastSeen', 'name'];
const num = (r: Aggregate, key: string) => Number(r[key] ?? 0);
const textOrder = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
export function metricValue(r: Aggregate, metric: string): number | string | null {
	switch (metric) {
		case 'kd': return num(r, 'deaths') > 0 ? num(r, 'kills') / num(r, 'deaths') : num(r, 'kills') > 0 ? num(r, 'kills') : null;
		case 'perHour': return num(r, 'minutes') > 0 ? num(r, 'kills') / (num(r, 'minutes') / 60) : null;
		case 'winRate': { const n = num(r, 'wins') + num(r, 'losses') + num(r, 'draws'); return n > 0 ? num(r, 'wins') / n : null; }
		case 'time': case 'playtime': return num(r, 'minutes');
		case 'seeded': return num(r, 'seed_minutes');
		case 'lastSeen': return r.last_seen == null ? null : new Date(r.last_seen as string).getTime();
		case 'name': return r.name;
		default: return num(r, metric);
	}
}
export function compareRows(metric: string) {
	if (!METRICS.includes(metric)) throw new Error('Invalid leaderboard sort.');
	return (a: Aggregate, b: Aggregate) => {
		// PostgreSQL's collation is authoritative (JS Unicode ordering can differ).
		if (metric === 'name' && a.name_order != null && b.name_order != null)
			return Number(a.name_order) - Number(b.name_order) || textOrder(a.steam_id, b.steam_id);
		const av = metricValue(a, metric), bv = metricValue(b, metric);
		const primary = av == null ? (bv == null ? 0 : 1) : bv == null ? -1
			: metric === 'name' ? textOrder(String(av), String(bv)) : Number(bv) - Number(av);
		if (primary) return primary;
		const secondary = metric === 'kills' ? num(a, 'deaths') - num(b, 'deaths')
			: metric === 'name' || metric === 'lastSeen' ? 0 : num(b, 'kills') - num(a, 'kills');
		return secondary || textOrder(a.steam_id, b.steam_id);
	};
}
export function makeRankings(rows: Aggregate[]) {
	const orders = new Map<string, Aggregate[]>();
	const ranks = new Map<string, Map<string, number>>();
	return {
		ordered(metric: string) {
			if (!orders.has(metric)) orders.set(metric, [...rows].sort(compareRows(metric)));
			return orders.get(metric)!;
		},
		positions(id: string) {
			return Object.fromEntries(['kills', 'kd', 'matches', 'time'].map(metric => {
				if (!ranks.has(metric)) ranks.set(metric, new Map(this.ordered(metric).map((r, i) => [r.steam_id, i + 1])));
				return [metric, { rank: ranks.get(metric)!.get(id) ?? null, total: rows.length }];
			}));
		}
	};
}
