import { useEffect, useRef, useState } from 'react'
import { PAGE_SIZES, PERIOD_OPTIONS, SORT_OPTIONS, isRankedView, pageInfo, statsParams, validPeriod, profileLink } from '../lib/leaderboard.js'
import '../leaderboard.css'

const STATS_API_URL = import.meta.env.VITE_PLAYER_STATS_API_URL || '/api/player-stats.php'
const LEADER_METRICS = [
  { key: 'kills', label: 'Most kills', value: (p) => formatNumber(p.totalKills) },
  { key: 'deaths', label: 'Most deaths', value: (p) => formatNumber(p.totalDeaths) },
  { key: 'kd', label: 'Best K/D', value: (p) => decimal(p.kd) },
  { key: 'perHour', label: 'Kills / hour', value: (p) => decimal(p.killsPerHour) },
  { key: 'time', label: 'Playtime', value: (p) => formatDuration(p.secondsTracked) },
  { key: 'seeded', label: 'Seed time', value: (p) => `${formatNumber(p.seedMinutes)}m` },
  { key: 'matches', label: 'Matches', value: (p) => formatNumber(p.matchesSeen) },
  { key: 'wins', label: 'Wins', value: (p) => formatNumber(p.wins) },
  { key: 'winRate', label: 'Win rate', value: (p) => percentage(p.winRate) },
  { key: 'cash', label: 'Cash', value: (p) => formatNumber(p.cash) },
]
const TABLE_METRICS = ['kills', 'deaths', 'kd', 'matches', 'wins', 'time']
const TABLE_LABELS = { kills: 'Kills', deaths: 'Deaths', kd: 'K/D', perHour: 'Kills / hour', time: 'Playtime', seeded: 'Seed time', matches: 'Matches', wins: 'Wins', winRate: 'Win rate', cash: 'Cash' }

function formatNumber(value) {
  if (value == null) return '—'
  const number = Number(value)
  return Number.isFinite(number) ? new Intl.NumberFormat('en-GB').format(number) : '—'
}
function decimal(value) {
  return value != null && Number.isFinite(Number(value)) ? Number(value).toFixed(2) : '—'
}
function percentage(value) {
  return value != null && Number.isFinite(Number(value)) ? `${(Number(value) * 100).toFixed(1)}%` : '—'
}
function formatDuration(seconds) {
  const value = Number(seconds)
  if (!Number.isFinite(value) || value < 0 || seconds == null) return '—'
  const hours = Math.floor(value / 3600)
  const minutes = Math.floor((value % 3600) / 60)
  return hours ? `${formatNumber(hours)}h ${minutes}m` : `${minutes}m`
}
function formatLastSeen(value) {
  const date = value ? new Date(value) : null
  return date && Number.isFinite(date.getTime()) ? date.toLocaleString() : '—'
}
function primaryFaction(player) {
  return Object.entries(player?.factionCounts || {}).sort((a, b) => Number(b[1]) - Number(a[1]))[0]?.[0] || '—'
}
function serversPlayed(player) {
  return Object.keys(player?.serverCounts || {})
    .map((key) => Number(String(key).replace('server-', '')))
    .filter(Number.isFinite).sort((a, b) => a - b).map((number) => `#${number}`).join(', ') || '—'
}
function focusSection(node) {
  if (!node) return
  node.focus({ preventScroll: true })
  node.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
}

