import { useEffect, useState } from 'react'
import { DISCORD_URL, images, servers as fallbackServers } from '../data/site.js'

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
          <p className="hero-copy">A dedicated home for 44th WARDOGS server status, connection details, rules and administration information.</p>
          <div className="actions"><a className="button primary" href={DISCORD_URL} target="_blank" rel="noreferrer">Server updates on Discord ↗</a></div>
        </div>
      </section>
      <section className="section">
        <p className="kicker">Server Directory</p>
        <h2>Find the 44th.<br /><em>Join the fight.</em></h2>
        <p className="section-copy">This page is data-ready. When WARDOGS server query details are available, these cards can show live status, players, current map, whitelist state and join information.</p>
        <div className="server-grid">
          {servers.map((server) => (
            <article className="server-card" key={server.id || server.name}>
              <div className="server-top"><span>{server.status}</span><small>{server.region}</small></div>
              <h3>{server.name}</h3>
              <div className="server-stats"><div><span>Players</span><strong>{server.players}</strong></div><div><span>Map</span><strong>{server.map}</strong></div><div><span>Mode</span><strong>{server.mode}</strong></div></div>
              <p>{server.address}</p><small>{server.notes}</small>
            </article>
          ))}
        </div>
      </section>
      <section className="section cards-three">
        <article><span>API</span><h3>Live status</h3><p>Ready for online/offline state, player count, current map and round information.</p></article>
        <article><span>JOIN</span><h3>Access & whitelist</h3><p>Server names, join instructions, whitelist notes and event passwords can be shown here.</p></article>
        <article><span>OPS</span><h3>Rules & admin</h3><p>Future home for rules, admin contacts, restart schedules and maintenance notices.</p></article>
      </section>
    </>
  )
}
