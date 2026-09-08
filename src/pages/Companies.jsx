import { Link } from 'react-router-dom'
import { DISCORD_URL, companies, images } from '../data/site.js'

export default function Companies() {
  return (
    <>
      <section className="page-hero" style={{ '--hero-image': `url(${images.hero})` }}>
        <div className="hero-overlay" />
        <div className="shell">
          <p className="kicker">Regiment Companies</p>
          <h1>Find your company.<br /><em>Earn your place.</em></h1>
          <p className="hero-copy">Vanguard, Spectre and Spartan operate under one 44th standard while keeping their own identity.</p>
        </div>
      </section>
      <section className="section company-list">
        {companies.map((company) => (
          <article className="company-row" key={company.key}>
            <img className="company-list-logo" src={company.logo} alt={`${company.name} Company logo`} width="1000" height="1000" loading="lazy" />
            <div>
              <p className="kicker">{company.tag}</p>
              <h2>{company.name} <em>Company</em></h2>
              <p>{company.detail}</p>
              <div className="inline-links"><Link to={`/companies/${company.key}`}>Open {company.name} page →</Link><a href={DISCORD_URL} target="_blank" rel="noreferrer">Join on Discord ↗</a></div>
            </div>
          </article>
        ))}
      </section>
    </>
  )
}
