import { useEffect, useState } from 'react'
import { DISCORD_URL, STEAM_LAUNCH_URL, images, servers as fallbackServers } from '../data/site.js'
import './servers-extra.css'

const SERVERS_API_URL = import.meta.env.VITE_SERVERS_API_URL
  || (import.meta.env.PROD ? '/api/servers.php' : '/api/servers')

const WARCON_MAP_ART_BASE = 'https://raw.githubusercontent.com/warcon-app/warcon/main/static/maps'
const MAP_ART_DIRECTORIES = Object.freeze({
  Kavkazi: 'Kavkazi',
  Bakurani: 'Kavkazi',
  Europe: 'Europe',
  Ozeti: 'Europe',
  NorthAmerica: 'NorthAmerica',
  Zestafona: 'NorthAmerica',
})
const MAP_ART_LIGHTING = new Set([
  'DayStartClear',
  'DayEarlyClear',
  'DayEarlyFog',
  'DayClear',
  'DayLateClear',
  'DayLateGray',
  'DayLateGrayFog',
  'DayEndClear',
])

const FACTIONS = [
  { key: 'valkyra', label: 'Valkyra', icon: '/assets/factions/valkyra.png' },
  { key: 'lonestar', label: 'Lonestar', icon: '/assets/factions/lonestar.png' },
  { key: 'manticore', label: 'Manticore', icon: '/assets/factions/manticore.png' },
]

function formatScore(score) {
  return Number.isFinite(score) ? score : '—'
}

function statusTone(status) {
  const value = String(status || '').trim().toLowerCase()
  if (value.startsWith('online') || value === 'running') return 'online'
  if (['starting', 'booting', 'installing', 'restarting'].includes(value)) return 'starting'
  return 'offline'
}

function mapArtSources(server) {
  const map = String(server?.map || '').trim()
  const directory = MAP_ART_DIRECTORIES[map]
  if (!directory) return null

  const requestedLighting = String(server?.lighting || '').trim()
  const lighting = MAP_ART_LIGHTING.has(requestedLighting) ? requestedLighting : 'DayClear'
  const base = `${WARCON_MAP_ART_BASE}/${encodeURIComponent(directory)}`

  return {
    primary: `${base}/${encodeURIComponent(lighting)}-720.webp`,
    fallback: lighting === 'DayClear' ? '' : `${base}/DayClear-720.webp`,
    alt: `${map} WARDOGS map preview${server?.lighting ? ` — ${server.lighting}` : ''}`,
  }
}

function ServerMapArt({ server }) {
  const art = mapArtSources(server)
  if (!art) return null

  function handleImageError(event) {
    const image = event.currentTarget
    const fallback = image.dataset.fallback

    if (fallback) {
      image.dataset.fallback = ''
      image.src = fallback
      return
    }

    image.closest('.server-map-art')?.setAttribute('hidden', '')
  }

  return (
    <figure className="server-map-art">
      <img
        src={art.primary}
        data-fallback={art.fallback}
        alt={art.alt}
        loading="lazy"
        onError={handleImageError}
      />
      <figcaption>
        <span>{server.map}</span>
        {server.lighting && <span>{server.lighting}</span>}
        <small>Map imagery © BULKHEAD · mirrored by WARCON</small>
      </figcaption>
    </figure>
  )
}

function mergeServerDirectory(liveServers) {
  const live = Array.isArray(liveServers) ? liveServers : []
  const liveIds = new Set(live.map((server) => server?.id).filter(Boolean))
  const missingFallbacks = fallbackServers.filter((server) => !server?.id || !liveIds.has(server.id))
  return [...live, ...missingFallbacks]
}

function copyText(value) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value)

  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  textarea.remove()
  return Promise.resolve()
}

