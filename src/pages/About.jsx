import { images } from '../data/site.js'

export default function About() {
  return (
    <>
      <section className="page-hero" style={{ '--hero-image': `url(${images.wide})` }}>
        <div className="hero-overlay" />
        <div className="shell">
          <p className="kicker">About the 44th</p>
          <h1>Built for the chaos.<br /><em>Organised for the win.</em></h1>
          <p className="hero-copy">A WARDOGS regiment, the 44th way. Join an organisation built on a unified vision and culture.</p>
        </div>
      </section>
      <section className="section split">
        <div><p className="kicker">Our Mission</p><h2>The standard<br /><em>behind the name.</em></h2></div>
        <div className="copy-panel">
          <p>The 44th started on January 5th 2022 in a game called Holdfast: Nations at War. Ted had observed that at the time, there were too many who took the game far too seriously and exerted their power over others, and didn’t take the time to appreciate that actually, many just want to hop on and play with a friendly and low intensity community. Thus, the 44th was born.</p>
          <p>The 44th have been a no mandatory attendance, no skill requirements and no tolerance for discrimination of all backgrounds since day one. We're proud to say that’s now a part of our culture which thrives through people choosing the 44th and being enticed to play; not forced!</p>
          <p>Having made some of the largest events in the Holdfast community, moving on from our success in Squad, running the largest European English speaking community, we now run the largest servers in Wardogs as well. This is thanks to our friendly culture, incredible admin team and committed regiment members to make that experience consistent and unique.</p>
          <p>For our regiment, our exciting trainings, hard-working and competent officers, effective processes and vibrant community have been incredible throughout. We have our problems, but the good thing about the 44th is that we are all ready to talk about them. When communication breaks down, and our day to day activities no longer reflect the needs of what people want, then we identify and strategise together.</p>
        </div>
      </section>
      <section className="section cards-three">
        <article><span>01</span><h3>Community First</h3><p>Our community are at the core of what we do. We listen, learn and act on community feedback as our #1 goal.</p></article>
        <article><span>02</span><h3>Welcome to new players</h3><p>All are welcome. There are no skill requirements, and there is a lot of learning. We know that for some people it's their first day in the game and we have patience - whilst providing an engaging and exciting gameplay experience for veterans.</p></article>
        <article><span>03</span><h3>Always ahead of the curve</h3><p>We always have our ear to the ground. Upgrading our tech, using industry standard Discord and Community features, as well as bespoke bots to make what we do seamless.</p></article>
      </section>
    </>
  )
}
