// Keep query values aligned with the existing OVH/WARCON read-only stats API.
export const SORT_OPTIONS = [
  ['kills', 'Kills'], ['kd', 'K/D'], ['perHour', 'Kills per hour'],
  ['deaths', 'Deaths'], ['cash', 'Cash'], ['time', 'Playtime'],
  ['seeded', 'Seed time'], ['matches', 'Matches'], ['wins', 'Wins'],
  ['winRate', 'Win rate'], ['lastSeen', 'Last seen'], ['name', 'Name A–Z'],
]
export const PERIOD_OPTIONS = [
  ['all', 'All time'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['90d', 'Last 90 days'],
]
export const PAGE_SIZES = [25, 50, 100]

export function statsParams({ search = '', sort = 'kills', range = 'all', server = '', limit = 25, offset = 0, leaders = false } = {}) {
  const params = new URLSearchParams({
    group: 'all',
    range: PERIOD_OPTIONS.some(([key]) => key === range) ? range : 'all',
    sort: SORT_OPTIONS.some(([key]) => key === sort) ? sort : 'kills',
    limit: String(Math.min(500, Math.max(1, Math.floor(Number(limit) || 25)))),
    offset: String(Math.min(100000, Math.max(0, Math.floor(Number(offset) || 0)))),
  })
  const query = String(search).trim().slice(0, 80)
  if (query) params.set('search', query)
  if (/^[1-5]$/.test(String(server))) params.set('server', String(server))
  if (leaders) params.set('leaders', '1')
  return params
}

export function pageInfo(total, page, pageSize) {
  const count = Math.max(0, Math.floor(Number(total) || 0))
  const size = PAGE_SIZES.includes(Number(pageSize)) ? Number(pageSize) : 25
  // Match the API's maximum offset rather than requesting the same last page repeatedly.
  const pages = Math.max(1, Math.min(Math.ceil(count / size), Math.floor(100000 / size) + 1))
  const current = Math.min(pages, Math.max(1, Math.floor(Number(page) || 1)))
  const offset = (current - 1) * size
  return { page: current, pages, offset, first: count ? offset + 1 : 0, last: Math.min(offset + size, count), total: count }
}

export function isRankedView(search, sort) {
  return !String(search).trim() && sort !== 'name' && sort !== 'lastSeen'
}