export default function Servers() {
  const [servers, setServers] = useState(fallbackServers)
  const [copiedJoinId, setCopiedJoinId] = useState(null)

  useEffect(() => {
    let cancelled = false

    function refreshServers() {
      fetch(SERVERS_API_URL, { cache: 'no-store' })
        .then((response) => response.ok ? response.json() : null)
        .then((data) => {
          if (!cancelled && Array.isArray(data?.servers)) setServers(mergeServerDirectory(data.servers))
        })
        .catch(() => {})
    }

    refreshServers()
    const refreshTimer = window.setInterval(refreshServers, 30_000)

    return () => {
      cancelled = true
      window.clearInterval(refreshTimer)
    }
  }, [])

  function copyJoinId(joinId) {
    if (!joinId) return
    copyText(String(joinId))
      .then(() => {
        setCopiedJoinId(String(joinId))
        window.setTimeout(() => setCopiedJoinId((current) => current === String(joinId) ? null : current), 2500)
      })
      .catch(() => {})
  }

  return (
    <>
      <section className="page-hero" style={{ '--hero-image': `url(${images.hero})` }}>
        <div className="hero-overlay" />
        <div className="shell">
          <p className="kicker">44th Network</p>
          <h1>Our<br /><em>Servers.</em></h1>
          <p className="hero-copy">Live 44th WARDOGS server status, player population, current battlefield information and match scores.</p>
          <div className="actions"><a className="button primary" href={DISCORD_URL} target="_blank" rel="noreferrer">Server updates on Discord ↗</a></div>
        </div>
      </section>
      <section className="section">
        <p className="kicker">Server Directory</p>
        <h2>Find the 44th.<br /><em>Join the fight.</em></h2>
        <p className="section-copy">The server directory is connected to the 44th backend and displays live information supplied directly by WARDOGS RCON.</p>
        <div className="server-grid">
          {servers.map((server) => {
            const tone = statusTone(server.status)
            return (
              <article className="server-card" key={server.id || server.name}>
                <div className="server-top">
                  <span className={`server-status server-status-${tone}`}>
                    <i className="server-status-dot" aria-hidden="true" />
                    {server.status}
                  </span>
                  <small>{server.region}</small>
                </div>
                <h3>{server.name}</h3>
                <ServerMapArt server={server} />
                <div className="server-stats">
                  <div><span>Players</span><strong>{server.players}</strong></div>
                  <div><span>Map</span><strong>{server.map}</strong></div>
                  <div><span>Mode</span><strong>{server.mode}</strong></div>
                </div>
                {server.joinId && (
                  <div className="actions server-actions">
                    <a className="button primary" href={STEAM_LAUNCH_URL} onClick={() => copyJoinId(server.joinId)}>Join Server</a>
                    <button className="button" type="button" onClick={() => copyJoinId(server.joinId)}>{copiedJoinId === String(server.joinId) ? 'Copied' : 'Copy Join ID'}</button>
                  </div>
                )}
                {server.scores && (
                  <>
                    <small>Current faction score</small>
                    <div className="faction-score-list">
                      {FACTIONS.map((faction) => (
                        <div className={`faction-score faction-${faction.key}`} key={faction.key}>
                          <div className="faction-label">
                            <img src={faction.icon} alt="" aria-hidden="true" />
                            <span>{faction.label}</span>
                          </div>
                          <strong>{formatScore(server.scores[faction.key])}</strong>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                {server.address && <p>{server.address}</p>}
                <small>{server.notes}</small>
              </article>
            )
          })}
        </div>
      </section>
      <section className="section cards-three">
        <article><span>JOIN</span><h3>Join Server</h3><p>Use the Join Server button to launch WARDOGS through Steam and copy the correct server ID automatically.</p></article>
        <article><span>MATCH</span><h3>Map & scores</h3><p>Current map, matching map artwork and Valkyra, Lonestar and Manticore scores are pulled from the live WARDOGS status.</p></article>
        <article><span>OPS</span><h3>Built to expand</h3><p>The server API is structured so additional hosts and WARDOGS services can be added without rebuilding this page.</p></article>
      </section>
    </>
  )
}
