import { Link } from 'react-router-dom'
import { DISCORD_URL, DONATE_URL, STEAM_URL, images } from '../data/site.js'

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="shell footer-grid">
        <div className="footer-brand"><img src={images.mark} alt="44th mark" /><div><strong>44TH COMMANDO REGIMENT</strong><span>WARDOGS COMMUNITY</span></div></div>
        <div className="footer-links"><Link to="/about">About</Link><Link to="/companies">Companies</Link><Link to="/servers">Our Servers</Link><Link to="/enlist">Enlist</Link><Link to="/wardogs">WARDOGS</Link><a href={DONATE_URL} target="_blank" rel="noreferrer">Donate</a><a href={DISCORD_URL} target="_blank" rel="noreferrer">Discord</a><a href={STEAM_URL} target="_blank" rel="noreferrer">Steam</a></div>
        <div className="footer-note"><span>COMMUNITY WEBSITE</span><p>44th Commando Regiment WARDOGS community site.</p></div>
      </div>
      <div className="shell footer-bottom"><span>© {new Date().getFullYear()} 44th Commando Regiment</span><Link to="/">Back to home ↑</Link></div>
    </footer>
  )
}
