import { useEffect, useMemo, useState } from 'react'
import { images } from '../data/site.js'

const STATS_API_URL = import.meta.env.VITE_PLAYER_STATS_API_URL || '/api/player-stats.php'

const GROUP_LABELS = {
  normal: 'Standard',
  hardcore: 'Hardcore',
}

const GROUP_DESCRIPTIONS = {
  normal: 'All standard rotations across Servers #1, #2 + #3',
  hardcore: 'Any rotation whose live map or experience is tagged Hardcore',
}

function formatDuration(seconds) {
  const value = Number(seconds)
  if (!Number.isFinite(value) || value <= 0) return '—'
  const hours = Math.floor(value / 3600)
  const minutes = Math.floor((value % 3600) / 60)
  if (hours) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function formatLastSeen(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString()
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

export default function Stats() {
  const [players, setPlayers] = useState([])
  const [summary, setSummary] = useState(null)
  const [group, setGroup] = useState('normal')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('kills')
  const [selectedId, setSelectedId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setSelectedId(null)
  }, [group])

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    const timer = window.setTimeout(async () => {
      setLoading(true)
      setError('')

      const params = new URLSearchParams({
        group,
        sort,
        limit: '200',
      })
      if (search.trim()) params.set('search', search.trim())

      try {
        const response = await fetch(`${STATS_API_URL}?${params.toString()}`, {
          cache: 'no-store',
          signal: controller.signal,
        })
        const payload = await response.json().catch(() => null)

        if (!response.ok) {
          throw new Error(payload?.error || `Stats API returned ${response.status}`)
        }

        if (!cancelled) {
          setPlayers(Array.isArray(payload?.players) ? payload.players : [])
          setSummary(payload?.summary || null)
        }
      } catch (fetchError) {
        if (!cancelled && fetchError.name !== 'AbortError') {
          setError(fetchError.message || 'Unable to load player stats')
          setPlayers([])
          setSummary(null)
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
  }, [group, search, sort])

  const totalHours = useMemo(() => {
    const seconds = Number(summary?.secondsTracked)
    return Number.isFinite(seconds) ? Math.round(seconds / 3600) : 0
  }, [summary])

  const selectedPlayer = useMemo(
    () => players.find((player) => player.id === selectedId) || null,
    [players, selectedId],
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
        <div className="stats-group-switch" aria-label="Stats ruleset group">
          {Object.entries(GROUP_LABELS).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={group === key ? 'active' : ''}
              onClick={() => setGroup(key)}
            >
              <span>{label}</span>
              <small>{GROUP_DESCRIPTIONS[key]}</small>
            </button>
          ))}
        </div>

        <div className="stats-summary-grid">
          <article><span>Tracked players</span><strong>{summary?.trackedPlayers ?? '—'}</strong></article>
          <article><span>Online now</span><strong>{summary?.onlinePlayers ?? '—'}</strong></article>
          <article><span>Kills recorded</span><strong>{summary?.totalKillsRecorded ?? '—'}</strong></article>
          <article><span>Tracked hours</span><strong>{summary ? totalHours : '—'}</strong></article>
        </div>

        <div className="stats-toolbar">
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
              <option value="time">Time tracked</option>
              <option value="matches">Matches seen</option>
              <option value="lastSeen">Last seen</option>
              <option value="name">Name</option>
            </select>
          </label>
        </div>

        {error && (
          <div className="stats-notice">
            <strong>Player stats are not connected yet.</strong>
            <p>{error}</p>
          </div>
        )}

        {!error && (
          <div className="stats-table-wrap">
            <table className="stats-table">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Status</th>
                  <th>Kills</th>
                  <th>Deaths</th>
                  <th>K/D</th>
                  <th>Matches</th>
                  <th>Tracked</th>
                  <th>Last Seen</th>
                </tr>
              </thead>
              <tbody>
                {players.map((player) => (
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
                    <td>{player.matchesSeen}</td>
                    <td>{formatDuration(player.secondsTracked)}</td>
                    <td>{formatLastSeen(player.lastSeen)}</td>
                  </tr>
                ))}
                {!loading && !players.length && (
                  <tr><td colSpan="8" className="stats-empty">No matching players found in {GROUP_LABELS[group]}.</td></tr>
                )}
              </tbody>
            </table>
            {loading && <div className="stats-loading">Loading player statistics…</div>}
          </div>
        )}

        {selectedPlayer && !error && (
          <article className="player-profile-card">
            <div className="player-profile-heading">
              <div>
                <p className="kicker">Player Profile // {GROUP_LABELS[group]}</p>
                <h2>{selectedPlayer.name}</h2>
                <p>{selectedPlayer.id}</p>
              </div>
              <button type="button" onClick={() => setSelectedId(null)}>Close</button>
            </div>

            <div className="player-profile-grid">
              <div><span>Kills</span><strong>{selectedPlayer.totalKills}</strong></div>
              <div><span>Deaths</span><strong>{selectedPlayer.totalDeaths}</strong></div>
              <div><span>K/D</span><strong>{selectedPlayer.kd}</strong></div>
              <div><span>Matches seen</span><strong>{selectedPlayer.matchesSeen}</strong></div>
              <div><span>Tracked time</span><strong>{formatDuration(selectedPlayer.secondsTracked)}</strong></div>
              <div><span>Peak kills / match</span><strong>{selectedPlayer.peakKillsInMatch}</strong></div>
              <div><span>Primary faction</span><strong>{primaryFaction(selectedPlayer)}</strong></div>
              <div><span>Servers played</span><strong>{serversPlayed(selectedPlayer)}</strong></div>
            </div>

            <div className="player-profile-meta">
              <p><span>First seen</span>{formatLastSeen(selectedPlayer.firstSeen)}</p>
              <p><span>Last seen</span>{formatLastSeen(selectedPlayer.lastSeen)}</p>
              <p><span>Known aliases</span>{selectedPlayer.aliases?.length ? selectedPlayer.aliases.join(', ') : 'None recorded'}</p>
            </div>
          </article>
        )}

        <p className="stats-footnote">
          Standard statistics include normal rotations across all 44th servers. WARCON automatically classifies a match as Hardcore when its live map or experience contains the Hardcore tag, regardless of which server is hosting it.
        </p>
      </section>
    </>
  )
}
