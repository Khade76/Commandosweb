import { useEffect, useState } from 'react'

const DISCORD_URL = 'https://discord.gg/44thwardogs'
const STEAM_URL = 'https://store.steampowered.com/app/1867240/WARDOGS/'

const images = {
  mark: 'https://lh3.googleusercontent.com/d/1VCsdHm2Ag5tIG5RNERBhJwUKS8K4r4P8',
  patch: 'https://lh3.googleusercontent.com/d/1vZThLLplk_Hzg-oqS8oEMwCJ4srVH7bT',
  banner: 'https://lh3.googleusercontent.com/d/1uMeXEeZMNtNiAK4ZQCBybt71B9ZKqHY5',
}

const principles = [
  {
    number: '01',
    icon: '◎',
    title: 'Teamwork First',
    description: 'Play your role, back your squad and make decisions that help the wider team.',
  },
  {
    number: '02',
    icon: '⌁',
    title: 'Clear Comms',
    description: 'Useful information, concise callouts and leaders who keep the plan understandable.',
  },
  {
    number: '03',
    icon: '⟁',
    title: 'Community',
    description: 'A regiment people want to return to — organised in-game and welcoming out of it.',
  },
]

const companies = [
  {
    key: 'vanguard',
    number: '01',
    tag: 'FORWARD // DECISIVE',
    name: 'Vanguard',
    description: 'For players who thrive on momentum, coordinated pushes and turning pressure into progress.',
    watermark: 'V',
    delay: '',
  },
  {
    key: 'spectre',
    number: '02',
    tag: 'ADAPTIVE // PRECISE',
    name: 'Spectre',
    description: 'For players who value awareness, positioning, flexibility and acting on good information.',
    watermark: 'S',
    delay: 'delay-1',
  },
  {
    key: 'spartan',
    number: '03',
    tag: 'DISCIPLINED // RELIABLE',
    name: 'Spartan',
    description: 'For players who bring staying power, discipline and dependable support when the fight gets difficult.',
    watermark: 'S',
    delay: 'delay-2',
  },
]

const enlistmentSteps = [
  {
    number: '01',
    title: 'Join the Discord',
    description: 'Enter the 44th WARDOGS community and get access to the latest information.',
  },
  {
    number: '02',
    title: 'Choose your company',
    description: 'Meet Vanguard, Spectre and Spartan and find the group that suits you.',
  },
  {
    number: '03',
    title: 'Deploy with the regiment',
    description: 'Squad up, communicate and fight alongside the wider 44th.',
  },
]

function ExternalLink({ href, className = '', children }) {
  return (
    <a className={className} href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  )
}