async function fetchStatsPayload(options = {}) {
  const { signal, ...query } = options
  const response = await fetch(`${STATS_API_URL}?${statsParams(query)}`, { cache: 'no-store', signal })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(String(payload?.error?.message || payload?.error || `Stats API returned ${response.status}`))
  if (payload?.group !== 'all') throw new Error('The API did not return combined player statistics.')
  if (query.server && String(payload.server) !== String(query.server)) throw new Error('The API did not return the requested server.')
  if (!query.server && payload.server != null) throw new Error('The API did not return all five servers.')
  if (query.meta) {
    if (payload.version < 2 || !Array.isArray(payload.seasons)) throw new Error('Season support is not available yet.')
  } else if (query.career) {
    if (payload.version < 2 || payload.playerId !== query.career || !payload.career) throw new Error('Career details are not available yet.')
  } else if (query.leaders) {
    if (!payload.leaders || typeof payload.leaders !== 'object' || Array.isArray(payload.leaders)) throw new Error('Category leaders are temporarily unavailable.')
  } else if (!Array.isArray(payload.players) || !Number.isFinite(Number(payload.total))) {
    throw new Error('The stats API returned an invalid player list.')
  }
  if (!query.meta && !query.career && payload.range !== (query.range || 'all')) throw new Error('The API returned the wrong period.')
  if (query.player && payload.version < 2) throw new Error('Full player rankings require the updated stats service.')
  return payload
}

