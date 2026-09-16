import { useEffect, useMemo, useRef, useState } from 'react'
import { images } from '../data/site.js'

const STATS_API_URL = import.meta.env.VITE_PLAYER_STATS_API_URL || '/api/player-stats.php'
const CASH_TRACKING_SINCE = '15 September 2026'
const STATS_GROUPS = ['normal', 'hardcore']

const LEADER_METRICS = [
  { key: 'kills', index: '01', label: 'Most kills', value: (player) => formatNumber(player.totalKills) },
  { key: 'deaths', index: '02', label: 'Most deaths', value: (player) => formatNumber(player.totalDeaths) },
  { key: 'kd', index: '03', label: 'Best K/D', value: (player) => Number(player.kd || 0).toFixed(2) },
  { key: 'cash', index: '04', label: 'Cash earned', value: (player) => formatNumber(player.cashEarned) },
  { key: 'time', index: '05', label: 'Time played', value: (player) => formatDuration(player.secondsTracked) },
]

function formatDuration(seconds) {
  const value = Number(seconds)
  if (!Number.isFinite(value) || value <= 0) return '—'
  const hours = Math.floor(value / 3600)
  const minutes = Math.floor((value % 3600) / 60)
  if (hours) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function formatNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? new Intl.NumberFormat('en-GB').format(number) : '—'
}

function formatLastSeen(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString()
}

function dateValue(value) {
  const timestamp = value ? new Date(value).getTime() : 0
  return Number.isFinite(timestamp) ? timestamp : 0
}

function mergeCountMaps(left, right) {
  const merged = { ...(left || {}) }
  Object.entries(right || {}).forEach(([key, value]) => {
    merged[key] = Number(merged[key] || 0) + Number(value || 0)
  })
  return merged
}

function mergePlayerRecords(existing, incoming) {
  if (!existing) {
    const kills = Number(incoming.totalKills || 0)
    const deaths = Number(incoming.totalDeaths || 0)
    return {
      ...incoming,
      group: 'all',
      totalKills: kills,
      totalDeaths: deaths,
      kd: deaths > 0 ? Number((kills / deaths).toFixed(2)) : kills,
      cashEarned: Number(incoming.cashEarned ?? incoming.peakCash ?? 0),
      matchesSeen: Number(incoming.matchesSeen || 0),
      sessionsSeen: Number(incoming.sessionsSeen || 0),
      secondsTracked: Number(incoming.secondsTracked || 0),
      aliases: [...new Set((incoming.aliases || []).filter(Boolean))],
      factionCounts: { ...(incoming.factionCounts || {}) },
      serverCounts: { ...(incoming.serverCounts || {}) },
      serversPlayed: [...new Set((incoming.serversPlayed || []).filter(Boolean))],
    }
  }

  const existingLast = dateValue(existing.lastSeen)
  const incomingLast = dateValue(incoming.lastSeen)
  const incomingIsNewer = incomingLast >= existingLast
  const totalKills = Number(existing.totalKills || 0) + Number(incoming.totalKills || 0)
  const totalDeaths = Number(existing.totalDeaths || 0) + Number(incoming.totalDeaths || 0)
  const existingOnline = Boolean(existing.online)
  const incomingOnline = Boolean(incoming.online)

  const firstSeenCandidates = [existing.firstSeen, incoming.firstSeen]
    .filter(Boolean)
    .sort((a, b) => dateValue(a) - dateValue(b))
  const lastSeenCandidates = [existing.lastSeen, incoming.lastSeen]
    .filter(Boolean)
    .sort((a, b) => dateValue(b) - dateValue(a))

  const selectedName = incomingIsNewer && incoming.name ? incoming.name : existing.name
  const aliases = new Set([
    ...(existing.aliases || []),
    ...(incoming.aliases || []),
  ].filter(Boolean))
  if (existing.name && existing.name !== selectedName) aliases.add(existing.name)
  if (incoming.name && incoming.name !== selectedName) aliases.add(incoming.name)

  const merged = {
    ...existing,
    name: selectedName || existing.id,
    group: 'all',
    firstSeen: firstSeenCandidates[0] || existing.firstSeen || incoming.firstSeen || null,
    lastSeen: lastSeenCandidates[0] || existing.lastSeen || incoming.lastSeen || null,
    online: existingOnline || incomingOnline,
    totalKills,
    totalDeaths,
    kd: totalDeaths > 0 ? Number((totalKills / totalDeaths).toFixed(2)) : totalKills,
    cashEarned: Math.max(
      Number(existing.cashEarned ?? existing.peakCash ?? 0),
      Number(incoming.cashEarned ?? incoming.peakCash ?? 0),
    ),
    matchesSeen: Number(existing.matchesSeen || 0) + Number(incoming.matchesSeen || 0),
    sessionsSeen: Number(existing.sessionsSeen || 0) + Number(incoming.sessionsSeen || 0),
    secondsTracked: Number(existing.secondsTracked || 0) + Number(incoming.secondsTracked || 0),
    peakKillsInMatch: Math.max(
      Number(existing.peakKillsInMatch || 0),
      Number(incoming.peakKillsInMatch || 0),
    ),
    aliases: [...aliases],
    factionCounts: mergeCountMaps(existing.factionCounts, incoming.factionCounts),
    serverCounts: mergeCountMaps(existing.serverCounts, incoming.serverCounts),
    serversPlayed: [...new Set([
      ...(existing.serversPlayed || []),
      ...(incoming.serversPlayed || []),
    ].filter(Boolean))],
  }

  if (incomingOnline && (!existingOnline || incomingIsNewer)) {
    merged.currentServer = incoming.currentServer ?? null
    merged.currentServerName = incoming.currentServerName ?? null
    merged.currentFaction = incoming.currentFaction ?? null
    merged.currentCash = incoming.currentCash ?? null
    merged.currentPingMs = incoming.currentPingMs ?? null
  }

  return merged
}

