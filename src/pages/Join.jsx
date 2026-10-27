import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { images, servers as serverDirectory } from '../data/site.js'
import './join.css'

const JOIN_API_URL = import.meta.env.VITE_JOIN_API_URL
  || (import.meta.env.PROD ? '/api/join.php' : '/api/join')
const JOIN_CODE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const COMMUNITY_SERVERS = serverDirectory.filter((server) => server.joinCode)

function validLobbyId(value) {
  return typeof value === 'string' && /^[1-9]\d{16,19}$/.test(value)
    && BigInt(value) <= 18446744073709551615n
}

function selectedTarget(search) {
  const params = new URLSearchParams(search)
  const servers = params.getAll('server')
  const lobbies = params.getAll('lobby')
  if (servers.length + lobbies.length !== 1) return null
  if (lobbies.length) {
    const value = lobbies[0]
    return validLobbyId(value) ? { type: 'lobby', value, key: `lobby:${value}` } : null
  }
  const value = servers[0]
  const validServer = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)
    && (!/^\d+$/.test(value) || /^[1-5]$/.test(value))
  return validServer
    ? { type: 'server', value, key: `server:${value}` }
    : null
}

function fallbackServer(selection) {
  if (!selection) return null
  if (selection.type === 'lobby') return { id: null, number: null, name: 'WARDOGS', joinCode: null }
  const index = /^[1-5]$/.test(selection.value)
    ? Number(selection.value) - 1
    : COMMUNITY_SERVERS.findIndex((server) => server.id === selection.value)
  const server = COMMUNITY_SERVERS[index]
  return server ? { ...server, number: index + 1 } : null
}

function joinCodeFor(server) {
  return typeof server?.joinCode === 'string' && JOIN_CODE.test(server.joinCode)
    ? server.joinCode
    : ''
}

export function validatedSteamJoinUrl(payload) {
  if (payload?.available !== true || typeof payload.steamJoinUrl !== 'string') return ''
  const match = payload.steamJoinUrl.match(/^steam:\/\/joinlobby\/1867240\/([1-9]\d{16,19})$/)
  if (!match || !validLobbyId(match[1])) return ''
  if (payload.steamLobbyId !== match[1]) return ''
  return payload.steamJoinUrl
}

