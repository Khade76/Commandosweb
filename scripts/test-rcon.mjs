import '../server/env.js'
import dns from 'node:dns/promises'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import tls from 'node:tls'
import { testWardogsRcon, wardogsRconConfigured, getWardogsRconConfig } from '../server/providers/wardogs-rcon.js'

const TIMEOUT_MS = 6000

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

  // Certificate-inspection only. No RCON password is sent on this connection.
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

async function probePlainHttp(hostname, port) {
  return new Promise((resolve) => {
    const request = http.request({
      host: hostname,
      port,
      path: '/v1/status',
      method: 'GET',
      timeout: TIMEOUT_MS,
      headers: { Accept: 'application/json' },
    }, (response) => {
      response.resume()
      console.log(`Plain HTTP unauthenticated probe: responded HTTP ${response.statusCode}`)
      console.log('WARNING: if this is the WARDOGS RCON service, do not send the RCON password over plaintext HTTP.')
      resolve(true)
    })

    request.once('timeout', () => {
      request.destroy()
      console.log(`Plain HTTP unauthenticated probe: timeout after ${TIMEOUT_MS}ms`)
      resolve(false)
    })
    request.once('error', (error) => {
      console.log(`Plain HTTP unauthenticated probe: no useful response -> ${formatError(error)}`)
      resolve(false)
    })
    request.end()
  })
}

async function authenticatedStatusRequest(url, password) {
  return new Promise((resolve) => {
    const target = new URL('/v1/status', url)
    const request = https.request(target, {
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
            console.log(body.slice(0, 1000))
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

  if (parsed.protocol !== 'https:') {
    console.log('Diagnosis: remote WARDOGS RCON should use HTTPS. The community reference says network-bound listeners require TLS.')
    await probePlainHttp(hostname, port)
    continue
  }

  const tlsOk = await testTls(hostname, port)
  if (!tlsOk) {
    await probePlainHttp(hostname, port)
    console.log('Diagnosis: TCP is reachable but a trusted TLS connection could not be established. Review the certificate output above; common causes are a self-signed certificate, hostname/IP mismatch, or the port speaking plaintext/non-TLS.')
    continue
  }

  const authOk = await authenticatedStatusRequest(config.url, config.password)
  if (!authOk) {
    console.log('Diagnosis: network + TLS are working. Use the HTTP status/body above to distinguish an invalid bearer password (typically 401/403) from a wrong path/service (typically 404).')
    continue
  }

  try {
    const result = await testWardogsRcon(index)
    console.log('\n/v1/capabilities')
    console.log(JSON.stringify(result.capabilities, null, 2))
  } catch (error) {
    console.error(`RCON server ${serverNumber} follow-up failed: ${formatError(error)}`)
  }
}
