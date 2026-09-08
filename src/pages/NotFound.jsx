import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <section className="not-found shell">
      <p className="kicker">404 // Route not found</p>
      <h1>Lost the <em>objective?</em></h1>
      <p>That page does not exist.</p>
      <Link className="button primary" to="/">Return home</Link>
    </section>
  )
}
