import { Link } from 'react-router-dom'
import { DISCORD_URL, STEAM_URL, images } from '../data/site.js'

const features = [
  ['01', 'Three-way war', 'Large battles built around three teams fighting for control of the battlefield.'],
  ['02', 'Destruction', 'A changing environment where the shape of the fight can shift around you.'],
  ['03', 'Combined arms', 'Infantry, vehicles, support and coordination all matter at scale.'],
  ['04', 'Community play', 'The 44th gives you reliable people to squad up with when the fight gets chaotic.'],
]

export default function Wardogs() {
  return (
    <>
      <section className="page-hero" style={{ '--hero-image': `url(${images.wide})` }}>
        <div className="hero-overlay" />
        <div className="shell"><p className="kicker">The Game</p><h1>Tactical<br /><em>all out warfare.</em></h1><p className="hero-copy">WARDOGS is the game this site is built around. The 44th exists to bring organised squads, clear comms and a strong community into that fight.</p><div className="actions"><a className="button primary" href={STEAM_URL} target="_blank" rel="noreferrer">WARDOGS on Steam ↗</a><a className="button" href={DISCORD_URL} target="_blank" rel="noreferrer">Play with the 44th ↗</a></div></div>
      </section>
      <section className="section cards-four">{features.map(([n, title, copy]) => <article key={title}><span>{n}</span><h3>{title}</h3><p>{copy}</p></article>)}</section>
      <section className="section split"><div><p className="kicker">Next step</p><h2>Ready to join<br /><em>the regiment?</em></h2></div><div className="copy-panel"><p>Join Discord, choose your company and keep an eye on the Our Servers page as WARDOGS server information becomes available.</p><div className="inline-links"><Link to="/enlist">Enlist →</Link><Link to="/servers">Our Servers →</Link></div></div></section>
    </>
  )
}
