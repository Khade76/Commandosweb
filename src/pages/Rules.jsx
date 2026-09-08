import { DISCORD_URL, images } from '../data/site.js'
import { ruleSections } from '../data/rules.js'

export default function Rules() {
  return (
    <>
      <section className="page-hero rules-hero" style={{ '--hero-image': `url(${images.wide})` }}>
        <div className="hero-overlay" />
        <div className="shell">
          <p className="kicker">44th Community Standards</p>
          <h1>Our community.<br /><em>Our rules.</em></h1>
          <p className="hero-copy">Help keep the 44th a place people enjoy returning to. Read the community rules before joining the conversation or the fight.</p>
          <div className="actions"><a className="button primary" href="#general">Read the rules ↓</a><a className="button" href={DISCORD_URL} target="_blank" rel="noreferrer">Contact staff on Discord ↗</a></div>
        </div>
      </section>

      <section className="section rules-content" aria-labelledby="rules-heading">
        <p className="kicker">Respect the people you play with</p>
        <h2 id="rules-heading">Server &amp;<br /><em>community rules.</em></h2>
        <p className="section-copy">General rules are listed below. Game-specific rules have not been published; the additional sections are reserved for future updates.</p>
        <div className="rules-sections">
          {ruleSections.map((section, index) => (
            <details className="rules-category" id={section.id} key={section.id} open={section.id === 'general'}>
              <summary>
                <span className="rules-category-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                <span className="rules-category-title">{section.title}</span>
                <span className="rules-status">{section.rules.length ? `${section.rules.length} rules` : 'Not published'}</span>
              </summary>
              <div className="rules-category-body">
                <p>{section.description}</p>
                {section.rules.length > 0 && (
                  <ol className="rules-list">
                    {section.rules.map((rule) => <li key={rule.title}><h3>{rule.title}</h3><p>{rule.text}</p></li>)}
                  </ol>
                )}
              </div>
            </details>
          ))}
        </div>
        <aside className="rules-help">
          <h3>Need a hand?</h3>
          <p>Contact the staff team on Discord to report a concern or ask about a rule. Include relevant details and any evidence, and keep personal information out of public channels.</p>
          <a className="button" href={DISCORD_URL} target="_blank" rel="noreferrer">Open Discord ↗</a>
        </aside>
      </section>
    </>
  )
}