function CareerDetails({ playerId, server }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    setData(null); setError('')
    fetchStatsPayload({ career: playerId, server, signal: controller.signal })
      .then(payload => { if (!controller.signal.aborted) setData(payload.career) })
      .catch(error => { if (!controller.signal.aborted) setError(error.message) })
    return () => controller.abort()
  }, [playerId, server])
  return <section className="player-comparison-section">
    <h3>Recorded match career</h3>
    <p className="stats-footnote">All recorded completed matches on {server ? `Server #${server}` : 'all five servers'}, independent of the period above. Coverage depends on recorded match/feed history; these totals can differ from the historical leaderboard.</p>
    {error ? <p role="status">{error}</p> : !data ? <p role="status">Loading match history…</p> : !data.matches ? <p>No completed-match records are available for this player yet.</p> : <>
      <div className="player-profile-grid">{[
        ['Best kill streak', formatNumber(data.killStreak)],
        ['Longest recorded kill', data.longestM == null ? 'Not recorded' : `${decimal(data.longestM)} m`],
        ['Vehicle kills', formatNumber(data.vehicleKills)],
        ['Current result streak', data.streak ? `${data.streak.n} ${data.streak.kind}${data.streak.n === 1 ? '' : 's'}` : 'No streak'],
      ].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
      <h4>Recent matches</h4>
      <div className="player-comparison-table-wrap"><table className="player-comparison-table">
        <thead><tr>{['Ended', 'Server', 'Map / faction', 'Result', 'Kills', 'Deaths', 'Cash earned'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{(data.last || []).map(match => <tr key={`${match.serverId}-${match.matchId}`}>
          <td>{formatLastSeen(match.endedAt)}</td><td>{match.serverName}</td><td>{match.map || 'Unknown'} / {match.faction || 'Unknown'}</td>
          <td>{match.result || 'Unrecorded'}</td><td>{formatNumber(match.kills)}</td><td>{formatNumber(match.deaths)}</td><td>{formatNumber(match.cashDelta)}</td>
        </tr>)}</tbody>
      </table></div>
      {[['Map performance', data.maps], ['Faction performance', data.factions]].map(([label, groups]) => <details key={label} className="board-data-notes"><summary>{label}</summary>
        <div className="player-comparison-table-wrap"><table className="player-comparison-table"><thead><tr><th scope="col">{label}</th><th scope="col">Matches</th><th scope="col">W / L / D</th><th scope="col">Kills / deaths</th></tr></thead>
          <tbody>{(groups || []).map(group => <tr key={group.key}><td>{group.key}</td><td>{formatNumber(group.matches)}</td><td>{group.wins} / {group.losses} / {group.draws}</td><td>{formatNumber(group.kills)} / {formatNumber(group.deaths)}</td></tr>)}</tbody>
        </table></div>
      </details>)}
    </>}
  </section>
}

function PlayerProfile({ player, scope, range, server, onBack, profileRef, loading, error }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [comparison, setComparison] = useState(null)
  const [compareState, setCompareState] = useState('')
  const [careerOpen, setCareerOpen] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    setResults([]); setComparison(null); setCompareState('')
    if (!query.trim()) return () => controller.abort()
    setCompareState('Searching…')
    const timer = window.setTimeout(() => {
      fetchStatsPayload({ search: query, range, server, limit: 20, signal: controller.signal })
        .then(payload => {
          if (!controller.signal.aborted) {
            const found = payload.players.filter(p => p.id !== player.id)
            setResults(found); setCompareState(found.length ? '' : 'No matching player in this period and server scope.')
          }
        })
        .catch(error => { if (!controller.signal.aborted) setCompareState(error.message) })
    }, 250)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [query, player.id, range, server])
  const stats = [
    ['Kills', formatNumber(player.totalKills)], ['Deaths', formatNumber(player.totalDeaths)], ['K/D', decimal(player.kd)],
    ['Kills per hour', decimal(player.killsPerHour)], ['Headshots', formatNumber(player.headshots)],
    ['Team kills', formatNumber(player.teamKills)], ['Suicides', formatNumber(player.suicides)], ['Cash', formatNumber(player.cash)],
    ['Matches', formatNumber(player.matchesSeen)], ['Wins / Losses / Draws', `${formatNumber(player.wins)} / ${formatNumber(player.losses)} / ${formatNumber(player.draws)}`],
    ['Win rate', percentage(player.winRate)], ['Playtime', formatDuration(player.secondsTracked)],
    ['Seed time', `${formatNumber(player.seedMinutes)}m`], ['Primary faction', primaryFaction(player)], ['Servers played', serversPlayed(player)],
  ]

  return <article className="player-profile-card" ref={profileRef} tabIndex={-1} aria-label={`${player.name} player profile`}>
    <div className="player-profile-heading">
      <div><p className="kicker">Player profile // {scope}</p><h2>{player.name}</h2><p>{player.id}</p>
        <a href={profileLink(player.id, { range, server })}>Permalink to this profile</a></div>
      <button type="button" onClick={onBack}>← Back to leaderboard</button>
    </div>
    <div className="player-profile-grid">{stats.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
    <div className="player-profile-meta"><p><span>First seen</span>{formatLastSeen(player.firstSeen)}</p><p><span>Last seen</span>{formatLastSeen(player.lastSeen)}</p><p><span>Known aliases</span>{player.aliases?.join(', ') || 'None recorded'}</p></div>
    <section className="player-comparison-section">
      <h3>Full leaderboard positions</h3>
      <p className="stats-footnote">All recorded players in {scope}; no minimum playtime. Positions use the same tie-breaks as the leaderboard.</p>
      {loading && <p role="status">Loading full rankings…</p>}
      {error && <p role="status">{error}</p>}
      <div className="player-rank-grid">{[['Kills', 'kills'], ['K/D', 'kd'], ['Matches', 'matches'], ['Playtime', 'time']].map(([label, metric]) => {
        const position = player.ranks?.[metric]
        return <div key={metric}><span>{label} position</span><strong>{position?.rank ? `#${formatNumber(position.rank)} of ${formatNumber(position.total)}` : '—'}</strong></div>
      })}</div>
      <h3>Compare with another player</h3>
      <label className="profile-compare-search"><span>Name, previous name or Steam ID</span><input type="search" maxLength={80} value={query} onChange={event => setQuery(event.target.value)} /></label>
      {compareState && <p role="status">{compareState}</p>}
      {!!results.length && <label><span>Matching players (up to 20; narrow your search for more)</span><select aria-label="Comparison player" value={comparison?.id || ''} onChange={event => setComparison(results.find(p => p.id === event.target.value) || null)}>
        <option value="">Choose a player</option>{results.map(p => <option value={p.id} key={p.id}>{p.name} · {p.id}</option>)}
      </select></label>}
      {comparison && <div className="player-comparison-table-wrap"><table className="player-comparison-table">
        <thead><tr><th scope="col">Metric</th><th scope="col">{player.name}</th><th scope="col">{comparison.name}</th></tr></thead>
        <tbody>{[['Kills', 'totalKills', formatNumber], ['Deaths', 'totalDeaths', formatNumber], ['K/D', 'kd', decimal], ['Matches', 'matchesSeen', formatNumber], ['Cash', 'cash', formatNumber], ['Playtime', 'secondsTracked', formatDuration]].map(([label, field, format]) => <tr key={field}><th scope="row">{label}</th><td>{format(player[field])}</td><td>{format(comparison[field])}</td></tr>)}</tbody>
      </table></div>}
    </section>
    <details className="board-data-notes" open={careerOpen} onToggle={event => setCareerOpen(event.currentTarget.open)}>
      <summary>Career records, recent matches and map / faction performance</summary>
      {careerOpen && <CareerDetails playerId={player.id} server={server} />}
    </details>
  </article>
}

export default function Stats() {
  const [filters, setFilters] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return { search: '', sort: 'kills', range: validPeriod(params.get('range')) ? params.get('range') : 'all', server: /^[1-5]$/.test(params.get('server')) ? params.get('server') : '', page: 1, pageSize: 25 }
  })
  const { search, sort, range, server, page, pageSize } = filters
  const [players, setPlayers] = useState([])
  const [total, setTotal] = useState(0)
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [selectedId, setSelectedId] = useState(() => {
    const id = new URLSearchParams(window.location.search).get('player')
    return /^\d{17}$/.test(id) ? id : null
  })
  const [selectedLookup, setSelectedLookup] = useState(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [seasons, setSeasons] = useState([])
  const [metaError, setMetaError] = useState('')
  const [snapshotAt, setSnapshotAt] = useState(null)
  const [leadersOpen, setLeadersOpen] = useState(false)
  const [leaders, setLeaders] = useState(null)
  const [leadersError, setLeadersError] = useState('')
  const boardRef = useRef(null)
  const profileRef = useRef(null)
  const returnToBoard = useRef(false)
  const scope = server ? `Server #${server}` : 'All five servers'
  const periods = [...PERIOD_OPTIONS, ...seasons.map(season => [`s:${season.key}`, `${season.name} (${season.kind === 'custom' ? 'community' : 'official'})`])]
  const periodLabel = periods.find(([key]) => key === range)?.[1] || 'Selected season'
  const sortLabel = SORT_OPTIONS.find(([key]) => key === sort)?.[1] || 'Kills'
  const pagination = pageInfo(total, page, pageSize)
  const ranked = isRankedView(search, sort)
  const columns = [...TABLE_METRICS]
  if (!columns.includes(sort) && LEADER_METRICS.some((metric) => metric.key === sort)) columns.push(sort)
  if (sort === 'lastSeen') columns.push('lastSeen')

  const changeFilter = (key, value) => {
    // Clicking the already-active column must not clear rows without a new request.
    if (filters[key] === value && (key === 'page' || page === 1)) return
    setLoading(true)
    setPlayers([])
    setError('')
    setSelectedId(null)
    setSelectedLookup(null)
    if (key === 'server' || key === 'range') setSummary(null)
    setFilters((current) => ({ ...current, [key]: value, page: key === 'page' ? value : 1 }))
  }
  const retry = () => { setLoading(true); setRefresh((value) => value + 1) }
  const backToBoard = () => { returnToBoard.current = true; setSelectedId(null); setSelectedLookup(null) }
  const openProfile = (id) => { setSelectedLookup(null); setProfileError(''); setSelectedId(id) }

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    const timer = window.setTimeout(async () => {
      try {
        const payload = await fetchStatsPayload({ search, sort, range, server, limit: pageSize, offset: (page - 1) * pageSize, signal: controller.signal })
        if (controller.signal.aborted) return
        const bounds = pageInfo(payload.total, page, pageSize)
        if (bounds.page !== page) {
          setFilters((current) => ({ ...current, page: bounds.page }))
          return
        }
        setPlayers(payload.players)
        setTotal(Number(payload.total))
        setSummary(payload.summary || null)
        setSnapshotAt(payload.snapshotAt || payload.generatedAt)
      } catch (fetchError) {
        if (!controller.signal.aborted) { setError(fetchError.message || 'Unable to load the leaderboard.'); setPlayers([]) }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, search.trim() ? 250 : 0)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [search, sort, range, server, page, pageSize, refresh])

  // Optional cards are fetched only when opened, not before the leaderboard.
  useEffect(() => {
    const controller = new AbortController()
    setLeaders(null)
    setLeadersError('')
    if (leadersOpen) {
      fetchStatsPayload({ range, server, leaders: true, limit: 1, signal: controller.signal })
        .then((payload) => { if (!controller.signal.aborted) setLeaders(payload.leaders) })
        .catch((fetchError) => { if (!controller.signal.aborted) setLeadersError(fetchError.message) })
    }
    return () => controller.abort()
  }, [leadersOpen, range, server, refresh])

  useEffect(() => {
    const controller = new AbortController()
    setSeasons([]); setMetaError('')
    fetchStatsPayload({ meta: true, server, signal: controller.signal })
      .then(payload => { if (!controller.signal.aborted) setSeasons(payload.seasons) })
      .catch(() => { if (!controller.signal.aborted) setMetaError('Season filters are temporarily unavailable. Existing periods remain available.') })
    return () => controller.abort()
  }, [server, refresh])

  const selectedFromList = players.find(player => player.id === selectedId)
  useEffect(() => {
    const controller = new AbortController()
    setSelectedLookup(null); setProfileError(''); setProfileLoading(Boolean(selectedId))
    if (selectedId) {
      fetchStatsPayload({ player: selectedId, range, server, limit: 1, signal: controller.signal })
        .then(payload => {
          if (controller.signal.aborted) return
          const player = payload.players.find(entry => entry.id === selectedId)
          if (!player) throw new Error('No recorded stats in this period and server scope.')
          setSelectedLookup(player)
        })
        .catch(error => { if (!controller.signal.aborted) setProfileError(error.message) })
        .finally(() => { if (!controller.signal.aborted) setProfileLoading(false) })
    }
    return () => controller.abort()
  }, [selectedId, range, server, refresh])
  const selectedPlayer = selectedLookup?.id === selectedId ? selectedLookup : selectedFromList

  useEffect(() => {
    if (selectedPlayer) focusSection(profileRef.current)
    else if (!selectedId && returnToBoard.current) { returnToBoard.current = false; focusSection(boardRef.current) }
  }, [selectedId, selectedPlayer])

  const pageChange = (value) => { changeFilter('page', value); focusSection(boardRef.current) }
  const sortHeading = (key, label) => (
    <th key={key} scope="col" aria-sort={sort === key ? key === 'name' ? 'ascending' : 'descending' : 'none'}>
      <button type="button" className={sort === key ? 'board-sort active' : 'board-sort'} onClick={() => changeFilter('sort', key)}>
        {label}<span aria-hidden="true">{sort === key ? key === 'name' ? ' ↑' : ' ↓' : ' ↕'}</span>
      </button>
    </th>
  )

  return (
    <section className="section stats-page stats-leaderboard" aria-labelledby="leaderboard-title">
      <header className="board-header">
        <div><p className="kicker">44th Commandos // WARDOGS</p><h1 id="leaderboard-title">Leaderboard<span>.</span></h1>
          <p className="board-intro">44th server rankings. Select a player to view their stats.</p></div>
        <div className="board-header-meta"><span>WARCON statistics</span><strong>{scope} · {periodLabel}</strong></div>
      </header>

      <div className="stats-summary-grid board-summary" aria-label="Statistics for the selected servers and period">
        <article><span>Tracked players</span><strong>{formatNumber(summary?.trackedPlayers)}</strong></article>
        <article><span>Online now</span><strong>{formatNumber(summary?.onlinePlayers)}</strong></article>
        <article><span>Kills recorded</span><strong>{formatNumber(summary?.totalKillsRecorded)}</strong></article>
        <article><span>Tracked hours</span><strong>{summary ? formatNumber(Math.round(Number(summary.secondsTracked || 0) / 3600)) : '—'}</strong></article>
      </div>

      {range.startsWith('s:') && <p className="stats-notice">Season statistics use WARCON’s completed-match records and session activity. Matches count by their end time. These are separate from the historical K/D totals used by all-time and rolling-period boards.</p>}
      {metaError && <p role="status" className="stats-footnote">{metaError}</p>}
      {snapshotAt && <p className="stats-footnote">Snapshot: {formatLastSeen(snapshotAt)} · shared for up to 15 seconds</p>}
      {!selectedId && <>
        <div className="stats-toolbar board-toolbar">
          <label className="board-search"><span>Find a player</span><input type="search" maxLength={80} value={search} onChange={(event) => changeFilter('search', event.target.value)} placeholder="Name, previous name or Steam ID" /></label>
          <label><span>Server</span><select aria-label="Server" value={server} onChange={(event) => changeFilter('server', event.target.value)}>
            <option value="">All five servers</option>{[1, 2, 3, 4, 5].map((number) => <option key={number} value={String(number)}>Server #{number}</option>)}
          </select></label>
          <label><span>Period</span><select aria-label="Period" value={range} onChange={(event) => changeFilter('range', event.target.value)}>{periods.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label><span>Rank by</span><select aria-label="Rank by" value={sort} onChange={(event) => changeFilter('sort', event.target.value)}>{SORT_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </div>
        <div className="board-list-heading">
          <div><h2 ref={boardRef} tabIndex={-1}>{search.trim() ? 'Search results' : 'Player rankings'}</h2><span>{sortLabel} · {periodLabel} · {scope}</span></div>
          <button type="button" className="board-button" onClick={retry} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
        </div>
        {error ? <div className="stats-notice" role="alert"><strong>Leaderboard temporarily unavailable.</strong><p>{error}</p><button className="board-button" type="button" onClick={retry}>Try again</button></div> : <>
          <p className="board-mobile-hint">Swipe the table to see more statistics.</p>
          <div className="stats-table-wrap board-table-wrap" tabIndex={0} role="region" aria-label="Player leaderboard, horizontally scrollable" aria-busy={loading}>
            <table className="stats-table board-table"><caption className="board-sr-only">{scope}, {periodLabel}, ordered by {sortLabel}. {ranked ? 'Ranks are positions in this ordered leaderboard.' : 'Numbers are result positions, not global ranks.'}</caption>
              <thead><tr><th scope="col" className="board-rank-cell">{ranked ? 'Rank' : 'Result'}</th>{sortHeading('name', 'Player')}{columns.map((key) => sortHeading(key, key === 'lastSeen' ? 'Last seen' : TABLE_LABELS[key]))}</tr></thead>
              <tbody>
                {!loading && players.map((player, index) => {
                  const rank = (page - 1) * pageSize + index + 1
                  return <tr key={player.id} className={ranked && rank <= 3 ? `board-place-${rank}` : undefined}>
                    <td className="board-rank-cell"><span className={`board-rank ${ranked && rank <= 3 ? 'board-podium' : ''}`}>{rank}</span></td>
                    <td className="board-player-cell"><button className="stats-player-link" type="button" onClick={() => openProfile(player.id)}>
                      <strong>{player.name || player.id}</strong><small><span className={`player-state ${player.online ? 'online' : 'offline'}`}>{player.online ? `Online${player.currentServer ? ` · #${player.currentServer}` : ''}` : 'Offline'}</span><span>{player.currentFaction || primaryFaction(player)}</span></small>
                    </button></td>
                    {columns.map((key) => <td key={key} className={sort === key ? 'board-active-metric' : undefined}>{key === 'lastSeen' ? formatLastSeen(player.lastSeen) : LEADER_METRICS.find((metric) => metric.key === key)?.value(player)}</td>)}
                  </tr>
                })}
                {loading && <tr><td colSpan={columns.length + 2} className="stats-empty" role="status">Loading leaderboard…</td></tr>}
                {!loading && !players.length && <tr><td colSpan={columns.length + 2} className="stats-empty">{search.trim() ? 'No matching players. Try another name or Steam ID.' : 'No recorded players for this server selection and period.'}{search.trim() && <button className="board-button" type="button" onClick={() => changeFilter('search', '')}>Clear search</button>}</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="board-pagination" aria-label="Leaderboard pagination">
            <p aria-live="polite">{loading ? 'Loading results…' : `${formatNumber(pagination.first)}–${formatNumber(pagination.last)} of ${formatNumber(total)} players`}{search.trim() && <small>Search positions only — not global ranks.</small>}</p>
            <label><span>Rows</span><select aria-label="Rows" value={pageSize} onChange={(event) => changeFilter('pageSize', Number(event.target.value))}>{PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}</select></label>
            <div className="board-page-controls"><button className="board-button" type="button" disabled={loading || page <= 1} onClick={() => pageChange(page - 1)}>Previous</button><span>Page {loading ? '…' : `${pagination.page} / ${pagination.pages}`}</span><button className="board-button" type="button" disabled={loading || page >= pagination.pages} onClick={() => pageChange(page + 1)}>Next</button></div>
          </div>
        </>}

        <details className="board-category-leaders" open={leadersOpen} onToggle={(event) => setLeadersOpen(event.currentTarget.open)}>
          <summary><span>Category leaders</span><small>Top performers by metric · minimum 60 minutes played</small></summary>
          {leadersOpen && <div className="board-category-body">
            {leadersError ? <p role="status">Category leaders are temporarily unavailable. The leaderboard above is still available.</p> : <div className="stats-leader-grid">{LEADER_METRICS.map((metric, index) => {
              const leader = leaders?.[metric.key]
              return <button key={metric.key} type="button" className={`stats-leader-card metric-${metric.key}`} disabled={!leader} onClick={() => openProfile(leader.id)}>
                <span className="stats-leader-index">{String(index + 1).padStart(2, '0')}</span><span className="stats-leader-label">{metric.label}</span><strong>{leader?.name || (leaders ? 'No eligible player' : 'Loading…')}</strong><em>{leader ? metric.value(leader) : '—'}</em><small>{scope} · {periodLabel}</small>
              </button>
            })}</div>}
          </div>}
        </details>
      </>}

      {selectedId && <>
        {selectedPlayer && <PlayerProfile key={`${selectedId}:${range}:${server}`} player={selectedPlayer} scope={`${scope} · ${periodLabel}`} range={range} server={server} loading={profileLoading} error={profileError} onBack={backToBoard} profileRef={profileRef} />}
        {!selectedPlayer && <div className="stats-notice" role="status"><strong>{profileLoading ? 'Loading player profile…' : profileError || 'Loading player profile…'}</strong><p><button className="board-button" type="button" onClick={backToBoard}>← Back to leaderboard</button></p></div>}
      </>}
      <details className="board-data-notes"><summary>About these statistics</summary><p className="stats-footnote">WARCON data covers the selected 44th servers and period. Kills and deaths combine recorded session totals from before kill-feed tracking began with later kill-feed events. Sessions crossing that change may have incomplete totals. Match results come from WARCON’s match history. Cash is the sum of recorded session cash, not a persistent wallet. Category leaders require at least 60 minutes played; the main table includes all recorded players. Rankings follow the selected metric and server-side tie-breaks. Profile positions cover the full selected leaderboard, not a sample. Comparisons use a searched player in the same scope. Career details cover recorded completed matches across all time and may not match historical/feed totals.</p></details>
    </section>
  )
}
