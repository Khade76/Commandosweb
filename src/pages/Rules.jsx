import { DISCORD_URL, images } from '../data/site.js'
import { adminNotice, ruleSections } from '../data/rules.js'

function RuleParagraph({ text, emphasis }) {
  const emphasisStart = emphasis ? text.indexOf(emphasis) : -1

  if (emphasisStart === -1) return <p>{text}</p>

  return (
    <p>
      {text.slice(0, emphasisStart)}
      <strong>{emphasis}</strong>
      {text.slice(emphasisStart + emphasis.length)}
    </p>
  )
}

export default function Rules() {
  return (
    <>
      <section className="page-hero rules-hero" style={{ '--hero-image': `url(${images.wide})` }}>
        <div className="hero-overlay" />
        <div className="shell">
          <p className="kicker">44th Community Standards</p>
          <h1>Our community.<br /><em>Our rules.</em></h1>
          <p className="hero-copy">Help keep the 44th a place people enjoy returning to. Read the community, general and gameplay rules before joining the conversation or the fight.</p>
          <div className="actions"><a className="button primary" href="#rules-heading">Read the rules ↓</a><a className="button" href={DISCORD_URL} target="_blank" rel="noreferrer">Contact staff on Discord ↗</a></div>
        </div>
      </section>

      <section className="section rules-content" aria-labelledby="rules-heading">
        <p className="kicker">Respect the people you play with</p>
        <h2 id="rules-heading">44th Community,<br /><em>General &amp; Gameplay Rules</em></h2>
        <p className="rules-notice"><strong>{adminNotice}</strong></p>
        <div className="rules-sections">
          {ruleSections.map((section, index) => (
            <details className="rules-category" id={section.id} key={section.id} open={section.id === 'community'}>
              <summary>
                <span className="rules-category-number">{index + 1}.</span>
                <span className="rules-category-title">{section.title}</span>
                {section.rules && <span className="rules-status">{section.rules.length} rules</span>}
              </summary>
              <div className="rules-category-body">
                {section.rules && (
                  <ol className="rules-list" role="list">
                    {section.rules.map((rule) => (
                      <li key={rule.number}>
                        <h3><span className="rule-number">{rule.number}</span> {rule.title}</h3>
                        {rule.paragraphs.map((text) => <RuleParagraph key={text} text={text} emphasis={rule.emphasis} />)}
                      </li>
                    ))}
                  </ol>
                )}
                {section.introduction && <p>{section.introduction}</p>}
                {section.actions && (
                  <>
                    <p>{section.actionsIntroduction}</p>
                    <ul className="rules-enforcement-actions">
                      {section.actions.map((action) => <li key={action}>{action}</li>)}
                    </ul>
                  </>
                )}
                {section.paragraphs?.map((text) => <p key={text}>{text}</p>)}
                {section.agreement && <p className="rules-agreement"><strong>{section.agreement}</strong></p>}
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
