import '../server/env.js'
import dns from 'node:dns/promises'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import tls from 'node:tls'
import { testWardogsRcon, wardogsRconConfigured, getWardogsRconConfig } from '../server/providers/wardogs-rcon.js'

const TIMEOUT_MS = 6000
const FAKE_BEARER = 'wardogs-diagnostic-invalid-token'

function formatError(error) {
  if (!error) return 'Unknown error'
  const parts = []
  if (error.name) parts.push(error.name)
  if (error.code) parts.push(error.code)
  if (error.message) parts.push(error.message)
  if (error.cause?.code) parts.push(`cause=${error.cause.code}`)
  if (error.cause?.message && error.cause.message !== error.message) parts.push(`cause=${error.cause.message}`)
  return [...new Set(parts)].join(' | ')
}

async function resolveHost(hostname) {
  try {
    const results = await dns.lookup(hostname, { all: true })
    console.log(`DNS: OK -> ${results.map((entry) => `${entry.address} (IPv${entry.family})`).join(', ')}`)
    return true
  } catch (error) {
    console.log(`DNS: FAILED -> ${formatError(error)}`)
    return false
  }
}

async function testTcp(hostname, port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: hostname, port })
    const started = Date.now()
    let finished = false

    const done = (ok, message) => {
      if (finished) return
      finished = true
      socket.destroy()
      console.log(`TCP ${hostname}:${port}: ${ok ? 'OK' : 'FAILED'} -> ${message}`)
      resolve(ok)
    }

    socket.setTimeout(TIMEOUT_MS)
    socket.once('connect', () => done(true, `connected in ${Date.now() - started}ms`))
    socket.once('timeout', () => done(false, `timeout after ${TIMEOUT_MS}ms`))
    socket.once('error', (error) => done(false, formatError(error)))
  })
}

function certificateSummary(cert) {
  if (!cert || Object.keys(cert).length === 0) return 'No peer certificate returned'
  return {
    subject: cert.subject,
    issuer: cert.issuer,
    subjectAltName: cert.subjectaltname,
    validFrom: cert.valid_from,
    validTo: cert.valid_to,
    fingerprint256: cert.fingerprint256,
  }
}

async function testTls(hostname, port) {
  const verified = await new Promise((resolve) => {
    const socket = tls.connect({
      host: hostname,
      port,
      servername: net.isIP(hostname) ? undefined : hostname,
      rejectUnauthorized: true,
    })
    let finished = false

    const done = (result) => {
      if (finished) return
      finished = true
      socket.destroy()
      resolve(result)
    }

    socket.setTimeout(TIMEOUT_MS)
    socket.once('secureConnect', () => {
      console.log(`TLS verified: OK -> ${socket.getProtocol()} / ${socket.getCipher()?.name || 'unknown cipher'}`)
      console.log('TLS certificate:', JSON.stringify(certificateSummary(socket.getPeerCertificate()), null, 2))
      done(true)
    })
    socket.once('timeout', () => {
      console.log(`TLS verified: FAILED -> timeout after ${TIMEOUT_MS}ms`)
      done(false)
    })
    socket.once('error', (error) => {
      console.log(`TLS verified: FAILED -> ${formatError(error)}`)
      done(false)
    })
  })

  if (verified) return true

  await new Promise((resolve) => {
    const socket = tls.connect({
      host: hostname,
      port,
      servername: net.isIP(hostname) ? undefined : hostname,
      rejectUnauthorized: false,
    })
    let finished = false

    const done = () => {
      if (finished) return
      finished = true
      socket.destroy()
      resolve()
    }

    socket.setTimeout(TIMEOUT_MS)
    socket.once('secureConnect', () => {
      console.log(`TLS unverified probe: handshake succeeded (${socket.getProtocol()})`)
      console.log(`TLS authorized: ${socket.authorized}; authorizationError: ${socket.authorizationError || 'none'}`)
      console.log('Peer certificate:', JSON.stringify(certificateSummary(socket.getPeerCertificate()), null, 2))
      done()
    })
    socket.once('timeout', () => {
      console.log(`TLS unverified probe: timeout after ${TIMEOUT_MS}ms`)
      done()
    })
    socket.once('error', (error) => {
      console.log(`TLS unverified probe: FAILED -> ${formatError(error)}`)
      done()
    })
  })

  return false
}

