import { Link, useParams } from 'react-router-dom'
import { DISCORD_URL, companies, images } from '../data/site.js'

export default function Company() {
  const { companyKey } = useParams()
  const company = companies.find((item) => item.key === companyKey)

  if (!company) {
    return <section className="not-found shell"><h1>Unknown <em>Company.</em></h1><p>That company does not exist.</p><Link className="button primary" to="/companies">Back to companies</Link></section>
  }

  return (
    <>
      <section className="page-hero" style={{ '--hero-image': `url(${images.hero})` }}>
        <div className="hero-overlay" />
        <div className="shell">
          <p className="kicker">{company.name} Company</p>
          <h1>{company.name}<br /><em>Company.</em></h1>
          <p className="hero-copy">{company.description}</p>
          <div className="actions"><a className="button primary" href={DISCORD_URL} target="_blank" rel="noreferrer">Speak to {company.name} ↗</a><Link className="button" to="/companies">All companies</Link></div>
        </div>
      </section>
      <section className="section split">
        <div className="company-symbol"><span>{company.watermark}</span><img src={images.patch} alt="44th patch" /></div>
        <div className="copy-panel"><p className="kicker">{company.tag}</p><h2>{company.name}<br /><em>at a glance.</em></h2><p>{company.detail}</p><div className="focus-grid">{company.focus.map((focus) => <span key={focus}>{focus}</span>)}</div></div>
      </section>
    </>
  )
}
