import { DISCORD_URL, images } from '../data/site.js'

const steps = [
  ['01', 'Join the Discord', 'Enter the 44th WARDOGS community and get access to the latest information.'],
  ['02', 'Be welcomed by our community', "You're joining the team, and we welcome you into your new journey with the 44th regiment."],
  ['03', 'Choose your company', 'Meet Vanguard, Spectre and Spartan and find the company that suits you.'],
  ['04', 'Deploy with the regiment', 'Squad up, communicate and fight alongside the wider 44th.'],
]

export default function Enlist() {
  return (
    <>
      <section className="page-hero" style={{ '--hero-image': `url(${images.banner})` }}>
        <div className="hero-overlay" />
        <div className="shell"><p className="kicker">Enlistment</p><h1>Join the 44th.<br /><em>Get into the fight.</em></h1><p className="hero-copy">The quickest way into the regiment is through the 44th WARDOGS Discord.</p><div className="actions"><a className="button primary" href={DISCORD_URL} target="_blank" rel="noreferrer">Join Discord ↗</a></div></div>
      </section>
      <section className="section split">
        <div><p className="kicker">How to join</p><h2>Four steps.<br /><em>Then deploy.</em></h2></div>
        <ol className="steps">{steps.map(([number, title, copy]) => <li key={number}><span>{number}</span><div><strong>{title}</strong><p>{copy}</p></div></li>)}</ol>
      </section>
    </>
  )
}
