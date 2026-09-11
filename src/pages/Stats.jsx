import { useEffect, useMemo, useState } from 'react'
import { images } from '../data/site.js'

const STATS_API_URL = import.meta.env.VITE_PLAYER_STATS_API_URL || '/api/player-stats.php'

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

export default function Stats() {
  const [players, setPlayers] = useState([])
  const [summary, setSummary] = useState(null)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('kills')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    const timer = window.setTimeout(async () => {
      setLoading(true)
      setError('')

      const params = new URLSearchParams({
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

  const totalHours = useMemo(() => {
    const seconds = Number(summary?.secondsTracked)
    return Number.isFinite(seconds) ? Math.round(seconds / 3600) : 0
  }, [summary])

  return (
    <>
      <section className="page-hero stats-hero" style={{ '--hero-image': `url(${images.hero})` }}>
        <div className="hero-overlay" />
        <div className="shell">
          <p className="kicker">44th Intelligence</p>
          <h1>Player<br /><em>Stats.</em></h1>
          <p className="hero-copy">Persistent WARDOGS player statistics collected from the 44th servers.</p>
        </div>
      </section>

      <section className="section stats-page">
        <div className="stats-summary-grid">
          <article><span>Tracked players</span><strong>{summary?.trackedPlayers ?? '—'}</strong></article>
          <article><span>Online now</span><strong>{summary?.onlinePlayers ?? '—'}</strong></article>
          <article><span>Kills recorded</span><strong>{summary?.totalKillsRecorded ?? '—'}</strong></article>
          <article><span>Tracked hours</span><strong>{summary ? totalHours : '—'}</strong></article>
        </div>

        <div className="stats-toolbar">
          <label>
            <span>Search player</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Player name or Steam ID" />
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
                  <tr key={player.id}>
                    <td>
                      <strong>{player.name}</strong>
                      {player.currentFaction && <small>{player.currentFaction}</small>}
                    </td>
                    <td><span className={`player-state ${player.online ? 'online' : 'offline'}`}>{player.online ? `Online${player.currentServer ? ` • #${player.currentServer}` : ''}` : 'Offline'}</span></td>
                    <td>{player.totalKills}</td>
                    <td>{player.totalDeaths}</td>
                    <td>{player.kd}</td>
                    <td>{player.matchesSeen}</td>
                    <td>{formatDuration(player.secondsTracked)}</td>
                    <td>{formatLastSeen(player.lastSeen)}</td>
                  </tr>
                ))}
                {!loading && !players.length && (
                  <tr><td colSpan="8" className="stats-empty">No matching players found.</td></tr>
                )}
              </tbody>
            </table>
            {loading && <div className="stats-loading">Loading player statistics…</div>}
          </div>
        )}

        <p className="stats-footnote">Statistics begin accumulating when the VPS collector is started. Kill/death totals are derived from successive live RCON player snapshots and match resets.</p>
      </section>
    </>
  )
}