function selectedHeaders(headers = {}) {
  const names = ['server', 'www-authenticate', 'content-type', 'content-length', 'connection', 'date', 'allow']
  const result = {}
  for (const name of names) {
    if (headers[name] !== undefined) result[name] = headers[name]
  }
  return result
}

function parseBody(body) {
  if (!body) return { parsed: null, display: '(empty body)' }
  try {
    const parsed = JSON.parse(body)
    return { parsed, display: JSON.stringify(parsed, null, 2) }
  } catch {
    return { parsed: null, display: body.slice(0, 1500) }
  }
}

function looksLikeWardogsRcon(statusCode, parsed, headers = {}) {
  const text = JSON.stringify(parsed || {}).toLowerCase()
  const contentType = String(headers['content-type'] || '').toLowerCase()
  return (
    statusCode === 401 &&
    (contentType.includes('json') || text.includes('unauthor') || text.includes('bearer') || text.includes('error'))
  )
}

async function plainHttpRequest(hostname, port, { fakeBearer = false } = {}) {
  return new Promise((resolve) => {
    const headers = { Accept: 'application/json' }
    if (fakeBearer) headers.Authorization = `Bearer ${FAKE_BEARER}`

    const request = http.request({
      host: hostname,
      port,
      path: '/v1/status',
      method: 'GET',
      timeout: TIMEOUT_MS,
      headers,
    }, (response) => {
      let body = ''
      response.setEncoding('utf8')
      response.on('data', (chunk) => { if (body.length < 5000) body += chunk })
      response.on('end', () => {
        const bodyInfo = parseBody(body)
        const label = fakeBearer ? 'Plain HTTP fake-token probe' : 'Plain HTTP unauthenticated probe'
        console.log(`${label}: HTTP ${response.statusCode}`)
        console.log(`${label} headers:`, JSON.stringify(selectedHeaders(response.headers), null, 2))
        console.log(`${label} body:\n${bodyInfo.display}`)
        resolve({
          ok: true,
          statusCode: response.statusCode,
          headers: response.headers,
          parsed: bodyInfo.parsed,
          looksLikeRcon: looksLikeWardogsRcon(response.statusCode, bodyInfo.parsed, response.headers),
        })
      })
    })

    request.once('timeout', () => {
      request.destroy()
      console.log(`Plain HTTP ${fakeBearer ? 'fake-token' : 'unauthenticated'} probe: timeout after ${TIMEOUT_MS}ms`)
      resolve({ ok: false })
    })
    request.once('error', (error) => {
      console.log(`Plain HTTP ${fakeBearer ? 'fake-token' : 'unauthenticated'} probe: no useful response -> ${formatError(error)}`)
      resolve({ ok: false })
    })
    request.end()
  })
}

async function probePlainHttp(hostname, port) {
  const unauth = await plainHttpRequest(hostname, port)
  if (!unauth.ok) return unauth

  const fake = await plainHttpRequest(hostname, port, { fakeBearer: true })
  const likelyRcon = Boolean(unauth.looksLikeRcon || fake.looksLikeRcon)

  if (likelyRcon) {
    console.log('Service fingerprint: LIKELY WARDOGS RCON-compatible auth endpoint (/v1/status returns JSON-style 401).')
  } else {
    console.log('Service fingerprint: inconclusive. The HTTP service did not expose a distinctive WARDOGS-style auth response.')
  }

  return { ok: true, likelyRcon, unauth, fake }
}

