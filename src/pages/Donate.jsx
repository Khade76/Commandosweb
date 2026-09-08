import { DONATE_URL, DISCORD_URL, images } from '../data/site.js'

export default function Donate() {
  return (
    <>
      <section className="page-hero" style={{ '--hero-image': `url(${images.banner})` }}>
        <div className="hero-overlay" />
        <div className="shell">
          <p className="kicker">Support the 44th</p>
          <h1>Donate to<br /><em>44th WARDOGS.</em></h1>
          <p className="hero-copy">Support community hosting, events and future WARDOGS server costs through Ko-fi.</p>
          <div className="actions"><a className="button primary" href={DONATE_URL} target="_blank" rel="noreferrer">Open Ko-fi ↗</a><a className="button" href={DISCORD_URL} target="_blank" rel="noreferrer">Ask on Discord ↗</a></div>
        </div>
      </section>
      <section className="section split"><div><p className="kicker">Ko-fi</p><h2>Community funded.<br /><em>Community focused.</em></h2></div><div className="copy-panel"><p>The Donate button points to the official 44th WARDOGS Ko-fi page.</p><p><a href={DONATE_URL} target="_blank" rel="noreferrer">{DONATE_URL}</a></p></div></section>
    </>
  )
}