function mergePlayers(payloads) {
  const byId = new Map()
  payloads.forEach((payload) => {
    ;(payload?.players || []).forEach((player) => {
      if (!player?.id) return
      byId.set(player.id, mergePlayerRecords(byId.get(player.id), player))
    })
  })
  return [...byId.values()]
}

function sortPlayers(players, sort) {
  const sorted = [...players]
  sorted.sort((left, right) => {
    if (sort === 'name' || sort === 'nameDesc') {
      const result = String(left.name || '').localeCompare(String(right.name || ''))
      return sort === 'nameDesc' ? -result : result
    }
    if (sort === 'lastSeen') return dateValue(right.lastSeen) - dateValue(left.lastSeen)

    const field = {
      kills: 'totalKills',
      deaths: 'totalDeaths',
      kd: 'kd',
      cash: 'cashEarned',
      time: 'secondsTracked',
      matches: 'matchesSeen',
    }[sort] || 'totalKills'

    const result = Number(right[field] || 0) - Number(left[field] || 0)
    return result || String(left.name || '').localeCompare(String(right.name || ''))
  })
  return sorted
}

async function fetchCombinedStats({ search = '', signal } = {}) {
  const payloads = await Promise.all(STATS_GROUPS.map(async (group) => {
    const params = new URLSearchParams({
      group,
      sort: 'kills',
      limit: '500',
    })
    if (search.trim()) params.set('search', search.trim())

    const response = await fetch(`${STATS_API_URL}?${params.toString()}`, {
      cache: 'no-store',
      signal,
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) throw new Error(payload?.error || `Stats API returned ${response.status}`)
    return payload || { players: [] }
  }))

  return mergePlayers(payloads)
}

function primaryFaction(player) {
  const entries = Object.entries(player?.factionCounts || {})
  if (!entries.length) return '—'
  entries.sort((a, b) => Number(b[1]) - Number(a[1]))
  return entries[0][0]
}

function serversPlayed(player) {
  return Object.keys(player?.serverCounts || {})
    .map((key) => Number(String(key).replace('server-', '')))
    .filter(Number.isFinite)
    .sort((a, b) => a - b)
    .map((number) => `#${number}`)
    .join(', ') || '—'
}

function average(players, accessor) {
  const values = players
    .map(accessor)
    .map(Number)
    .filter(Number.isFinite)
  if (!values.length) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function rankMetric(players, player, accessor) {
  if (!player || !players.length) return null
  const ranked = players
    .map((entry) => ({ id: entry.id, value: Number(accessor(entry)) }))
    .filter((entry) => Number.isFinite(entry.value))
    .sort((a, b) => b.value - a.value)

  const index = ranked.findIndex((entry) => entry.id === player.id)
  if (index < 0) return null

  const rank = index + 1
  const total = ranked.length
  return {
    rank,
    total,
    topPercent: Math.max(1, Math.ceil((rank / total) * 100)),
  }
}

function comparisonValue(metric, player) {
  if (!player) return '—'
  if (metric === 'time') return formatDuration(player.secondsTracked)
  if (metric === 'kd') return Number(player.kd || 0).toFixed(2)
  return player[metric] ?? '—'
}

function metricLeader(players, metric) {
  const candidates = metric === 'kd'
    ? players.filter((player) => Number(player.totalKills || 0) >= 25)
    : metric === 'cash'
      ? players.filter((player) => Number(player.cashEarned || 0) > 0)
      : players

  const sort = {
    kills: 'kills',
    deaths: 'deaths',
    kd: 'kd',
    cash: 'cash',
    time: 'time',
  }[metric]
  return sortPlayers(candidates, sort)[0] || null
}

export default function Stats() {
  const [players, setPlayers] = useState([])
  const [comparisonPool, setComparisonPool] = useState([])
  const [comparisonPoolLoaded, setComparisonPoolLoaded] = useState(false)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('kills')
  const [selectedId, setSelectedId] = useState(null)
  const [selectedLookup, setSelectedLookup] = useState(null)
  const profileRef = useRef(null)
  const [compareId, setCompareId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setCompareId('')
  }, [selectedId])

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    const loadComparisonPool = async () => {
      setComparisonPoolLoaded(false)
      try {
        const combined = await fetchCombinedStats({ signal: controller.signal })
        if (!cancelled) setComparisonPool(combined)
      } catch (fetchError) {
        if (!cancelled && fetchError.name !== 'AbortError') setComparisonPool([])
      } finally {
        if (!cancelled) setComparisonPoolLoaded(true)
      }
    }

    loadComparisonPool()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    const timer = window.setTimeout(async () => {
      setLoading(true)
      setError('')

      try {
        const combined = await fetchCombinedStats({ search, signal: controller.signal })
        if (!cancelled) setPlayers(sortPlayers(combined, sort))
      } catch (fetchError) {
        if (!cancelled && fetchError.name !== 'AbortError') {
          setError(fetchError.message || 'Unable to load player stats')
          setPlayers([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 250)

    return () => {
      cancelled = true
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [search, sort])

  const displayedPlayers = players

  const summary = useMemo(() => {
    if (!comparisonPoolLoaded) return null
    return {
      trackedPlayers: comparisonPool.length,
      onlinePlayers: comparisonPool.filter((player) => player.online).length,
      totalKillsRecorded: comparisonPool.reduce((sum, player) => sum + Number(player.totalKills || 0), 0),
      secondsTracked: comparisonPool.reduce((sum, player) => sum + Number(player.secondsTracked || 0), 0),
    }
  }, [comparisonPool, comparisonPoolLoaded])

  const leaders = useMemo(() => {
    if (!comparisonPoolLoaded) return null
    return Object.fromEntries(LEADER_METRICS.map((metric) => [metric.key, metricLeader(comparisonPool, metric.key)]))
  }, [comparisonPool, comparisonPoolLoaded])

  const totalHours = useMemo(() => {
    const seconds = Number(summary?.secondsTracked)
    return Number.isFinite(seconds) ? Math.round(seconds / 3600) : 0
  }, [summary])

  const selectedPlayerFromLists = useMemo(
    () => comparisonPool.find((player) => player.id === selectedId)
      || players.find((player) => player.id === selectedId)
      || null,
    [comparisonPool, players, selectedId],
  )

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    if (!selectedId || selectedPlayerFromLists) {
      setSelectedLookup(null)
      return () => controller.abort()
    }

    const loadSelectedPlayer = async () => {
      try {
        const combined = await fetchCombinedStats({ search: selectedId, signal: controller.signal })
        if (!cancelled) setSelectedLookup(combined.find((player) => player.id === selectedId) || null)
      } catch (fetchError) {
        if (!cancelled && fetchError.name !== 'AbortError') setSelectedLookup(null)
      }
    }

    loadSelectedPlayer()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [selectedId, selectedPlayerFromLists])

  const selectedPlayer = selectedPlayerFromLists
    || (selectedLookup?.id === selectedId ? selectedLookup : null)

  useEffect(() => {
    if (selectedPlayer) profileRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [selectedPlayer])

  const comparisonPlayer = useMemo(
    () => comparisonPool.find((player) => player.id === compareId) || null,
    [comparisonPool, compareId],
  )

  const rankings = useMemo(() => {
    if (!selectedPlayer) return null
    return {
      kills: rankMetric(comparisonPool, selectedPlayer, (player) => player.totalKills),
      kd: rankMetric(comparisonPool, selectedPlayer, (player) => player.kd),
      matches: rankMetric(comparisonPool, selectedPlayer, (player) => player.matchesSeen),
      time: rankMetric(comparisonPool, selectedPlayer, (player) => player.secondsTracked),
    }
  }, [comparisonPool, selectedPlayer])

  const averages = useMemo(() => ({
    kills: average(comparisonPool, (player) => player.totalKills),
    deaths: average(comparisonPool, (player) => player.totalDeaths),
    kd: average(comparisonPool, (player) => player.kd),
    matchesSeen: average(comparisonPool, (player) => player.matchesSeen),
    secondsTracked: average(comparisonPool, (player) => player.secondsTracked),
    cashEarned: average(comparisonPool, (player) => player.cashEarned),
  }), [comparisonPool])

  const compareOptions = useMemo(
    () => comparisonPool
      .filter((player) => player.id !== selectedId)
      .sort((a, b) => String(a.name).localeCompare(String(b.name))),
    [comparisonPool, selectedId],
  )

  return (
    <>
      <section className="page-hero stats-hero" style={{ '--hero-image': `url(${images.hero})` }}>
        <div className="hero-overlay" />
        <div className="shell">
          <p className="kicker">44th Intelligence</p>
          <h1>Player<br /><em>Stats.</em></h1>
          <p className="hero-copy">Search persistent WARDOGS player statistics collected across the 44th servers.</p>
        </div>
      </section>

      <section className="section stats-page">
        <div className="stats-summary-grid">
          <article><span>Tracked players</span><strong>{summary?.trackedPlayers ?? '—'}</strong></article>
          <article><span>Online now</span><strong>{summary?.onlinePlayers ?? '—'}</strong></article>
          <article><span>Kills recorded</span><strong>{summary?.totalKillsRecorded ?? '—'}</strong></article>
          <article><span>Tracked hours</span><strong>{summary ? totalHours : '—'}</strong></article>
        </div>

        <section className="stats-leaders" aria-labelledby="stats-leaders-title">
          <div className="stats-leaders-heading">
            <div>
              <p className="kicker">Network leaders // All tracked servers</p>
              <h2 id="stats-leaders-title">Top Players</h2>
            </div>
            <p>Five categories. Five separate records.</p>
          </div>
          <div className="stats-leader-grid">
            {LEADER_METRICS.map((metric) => {
              const leader = leaders?.[metric.key]
              const waitingForRoundData = leaders && metric.key === 'cash' && !leader
              return (
                <button
                  key={metric.key}
                  type="button"
                  className={`stats-leader-card metric-${metric.key}`}
                  disabled={!leader}
                  onClick={() => leader && setSelectedId(leader.id)}
                >
                  <span className="stats-leader-index">{metric.index}</span>
                  <span className="stats-leader-label">{metric.label}</span>
                  <strong>{leader?.name || (waitingForRoundData ? 'Awaiting round data' : 'Calculating…')}</strong>
                  <em>{leader ? metric.value(leader) : '—'}</em>
                  {metric.key === 'kd' && <small>Minimum 25 kills</small>}
                  {metric.key === 'cash' && <small>Best single round since {CASH_TRACKING_SINCE}</small>}
                </button>
              )
            })}
          </div>
        </section>

        {!selectedPlayer && <div className="stats-toolbar">
          <label>
            <span>Search player</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Player name, previous name or Steam ID" />
          </label>
          <label>
            <span>Sort by</span>
            <select value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="kills">Kills</option>
              <option value="kd">K/D</option>
              <option value="deaths">Deaths</option>
              <option value="cash">Cash earned</option>
              <option value="time">Time tracked</option>
              <option value="matches">Matches seen</option>
              <option value="lastSeen">Last seen</option>
              <option value="name">Name A–Z</option>
              <option value="nameDesc">Name Z–A</option>
            </select>
          </label>
        </div>}

        {error && (
          <div className="stats-notice">
            <strong>Player stats are not connected yet.</strong>
            <p>{error}</p>
          </div>
        )}

        {!error && !selectedPlayer && (
          <div className="stats-table-wrap">
            <table className="stats-table">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Status</th>
                  <th>Kills</th>
                  <th>Deaths</th>
                  <th>K/D</th>
                  <th>Cash earned</th>
                  <th>Matches</th>
                  <th>Tracked</th>
                  <th>Last Seen</th>
                </tr>
              </thead>
              <tbody>
                {displayedPlayers.map((player) => (
                  <tr key={player.id} className={selectedId === player.id ? 'selected' : undefined}>
                    <td>
                      <button className="stats-player-link" type="button" onClick={() => setSelectedId(player.id)}>
                        <strong>{player.name}</strong>
                        <small>{player.currentFaction || primaryFaction(player)}</small>
                      </button>
                    </td>
                    <td>
                      <span className={`player-state ${player.online ? 'online' : 'offline'}`}>
                        {player.online ? `Online${player.currentServer ? ` • #${player.currentServer}` : ''}` : 'Offline'}
                      </span>
                    </td>
                    <td>{player.totalKills}</td>
                    <td>{player.totalDeaths}</td>
                    <td>{player.kd}</td>
                    <td>{formatNumber(player.cashEarned)}</td>
                    <td>{player.matchesSeen}</td>
                    <td>{formatDuration(player.secondsTracked)}</td>
                    <td>{formatLastSeen(player.lastSeen)}</td>
                  </tr>
                ))}
                {!loading && !players.length && (
                  <tr><td colSpan="9" className="stats-empty">No matching players found.</td></tr>
                )}
              </tbody>
            </table>
            {loading && <div className="stats-loading">Loading player statistics…</div>}
          </div>
        )}

        {selectedPlayer && !error && (
          <article className="player-profile-card" ref={profileRef}>
            <div className="player-profile-heading">
              <div>
                <p className="kicker">Player Profile // All tracked servers</p>
                <h2>{selectedPlayer.name}</h2>
                <p>{selectedPlayer.id}</p>
              </div>
              <button type="button" onClick={() => {
                setSelectedId(null)
                setSelectedLookup(null)
              }}>Back to player list</button>
            </div>

            <div className="player-profile-grid">
              <div><span>Kills</span><strong>{selectedPlayer.totalKills}</strong></div>
              <div><span>Deaths</span><strong>{selectedPlayer.totalDeaths}</strong></div>
              <div><span>K/D</span><strong>{selectedPlayer.kd}</strong></div>
              <div><span>Cash earned</span><strong>{formatNumber(selectedPlayer.cashEarned)}</strong></div>
              <div><span>Matches seen</span><strong>{selectedPlayer.matchesSeen}</strong></div>
              <div><span>Tracked time</span><strong>{formatDuration(selectedPlayer.secondsTracked)}</strong></div>
              <div><span>Peak kills / match</span><strong>{selectedPlayer.peakKillsInMatch ?? '—'}</strong></div>
              <div><span>Primary faction</span><strong>{primaryFaction(selectedPlayer)}</strong></div>
              <div><span>Servers played</span><strong>{serversPlayed(selectedPlayer)}</strong></div>
            </div>

            <div className="player-profile-meta">
              <p><span>First seen</span>{formatLastSeen(selectedPlayer.firstSeen)}</p>
              <p><span>Last seen</span>{formatLastSeen(selectedPlayer.lastSeen)}</p>
              <p><span>Known aliases</span>{selectedPlayer.aliases?.length ? selectedPlayer.aliases.join(', ') : 'None recorded'}</p>
            </div>

            <section className="player-comparison-section">
              <div className="player-comparison-heading">
                <div>
                  <p className="kicker">Player Comparison</p>
                  <h3>How {selectedPlayer.name} compares</h3>
                </div>
                <label>
                  <span>Compare directly with</span>
                  <select value={compareId} onChange={(event) => setCompareId(event.target.value)}>
                    <option value="">Community average</option>
                    {compareOptions.map((player) => (
                      <option key={player.id} value={player.id}>{player.name}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="player-rank-grid">
                {[
                  ['Kills', rankings?.kills],
                  ['K/D', rankings?.kd],
                  ['Matches', rankings?.matches],
                  ['Tracked time', rankings?.time],
                ].map(([label, rank]) => (
                  <div key={label}>
                    <span>{label} rank</span>
                    <strong>{rank ? `#${rank.rank} of ${rank.total}` : '—'}</strong>
                    <small>{rank ? `Top ${rank.topPercent}%` : 'Not ranked'}</small>
                  </div>
                ))}
              </div>

              <div className="player-comparison-table-wrap">
                <table className="player-comparison-table">
                  <thead>
                    <tr>
                      <th>Metric</th>
                      <th>{selectedPlayer.name}</th>
                      <th>{comparisonPlayer?.name || 'Community avg.'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Kills</td>
                      <td>{selectedPlayer.totalKills}</td>
                      <td>{comparisonPlayer ? comparisonPlayer.totalKills : Math.round(averages.kills)}</td>
                    </tr>
                    <tr>
                      <td>Deaths</td>
                      <td>{selectedPlayer.totalDeaths}</td>
                      <td>{comparisonPlayer ? comparisonPlayer.totalDeaths : Math.round(averages.deaths)}</td>
                    </tr>
                    <tr>
                      <td>K/D</td>
                      <td>{Number(selectedPlayer.kd || 0).toFixed(2)}</td>
                      <td>{comparisonPlayer ? comparisonValue('kd', comparisonPlayer) : averages.kd.toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td>Matches</td>
                      <td>{selectedPlayer.matchesSeen}</td>
                      <td>{comparisonPlayer ? comparisonPlayer.matchesSeen : Math.round(averages.matchesSeen)}</td>
                    </tr>
                    <tr>
                      <td>Cash earned</td>
                      <td>{formatNumber(selectedPlayer.cashEarned)}</td>
                      <td>{comparisonPlayer ? formatNumber(comparisonPlayer.cashEarned) : formatNumber(averages.cashEarned)}</td>
                    </tr>
                    <tr>
                      <td>Tracked time</td>
                      <td>{formatDuration(selectedPlayer.secondsTracked)}</td>
                      <td>{comparisonPlayer ? comparisonValue('time', comparisonPlayer) : formatDuration(averages.secondsTracked)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </article>
        )}

        <p className="stats-footnote">
          Player statistics are combined across every tracked 44th WARDOGS server. Hardcore sessions remain preserved in WARCON but are folded into the same public player totals instead of appearing in a separate section.
        </p>
      </section>
    </>
  )
}