async function authenticatedStatusRequest(url, password) {
  return new Promise((resolve) => {
    const target = new URL('/v1/status', url)
    const client = target.protocol === 'http:' ? http : https
    const request = client.request(target, {
      method: 'GET',
      timeout: TIMEOUT_MS,
      headers: {
        Authorization: `Bearer ${password}`,
        Accept: 'application/json',
      },
    }, (response) => {
      let body = ''
      response.setEncoding('utf8')
      response.on('data', (chunk) => { body += chunk })
      response.on('end', () => {
        console.log(`Authenticated GET /v1/status: HTTP ${response.statusCode}`)
        if (body) {
          try {
            console.log(JSON.stringify(JSON.parse(body), null, 2))
          } catch {
            console.log(body.slice(0, 1500))
          }
        }
        resolve(response.statusCode >= 200 && response.statusCode < 300)
      })
    })

    request.once('timeout', () => {
      request.destroy()
      console.log(`Authenticated GET /v1/status: FAILED -> timeout after ${TIMEOUT_MS}ms`)
      resolve(false)
    })
    request.once('error', (error) => {
      console.log(`Authenticated GET /v1/status: FAILED -> ${formatError(error)}`)
      resolve(false)
    })
    request.end()
  })
}

async function printCapabilities(index) {
  try {
    const result = await testWardogsRcon(index)
    console.log('\n/v1/capabilities')
    console.log(JSON.stringify(result.capabilities, null, 2))
  } catch (error) {
    console.error(`RCON server ${index + 1} follow-up failed: ${formatError(error)}`)
  }
}

for (let index = 0; index < 2; index += 1) {
  const serverNumber = index + 1
  console.log(`\n=== WARDOGS RCON server ${serverNumber} ===`)

  const config = getWardogsRconConfig(index)
  console.log(`Configured URL: ${config.url || '(not set)'}`)
  console.log(`Password configured: ${config.password ? 'yes' : 'no'}`)

  if (!wardogsRconConfigured(index)) {
    console.log('Not configured. Set WARDOGS_RCON_SERVER_' + serverNumber + '_URL and _PASSWORD in .env.')
    continue
  }

  let parsed
  try {
    parsed = new URL(config.url)
  } catch (error) {
    console.log(`URL parse: FAILED -> ${formatError(error)}`)
    continue
  }

  const hostname = parsed.hostname
  const port = Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80))
  console.log(`Parsed endpoint: protocol=${parsed.protocol} host=${hostname} port=${port}`)

  await resolveHost(hostname)
  const tcpOk = await testTcp(hostname, port)
  if (!tcpOk) {
    console.log('Diagnosis: the port is not reachable from this machine. Check the Bisect allocation/firewall/port mapping and that the RCON listener is running.')
    continue
  }

  if (parsed.protocol === 'http:') {
    console.log('Transport: plain HTTP (expected for this Bisect WARDOGS RCON allocation).')
    const probe = await probePlainHttp(hostname, port)
    if (!probe?.likelyRcon) {
      console.log('Diagnosis: the endpoint is reachable but does not strongly fingerprint as the expected WARDOGS RCON API.')
      continue
    }

    const authOk = await authenticatedStatusRequest(config.url, config.password)
    if (!authOk) {
      console.log('Diagnosis: HTTP transport is working. Use the status/body above to distinguish an invalid RCON password from an API error.')
      continue
    }

    await printCapabilities(index)
    continue
  }

  if (parsed.protocol !== 'https:') {
    console.log('Diagnosis: RCON URL must use http:// or https://.')
    continue
  }

  const tlsOk = await testTls(hostname, port)
  if (!tlsOk) {
    const probe = await probePlainHttp(hostname, port)
    if (probe?.likelyRcon) {
      console.log('Diagnosis: this is a plaintext WARDOGS RCON endpoint. Change the configured URL from https:// to http:// and re-run the test.')
    } else {
      console.log('Diagnosis: TCP is reachable but TLS is unavailable and the plaintext service fingerprint is inconclusive.')
    }
    continue
  }

  const authOk = await authenticatedStatusRequest(config.url, config.password)
  if (!authOk) {
    console.log('Diagnosis: network + TLS are working. Use the HTTP status/body above to distinguish an invalid bearer password (typically 401/403) from a wrong path/service (typically 404).')
    continue
  }

  await printCapabilities(index)
}