export default function Join() {
  const { search } = useLocation()
  const selection = useMemo(() => selectedTarget(search), [search])
  const selector = selection?.key || ''
  const fallback = useMemo(() => fallbackServer(selection), [selection])
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState({ selector: '', attempt: 0, phase: 'invalid', server: null, steamUrl: '' })
  const [copyMessage, setCopyMessage] = useState('')
  const attemptedHandoff = useRef('')
  const codeInput = useRef(null)

  useEffect(() => {
    setCopyMessage('')
    if (!selector) {
      setState({ selector, attempt, phase: 'invalid', server: null, steamUrl: '' })
      return undefined
    }

    let active = true
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 15_000)
    setState({ selector, attempt, phase: 'loading', server: fallback, steamUrl: '' })

    async function loadJoinLink() {
      try {
        const url = new URL(JOIN_API_URL, window.location.origin)
        url.searchParams.delete('server')
        url.searchParams.delete('lobby')
        url.searchParams.set(selection.type, selection.value)
        const response = await fetch(url, {
          headers: { Accept: 'application/json' },
          cache: 'no-store',
          signal: controller.signal,
        })
        // A missing or disabled server must not be revived by static defaults.
        // Keep fallback codes for transient failures, not rejected selections.
        if (!response.ok && response.status >= 400 && response.status < 500) {
          if (active) setState({ selector, attempt, phase: 'error', server: null, steamUrl: '' })
          return
        }
        const payload = await response.json()
        if (!response.ok) throw new Error('Join details unavailable')
        const server = payload?.server
        const matchesSelection = selection.type === 'lobby'
          ? server?.id === null && server?.number === null && payload.steamLobbyId === selection.value
          : /^[1-5]$/.test(selection.value)
            ? String(server?.number) === selection.value
            : server?.id === selection.value
        if (!matchesSelection || (selection.type === 'server' && typeof server?.id !== 'string') || typeof server?.name !== 'string') {
          throw new Error('Unexpected server details')
        }
        const steamUrl = validatedSteamJoinUrl(payload)
        if (active) setState({ selector, attempt, phase: steamUrl ? 'ready' : 'manual', server, steamUrl })
      } catch {
        if (active) setState({ selector, attempt, phase: 'error', server: fallback, steamUrl: '' })
      } finally {
        window.clearTimeout(timeout)
      }
    }

    loadJoinLink()
    return () => {
      active = false
      controller.abort()
      window.clearTimeout(timeout)
    }
  }, [selector, selection, fallback, attempt])

  // A query change must never leave the previous server's Steam link actionable.
  const current = state.selector === selector && state.attempt === attempt
    ? state
    : { selector, phase: selector ? 'loading' : 'invalid', server: fallback, steamUrl: '' }
  const handoffKey = `${selector}:${attempt}:${current.steamUrl}`

  useEffect(() => {
    if (current.phase !== 'ready' || !current.steamUrl || attemptedHandoff.current === handoffKey) return
    attemptedHandoff.current = handoffKey
    try {
      window.location.assign(current.steamUrl)
    } catch {
      // Browsers may require a user gesture; the visible anchor remains usable.
    }
  }, [current.phase, current.steamUrl, handoffKey])

  useEffect(() => {
    if (!copyMessage) return undefined
    const timer = window.setTimeout(() => setCopyMessage(''), 4500)
    return () => window.clearTimeout(timer)
  }, [copyMessage])

  const joinCode = joinCodeFor(current.server)
  const serverNumber = current.server?.number
  const directLobby = selection?.type === 'lobby'
  const heading = serverNumber ? `Server #${serverNumber}` : directLobby ? 'Steam lobby' : 'Your server'
  const loading = current.phase === 'loading'
  const ready = current.phase === 'ready'
  const showChoices = current.phase === 'invalid' || !current.server

  async function copyCode() {
    if (!joinCode) return
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(joinCode)
      } else {
        codeInput.current?.focus()
        codeInput.current?.select()
        if (!document.execCommand('copy')) throw new Error('Copy failed')
      }
      if (codeInput.current?.value === joinCode) setCopyMessage('Join code copied.')
    } catch {
      codeInput.current?.focus()
      codeInput.current?.select()
      setCopyMessage('Select the code above and copy it to join manually.')
    }
  }

  return (
    <section className="join-page shell" aria-labelledby="join-title">
      <div className="join-intro">
        <p className="kicker">44th Commando Regiment</p>
        <h1 id="join-title">Join the <em>fight.</em></h1>
        <p>{directLobby ? 'Open your WARDOGS lobby through Steam.' : 'Choose your server and open WARDOGS through Steam.'}</p>
      </div>

      <div className="join-panel">
        <div className="join-panel-top">
          <img src={images.patch} alt="" className="join-patch" />
          <div>
            <p className="kicker">WARDOGS // {directLobby ? 'Steam join link' : 'Community server'}</p>
            <h2>{showChoices ? 'Choose a server' : heading}</h2>
          </div>
        </div>

        {showChoices ? (
          <>
            <p className="join-status" role="status">
              {current.phase === 'error' ? 'We could not find that server. Choose one of the 44th servers below.' : 'Select the 44th server you want to join.'}
            </p>
            <div className="join-choices">
              {COMMUNITY_SERVERS.map((server, index) => (
                <Link className="button" to={`/join?server=${encodeURIComponent(server.id)}`} key={server.id}>
                  Server #{index + 1} <span aria-hidden="true">↗</span>
                </Link>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="join-server-name">{current.server.name}</p>
            <div className={`join-status ${ready ? 'join-status-ready' : ''}`} role="status" aria-live="polite">
              <span className={`join-indicator ${loading ? 'join-indicator-loading' : ''}`} aria-hidden="true" />
              <div>
                <strong>{loading ? 'Preparing your join link…' : ready ? 'Opening Steam…' : directLobby ? 'Join link unavailable' : 'Join with your server code'}</strong>
                <p>
                  {loading ? 'We are checking the current join link.'
                    : ready ? 'If Steam does not open, use the button below and accept your browser’s prompt.'
                      : directLobby ? 'We could not prepare this Steam link. Try again or choose a server from the directory.'
                        : 'Direct joining is unavailable right now. You can still find the server in WARDOGS using the details below.'}
                </p>
              </div>
            </div>

            <div className="actions join-actions">
              {ready && <a className="button primary" href={current.steamUrl}>Open in Steam <span aria-hidden="true">↗</span></a>}
              {!loading && <button className="button" type="button" onClick={() => setAttempt((value) => value + 1)}>{ready ? 'Refresh join link' : 'Check again'}</button>}
              <Link className="button" to="/servers">All servers</Link>
            </div>
            {ready && <p className="join-device-note">Steam and WARDOGS must be installed on this device.</p>}

            <div className="join-manual">
              <h3>Join from inside the game</h3>
              {joinCode ? (
                <>
                  <label htmlFor="join-code">Server join code</label>
                  <div className="join-code-row">
                    <input ref={codeInput} id="join-code" value={joinCode} readOnly spellCheck="false" onFocus={(event) => event.target.select()} />
                    <button className="button" type="button" onClick={copyCode}>Copy code</button>
                  </div>
                  <p className="join-copy-result" role="status" aria-live="polite">{copyMessage}</p>
                  <ol>
                    <li>Open WARDOGS and choose <strong>Deploy → Community</strong>.</li>
                    <li>Select <strong>Join by ID</strong> and paste this code.</li>
                    <li>Choose <strong>Lookup</strong>, then <strong>Join Match</strong>.</li>
                  </ol>
                </>
              ) : (
                directLobby
                  ? <p>This link points to a Steam lobby. If it has closed, choose a current server from the <Link to="/servers">44th server directory</Link>.</p>
                  : <p>Open <strong>WARDOGS → Deploy → Community</strong> and search for <strong>{serverNumber ? `44th Commandos #${serverNumber}` : current.server.name}</strong>.</p>
              )}
            </div>
          </>
        )}
      </div>
      <p className="join-return"><Link to="/servers">← Back to the server directory</Link></p>
    </section>
  )
}
