import { Link } from 'react-router-dom'
import { DISCORD_URL, DONATE_URL, companies, images } from '../data/site.js'

function CompanyCard({ company }) {
  return (
    <article className={`company-card company-${company.key}`}>
      <div className="company-topline"><span>{company.number}</span><span>{company.tag}</span></div>
      <img className="company-card-logo" src={company.logo} alt={`${company.name} Company logo`} width="1000" height="1000" loading="lazy" />
      <h3>{company.name} <em>Company</em></h3>
      <p>{company.description}</p>
      <Link to={`/companies/${company.key}`}>View company →</Link>
    </article>
  )
}

export default function Home() {
  return (
    <>
      <section className="hero" style={{ '--hero-image': `url(${images.hero})` }}>
        <div className="hero-overlay" />
        <div className="shell hero-inner">
          <div>
            <p className="kicker">44TH COMMANDO REGIMENT // WARDOGS</p>
            <h1>Move as one.<br /><em>Hit like 44.</em></h1>
            <p className="hero-copy">A UK-led WARDOGS community built for players who want communication, coordinated teamwork and organised large-scale combat without losing the fun.</p>
            <div className="actions">
              <a className="button primary" href={DISCORD_URL} target="_blank" rel="noreferrer">Enlist on Discord ↗</a>
              <Link className="button" to="/servers">Our Servers</Link>
              <a className="button" href={DONATE_URL} target="_blank" rel="noreferrer">Skip the queue</a>
            </div>
          </div>
          <aside className="identity-card">
            <img src={images.patch} alt="44th Commando Regiment patch" />
            <span>Regiment Structure</span>
            <strong>Vanguard // Spectre // Spartan</strong>
          </aside>
        </div>
      </section>

      <section className="stats-strip">
        <div><strong>100</strong><span>Player Battles</span></div>
        <div><strong>3</strong><span>Teams</span></div>
        <div><strong>1</strong><span>Control Zone</span></div>
        <div><strong>44</strong><span>One Regiment</span></div>
      </section>

      <section className="section split">
        <div>
          <p className="kicker">Who we are</p>
          <h2>Built for community.<br /><em>Forged in WARDOGS.</em></h2>
        </div>
        <div className="copy-panel">
          <p>The 44th brings structure and teamwork to WARDOGS without turning the game into a second job. Communicate clearly, play the objective and build a community people enjoy being part of.</p>
          <div className="inline-links"><Link to="/about">About →</Link><Link to="/companies">Companies →</Link><Link to="/servers">Our Servers →</Link></div>
        </div>
      </section>

      <section className="section">
        <p className="kicker">Regiment Companies</p>
        <h2>Three companies.<br /><em>One 44th.</em></h2>
        <div className="company-grid">{companies.map((company) => <CompanyCard company={company} key={company.key} />)}</div>
      </section>
    </>
  )
}
