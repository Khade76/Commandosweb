import { Component, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './styles-routed.css'

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('44th Commando Regiment site failed to render', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <section className="app-error">
          <img src="/assets/44th-patch.svg" alt="44th Commando Regiment" />
          <p className="kicker">44TH COMMANDO REGIMENT // WARDOGS</p>
          <h1>Website failed to load</h1>
          <p>The page hit a React error instead of rendering. Open the browser console for the exact stack trace.</p>
          <pre>{String(this.state.error?.message || this.state.error)}</pre>
        </section>
      )
    }

    return this.props.children
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </AppErrorBoundary>
  </StrictMode>,
)
