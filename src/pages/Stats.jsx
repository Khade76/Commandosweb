import { useEffect, useMemo, useRef, useState } from 'react'
import { PAGE_SIZES, PERIOD_OPTIONS, SORT_OPTIONS, isRankedView, pageInfo, statsParams } from '../lib/leaderboard.js'
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
function average(players, field) {
  const values = players.map((player) => player[field]).filter((value) => value != null).map(Number).filter(Number.isFinite)
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
}
function rankMetric(players, player, field) {
  const ranked = players.filter((entry) => entry[field] != null && Number.isFinite(Number(entry[field])))
    .slice().sort((a, b) => Number(b[field]) - Number(a[field]))
  const index = ranked.findIndex((entry) => entry.id === player.id)
  return index < 0 ? null : { rank: index + 1, total: ranked.length }
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
  if (query.leaders) {
    if (!payload.leaders || typeof payload.leaders !== 'object' || Array.isArray(payload.leaders)) throw new Error('Category leaders are temporarily unavailable.')
  } else if (!Array.isArray(payload.players) || !Number.isFinite(Number(payload.total))) {
    throw new Error('The stats API returned an invalid player list.')
  }
  return payload
}

function PlayerProfile({ player, pool, poolState, scope, onBack, profileRef }) {
  const [compareId, setCompareId] = useState('')
  useEffect(() => setCompareId(''), [player.id])
  const comparison = pool.find((entry) => entry.id === compareId) || null
  const options = useMemo(() => pool.filter((entry) => entry.id !== player.id).slice()
    .sort((a, b) => String(a.name).localeCompare(String(b.name))), [pool, player.id])
  const stats = [
    ['Kills', formatNumber(player.totalKills)], ['Deaths', formatNumber(player.totalDeaths)], ['K/D', decimal(player.kd)],
    ['Kills per hour', decimal(player.killsPerHour)], ['Headshots', formatNumber(player.headshots)],
    ['Team kills', formatNumber(player.teamKills)], ['Suicides', formatNumber(player.suicides)], ['Cash', formatNumber(player.cash)],
    ['Matches', formatNumber(player.matchesSeen)], ['Wins / Losses / Draws', `${formatNumber(player.wins)} / ${formatNumber(player.losses)} / ${formatNumber(player.draws)}`],
    ['Win rate', percentage(player.winRate)], ['Playtime', formatDuration(player.secondsTracked)],
    ['Seed time', `${formatNumber(player.seedMinutes)}m`], ['Primary faction', primaryFaction(player)], ['Servers played', serversPlayed(player)],
  ]
  return (
    <article className="player-profile-card" ref={profileRef} tabIndex={-1} aria-label={`${player.name} player profile`}>
      <div className="player-profile-heading">
        <div><p className="kicker">Player profile // {scope}</p><h2>{player.name}</h2><p>{player.id}</p></div>
        <button type="button" onClick={onBack}>← Back to leaderboard</button>
      </div>
      <div className="player-profile-grid">{stats.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
      <div className="player-profile-meta">
        <p><span>First seen</span>{formatLastSeen(player.firstSeen)}</p>
        <p><span>Last seen</span>{formatLastSeen(player.lastSeen)}</p>
        <p><span>Known aliases</span>{player.aliases?.length ? player.aliases.join(', ') : 'None recorded'}</p>
      </div>
      <section className="player-comparison-section">
        <div className="player-comparison-heading">
          <div><p className="kicker">Player comparison</p><h3>How {player.name} compares</h3></div>
          <label><span>Compare with</span><select aria-label="Compare with" value={compareId} onChange={(event) => setCompareId(event.target.value)} disabled={poolState !== 'ready'}>
            <option value="">Comparison sample average</option>
            {options.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
          </select></label>
        </div>
        <p className="stats-footnote">Comparisons use up to 500 players ordered by kills for this server selection and period, not the entire community.</p>
        {poolState === 'loading' && <p role="status">Loading comparison data…</p>}
        {poolState === 'error' && <p role="status">Comparison data is temporarily unavailable. The player’s individual stats are still shown above.</p>}
        {poolState === 'ready' && <>
          <div className="player-rank-grid">{[['Kills', 'totalKills'], ['K/D', 'kd'], ['Matches', 'matchesSeen'], ['Playtime', 'secondsTracked']].map(([label, field]) => {
            const rank = rankMetric(pool, player, field)
            return <div key={field}><span>{label} position</span><strong>{rank ? `#${rank.rank} of ${rank.total}` : '—'}</strong><small>Within the comparison sample</small></div>
          })}</div>
          <div className="player-comparison-table-wrap"><table className="player-comparison-table">
            <thead><tr><th scope="col">Metric</th><th scope="col">{player.name}</th><th scope="col">{comparison?.name || 'Sample average'}</th></tr></thead>
            <tbody>{[
              ['Kills', 'totalKills', formatNumber], ['Deaths', 'totalDeaths', formatNumber], ['K/D', 'kd', decimal],
              ['Matches', 'matchesSeen', formatNumber], ['Cash', 'cash', formatNumber], ['Playtime', 'secondsTracked', formatDuration],
            ].map(([label, field, format]) => {
              const value = comparison ? comparison[field] : average(pool, field)
              return <tr key={field}><td>{label}</td><td>{format(player[field])}</td><td>{format(!comparison && format === formatNumber && value != null ? Math.round(value) : value)}</td></tr>
            })}</tbody>
          </table></div>
        </>}
      </section>
    </article>
  )
}

export default function Stats() {
  const [filters, setFilters] = useState({ search: '', sort: 'kills', range: 'all', server: '', page: 1, pageSize: 25 })
  const { search, sort, range, server, page, pageSize } = filters
  const [players, setPlayers] = useState([])
  const [total, setTotal] = useState(0)
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [selectedId, setSelectedId] = useState(null)
  const [selectedLookup, setSelectedLookup] = useState(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [comparisonPool, setComparisonPool] = useState([])
  const [poolState, setPoolState] = useState('idle')
  const [leadersOpen, setLeadersOpen] = useState(false)
  const [leaders, setLeaders] = useState(null)
  const [leadersError, setLeadersError] = useState('')
  const boardRef = useRef(null)
  const profileRef = useRef(null)
  const returnToBoard = useRef(false)
  const scope = server ? `Server #${server}` : 'All five servers'
  const periodLabel = PERIOD_OPTIONS.find(([key]) => key === range)?.[1] || 'All time'
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

  // The bounded comparison sample is separate from server-paginated rankings.
  useEffect(() => {
    const controller = new AbortController()
    setComparisonPool([])
    setPoolState(selectedId ? 'loading' : 'idle')
    if (selectedId) {
      fetchStatsPayload({ range, server, limit: 500, signal: controller.signal })
        .then((payload) => { if (!controller.signal.aborted) { setComparisonPool(payload.players); setPoolState('ready') } })
        .catch(() => { if (!controller.signal.aborted) setPoolState('error') })
    }
    return () => controller.abort()
  }, [Boolean(selectedId), range, server, refresh])

  const selectedFromList = players.find((player) => player.id === selectedId)
  useEffect(() => {
    const controller = new AbortController()
    setSelectedLookup(null)
    setProfileError('')
    setProfileLoading(Boolean(selectedId && !selectedFromList))
    if (selectedId && !selectedFromList) {
      fetchStatsPayload({ search: selectedId, range, server, limit: 500, signal: controller.signal })
        .then((payload) => {
          if (controller.signal.aborted) return
          const player = payload.players.find((entry) => entry.id === selectedId)
          if (!player) throw new Error('This player has no recorded stats in the selected period and server scope.')
          setSelectedLookup(player)
        })
        .catch((fetchError) => { if (!controller.signal.aborted) setProfileError(fetchError.message) })
        .finally(() => { if (!controller.signal.aborted) setProfileLoading(false) })
    }
    return () => controller.abort()
  }, [selectedId, selectedFromList, range, server, refresh])
  const selectedPlayer = selectedFromList || (selectedLookup?.id === selectedId ? selectedLookup : null)

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

      {!selectedId && <>
        <div className="stats-toolbar board-toolbar">
          <label className="board-search"><span>Find a player</span><input type="search" maxLength={80} value={search} onChange={(event) => changeFilter('search', event.target.value)} placeholder="Name, previous name or Steam ID" /></label>
          <label><span>Server</span><select aria-label="Server" value={server} onChange={(event) => changeFilter('server', event.target.value)}>
            <option value="">All five servers</option>{[1, 2, 3, 4, 5].map((number) => <option key={number} value={String(number)}>Server #{number}</option>)}
          </select></label>
          <label><span>Period</span><select aria-label="Period" value={range} onChange={(event) => changeFilter('range', event.target.value)}>{PERIOD_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
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
        {selectedPlayer && <PlayerProfile player={selectedPlayer} pool={comparisonPool} poolState={poolState} scope={`${scope} · ${periodLabel}`} onBack={backToBoard} profileRef={profileRef} />}
        {!selectedPlayer && <div className="stats-notice" role="status"><strong>{profileLoading ? 'Loading player profile…' : profileError || 'Loading player profile…'}</strong><p><button className="board-button" type="button" onClick={backToBoard}>← Back to leaderboard</button></p></div>}
      </>}
      <details className="board-data-notes"><summary>About these statistics</summary><p className="stats-footnote">WARCON data covers the selected 44th servers and period. Kills and deaths combine recorded session totals from before kill-feed tracking began with later kill-feed events. Sessions crossing that change may have incomplete totals. Match results come from WARCON’s match history. Cash is the sum of recorded session cash, not a persistent wallet. Category leaders require at least 60 minutes played; the main table includes all recorded players. Rankings follow the selected metric and server-side tie-breaks. Profile comparisons use a separate sample of up to 500 players ordered by kills.</p></details>
    </section>
  )
}
