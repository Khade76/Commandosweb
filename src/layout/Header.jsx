import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { DISCORD_URL, images } from '../data/site.js'

export default function Header() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const location = useLocation()

  useEffect(() => setOpen(false), [location.pathname])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const active = ({ isActive }) => isActive ? 'active' : undefined

  return (
    <header className={`site-header ${scrolled ? 'scrolled' : ''}`}>
      <div className="shell nav-shell">
        <Link className="brand" to="/">
          <img src={images.mark} alt="44th mark" />
          <span><strong>44TH COMMANDO REGIMENT</strong><small>WARDOGS COMMUNITY</small></span>
        </Link>

        <button className="menu-toggle" type="button" aria-label="Toggle navigation" onClick={() => setOpen(!open)}>
          <span /><span /><span />
        </button>

        <nav className={open ? 'open' : ''}>
          <NavLink className={active} end to="/">Home</NavLink>
          <NavLink className={active} to="/about">About</NavLink>
          <NavLink className={active} to="/companies">Companies</NavLink>
          <NavLink className={active} to="/servers">Our Servers</NavLink>
          <NavLink className={active} to="/enlist">Enlist</NavLink>
          <NavLink className={active} to="/wardogs">WARDOGS</NavLink>
          <NavLink className={active} to="/donate">Donate</NavLink>
          <a className="discord-link" href={DISCORD_URL} target="_blank" rel="noreferrer">Join Discord</a>
        </nav>
      </div>
    </header>
  )
}
