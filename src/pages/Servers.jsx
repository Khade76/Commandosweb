import { useEffect, useState } from 'react'
import { DISCORD_URL, images, servers as fallbackServers } from '../data/site.js'

function formatScore(score) {
  return Number.isFinite(score) ? score : '—'
}

export default function Servers() {
  const [servers, setServers] = useState(fallbackServers)

  useEffect(() => {
    let cancelled = false
    fetch('/api/servers')
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (!cancelled && Array.isArray(data?.servers)) setServers(data.servers)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

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
        <p className="section-copy">The server directory is connected to the 44th backend and is ready to display live information supplied by our hosting and WARDOGS integrations.</p>
        <div className="server-grid">
          {servers.map((server) => (
            <article className="server-card" key={server.id || server.name}>
              <div className="server-top"><span>{server.status}</span><small>{server.region}</small></div>
              <h3>{server.name}</h3>
              <div className="server-stats">
                <div><span>Players</span><strong>{server.players}</strong></div>
                <div><span>Map</span><strong>{server.map}</strong></div>
                <div><span>Mode</span><strong>{server.mode}</strong></div>
              </div>
              {server.scores && (
                <>
                  <small>Current faction score</small>
                  <div className="server-stats">
                    <div><span>Valkyra</span><strong>{formatScore(server.scores.valkyra)}</strong></div>
                    <div><span>Lonestar</span><strong>{formatScore(server.scores.lonestar)}</strong></div>
                    <div><span>Manticore</span><strong>{formatScore(server.scores.manticore)}</strong></div>
                  </div>
                </>
              )}
              {server.address && <p>{server.address}</p>}
              <small>{server.notes}</small>
            </article>
          ))}
        </div>
      </section>
      <section className="section cards-three">
        <article><span>LIVE</span><h3>Server status</h3><p>Online state and player population are supplied through the secure server-side integration.</p></article>
        <article><span>MATCH</span><h3>Map & scores</h3><p>Current map and Valkyra, Lonestar and Manticore scores appear when the game/server interface exposes them.</p></article>
        <article><span>OPS</span><h3>Built to expand</h3><p>The backend is structured so WARDOGS RCON and additional hosts can be added without rebuilding this page.</p></article>
      </section>
    </>
  )
}
