import { images } from '../data/site.js'

export default function About() {
  return (
    <>
      <section className="page-hero" style={{ '--hero-image': `url(${images.wide})` }}>
        <div className="hero-overlay" />
        <div className="shell">
          <p className="kicker">About the 44th</p>
          <h1>Built for the chaos.<br /><em>Organised for the win.</em></h1>
          <p className="hero-copy">A WARDOGS regiment centred on teamwork, communication, community and organised play.</p>
        </div>
      </section>
      <section className="section split">
        <div><p className="kicker">Our Mission</p><h2>The standard<br /><em>behind the name.</em></h2></div>
        <div className="copy-panel"><p>WARDOGS rewards decisions, communication and teamwork. The 44th is built around the same idea: make the call, support the team and keep moving the fight forward.</p><p>Whether you are pushing the zone, providing transport, supporting a squad or holding the line, there is a place in the regiment for players who want to contribute and improve together.</p></div>
      </section>
      <section className="section cards-three">
        <article><span>01</span><h3>Teamwork First</h3><p>Play your role, back your squad and make decisions that help the wider team.</p></article>
        <article><span>02</span><h3>Clear Comms</h3><p>Useful information, concise callouts and leaders who keep the plan understandable.</p></article>
        <article><span>03</span><h3>Community</h3><p>A regiment people want to return to — organised in-game and welcoming out of it.</p></article>
      </section>
    </>
  )
}