function App() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 18)
    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    document.body.classList.toggle('menu-open', menuOpen)
    return () => document.body.classList.remove('menu-open')
  }, [menuOpen])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible')
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.13, rootMargin: '0px 0px -40px 0px' },
    )

    document.querySelectorAll('.reveal').forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [])

  const closeMenu = () => setMenuOpen(false)

  return (
    <>
      <div className="noise" aria-hidden="true" />

      <header className={`site-header${scrolled ? ' scrolled' : ''}`} id="top">
        <div className="header-inner shell">
          <a className="brand" href="#home" aria-label="44th Commando Regiment home" onClick={closeMenu}>
            <img src={images.mark} alt="44th Commandos mark" />
            <span className="brand-copy">
              <strong>44TH COMMANDO REGIMENT</strong>
              <small>WARDOGS COMMUNITY</small>
            </span>
          </a>

          <button
            className="menu-toggle"
            type="button"
            aria-expanded={menuOpen}
            aria-controls="main-nav"
            aria-label="Toggle navigation"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span />
            <span />
            <span />
          </button>

          <nav className={`main-nav${menuOpen ? ' open' : ''}`} id="main-nav" aria-label="Primary navigation">
            <a href="#about" onClick={closeMenu}>About</a>
            <a href="#companies" onClick={closeMenu}>Companies</a>
            <a href="#join" onClick={closeMenu}>Enlist</a>
            <ExternalLink href={STEAM_URL}>WARDOGS</ExternalLink>
            <ExternalLink className="nav-discord" href={DISCORD_URL}>Join Discord</ExternalLink>
          </nav>
        </div>
      </header>

      <main>
        <section className="hero" id="home" aria-labelledby="hero-title">
          <div className="hero-media" aria-hidden="true" />
          <div className="hero-grid" aria-hidden="true" />
          <div className="hero-vignette" aria-hidden="true" />

          <div className="shell hero-inner">
            <div className="hero-copy reveal">
              <div className="eyebrow"><span /> 44TH COMMANDO REGIMENT // WARDOGS</div>
              <h1 id="hero-title">MOVE AS ONE.<br /><em>HIT LIKE 44.</em></h1>
              <p>
                A UK-led WARDOGS community built for players who want communication,
                coordinated teamwork and organised large-scale combat without losing the fun.
              </p>
              <div className="hero-actions">
                <ExternalLink className="button button-primary" href={DISCORD_URL}>
                  <span>Enlist on Discord</span>
                  <span className="button-arrow">↗</span>
                </ExternalLink>
                <a className="button button-ghost" href="#companies">Explore companies</a>
              </div>
            </div>

            <aside className="hero-card reveal delay-1" aria-label="44th Regiment identity">
              <img src={images.patch} alt="44th Commandos patch" />
              <div>
                <span className="micro">REGIMENT STRUCTURE</span>
                <strong>VANGUARD // SPECTRE // SPARTAN</strong>
                <p>Three companies. One regiment. One standard.</p>
              </div>
            </aside>
          </div>

          <a className="scroll-cue" href="#about" aria-label="Scroll to about section">
            <span>SCROLL</span>
            <i />
          </a>
        </section>

        <section className="facts-strip" aria-label="WARDOGS game format">
          <div className="shell facts-grid">
            <div><strong>100</strong><span>PLAYER BATTLES</span></div>
            <div><strong>3</strong><span>TEAMS</span></div>
            <div><strong>1</strong><span>CONTROL ZONE</span></div>
            <div><strong>44</strong><span>ONE REGIMENT</span></div>
          </div>
        </section>

        <section className="section mission" id="about">
          <div className="shell mission-grid">
            <div className="section-heading reveal">
              <div className="eyebrow"><span /> OUR MISSION</div>
              <h2>Built for the chaos.<br /><em>Organised for the win.</em></h2>
            </div>

            <div className="mission-copy reveal delay-1">
              <p className="lead">
                WARDOGS rewards decisions, communication and teamwork. The 44th is built around the same idea:
                make the call, support the team, and keep moving the fight forward.
              </p>
              <p>
                Whether you are pushing the zone, providing transport, supporting a squad or holding the line,
                there is a place in the regiment for players who want to contribute and improve together.
              </p>
            </div>
          </div>

          <div className="shell principles-grid">
            {principles.map((principle, index) => (
              <article className={`principle reveal${index === 1 ? ' delay-1' : index === 2 ? ' delay-2' : ''}`} key={principle.title}>
                <span className="principle-number">{principle.number}</span>
                <div className="principle-icon">{principle.icon}</div>
                <h3>{principle.title}</h3>
                <p>{principle.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section image-break" aria-label="44th Commandos in action">
          <div className="image-break-overlay" />
          <div className="shell image-break-copy reveal">
            <span className="micro">TACTICAL // COMBINED ARMS // PLAYER DRIVEN</span>
            <blockquote>“EVERY DECISION MATTERS. MAKE YOURS COUNT.”</blockquote>
          </div>
        </section>

        <section className="section companies" id="companies">
          <div className="shell">
            <div className="companies-head reveal">
              <div className="section-heading">
                <div className="eyebrow"><span /> REGIMENT COMPANIES</div>
                <h2>Find your company.<br /><em>Earn your place.</em></h2>
              </div>
              <p>Each company has its own identity, but every member fights under the same 44th standard.</p>
            </div>

            <div className="company-grid">
              {companies.map((company) => (
                <article className={`company-card company-${company.key} reveal ${company.delay}`.trim()} key={company.key}>
                  <div className="company-art" aria-hidden="true" />
                  <div className="company-shade" aria-hidden="true" />
                  <div className="company-watermark" aria-hidden="true">{company.watermark}</div>
                  <div className="company-content">
                    <div className="company-topline"><span>{company.number}</span><span>{company.tag}</span></div>
                    <h3>{company.name} <em>Company</em></h3>
                    <p>{company.description}</p>
                    <ExternalLink href={DISCORD_URL}>Join {company.name} <span>↗</span></ExternalLink>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section enlist" id="join">
          <div className="shell enlist-grid">
            <div className="enlist-image reveal">
              <img src={images.banner} alt="44th Commandos operators" />
              <div className="enlist-stamp">
                <img src={images.mark} alt="" aria-hidden="true" />
                <span>READY TO DEPLOY</span>
              </div>
            </div>

            <div className="enlist-copy reveal delay-1">
              <div className="eyebrow"><span /> ENLISTMENT</div>
              <h2>Join the 44th.<br /><em>Get into the fight.</em></h2>
              <ol className="steps">
                {enlistmentSteps.map((step) => (
                  <li key={step.number}>
                    <span>{step.number}</span>
                    <div><strong>{step.title}</strong><p>{step.description}</p></div>
                  </li>
                ))}
              </ol>
              <ExternalLink className="button button-primary button-wide" href={DISCORD_URL}>
                <span>discord.gg/44thwardogs</span><span className="button-arrow">↗</span>
              </ExternalLink>
            </div>
          </div>
        </section>

        <section className="final-cta">
          <div className="final-bg" aria-hidden="true" />
          <div className="final-overlay" aria-hidden="true" />
          <div className="shell final-inner reveal">
            <img src={images.mark} alt="44th Commandos" />
            <div>
              <span className="micro">44TH COMMANDO REGIMENT // WARDOGS</span>
              <h2>YOUR SQUAD IS WAITING.</h2>
              <p>Vanguard. Spectre. Spartan. Pick your company and join the regiment.</p>
            </div>
            <ExternalLink className="button button-primary" href={DISCORD_URL}>
              <span>Join the Discord</span><span className="button-arrow">↗</span>
            </ExternalLink>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="shell footer-grid">
          <div className="footer-brand">
            <img src={images.mark} alt="44th Commandos mark" />
            <div><strong>44TH COMMANDO REGIMENT</strong><span>WARDOGS COMMUNITY</span></div>
          </div>
          <div className="footer-links">
            <a href="#about">About</a>
            <a href="#companies">Companies</a>
            <ExternalLink href={DISCORD_URL}>Discord</ExternalLink>
            <ExternalLink href={STEAM_URL}>WARDOGS on Steam</ExternalLink>
          </div>
          <div className="footer-note">
            <span>COMMUNITY WEBSITE</span>
            <p>Not affiliated with BULKHEAD or Team17.</p>
          </div>
        </div>
        <div className="shell footer-bottom">
          <span>© {new Date().getFullYear()} 44th Commando Regiment</span>
          <a href="#top">Back to top ↑</a>
        </div>
      </footer>
    </>
  )
}

export default App
