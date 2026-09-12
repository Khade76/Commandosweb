import '../server/env.js'
import crypto from 'node:crypto'
import net from 'node:net'
import tls from 'node:tls'

const PANEL_HOST = (process.env.BISECT_PANEL_HOST || 'https://games.bisecthosting.com').replace(/\/$/, '')
const API_KEY = process.env.BISECT_API_KEY || ''
const SIX_DIGIT = /\b\d{6}\b/g
const GROUPED_SIX_DIGIT = /\b\d{3}(?:[-\s–—])\d{3}\b/g
const INTERESTING = /(join|connect|register|registration|session|instance|invite|backend|game.?id|server.?id)/i

function serverIds() {
  return String(process.env.BISECT_SERVER_IDS || process.env.BISECT_SERVER_UUID || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
}

function redact(text) {
  return String(text || '')
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [redacted]')
    .replace(/(password|token|secret|api[_ -]?key)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
}

function codes(text) {
  const value = String(text || '')
  const found = new Set()
  for (const match of value.matchAll(SIX_DIGIT)) found.add(match[0])
  for (const match of value.matchAll(GROUPED_SIX_DIGIT)) {
    found.add(match[0].replace(/\D/g, ''))
  }
  return [...found]
}

async function panelRequest(path) {
  const response = await fetch(`${PANEL_HOST}${path}`, {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      Accept: 'application/json',
    },
  })
  const text = await response.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { body = null }
  if (!response.ok) {
    const detail = body?.errors?.[0]?.detail || body?.error || body?.message || text.slice(0, 200)
    throw new Error(`HTTP ${response.status}: ${detail}`)
  }
  return body || {}
}

function makeClientFrame(opcode, payload = Buffer.alloc(0)) {
  if (!Buffer.isBuffer(payload)) payload = Buffer.from(payload)
  const mask = crypto.randomBytes(4)
  let header
  if (payload.length < 126) {
    header = Buffer.alloc(2)
    header[1] = 0x80 | payload.length
  } else if (payload.length <= 0xffff) {
    header = Buffer.alloc(4)
    header[1] = 0x80 | 126
    header.writeUInt16BE(payload.length, 2)
  } else {
    header = Buffer.alloc(10)
    header[1] = 0x80 | 127
    header.writeBigUInt64BE(BigInt(payload.length), 2)
  }
  header[0] = 0x80 | opcode
  const masked = Buffer.alloc(payload.length)
  for (let i = 0; i < payload.length; i += 1) masked[i] = payload[i] ^ mask[i % 4]
  return Buffer.concat([header, mask, masked])
}

function parseFrames(buffer, onFrame) {
  let offset = 0
  while (buffer.length - offset >= 2) {
    const first = buffer[offset]
    const second = buffer[offset + 1]
    const opcode = first & 0x0f
    const masked = Boolean(second & 0x80)
    let length = second & 0x7f
    let headerLength = 2

    if (length === 126) {
      if (buffer.length - offset < 4) break
      length = buffer.readUInt16BE(offset + 2)
      headerLength = 4
    } else if (length === 127) {
      if (buffer.length - offset < 10) break
      const big = buffer.readBigUInt64BE(offset + 2)
      if (big > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('WebSocket frame too large')
      length = Number(big)
      headerLength = 10
    }

    const maskLength = masked ? 4 : 0
    const total = headerLength + maskLength + length
    if (buffer.length - offset < total) break

    let payload = buffer.subarray(offset + headerLength + maskLength, offset + total)
    if (masked) {
      const mask = buffer.subarray(offset + headerLength, offset + headerLength + 4)
      const unmasked = Buffer.alloc(payload.length)
      for (let i = 0; i < payload.length; i += 1) unmasked[i] = payload[i] ^ mask[i % 4]
      payload = unmasked
    }

    onFrame(opcode, payload)
    offset += total
  }
  return buffer.subarray(offset)
}

function connectConsole(socketUrl, token, serverNumber, captureMs = 12000) {
  return new Promise((resolve) => {
    const target = new URL(socketUrl)
    const secure = target.protocol === 'wss:'
    const port = Number(target.port || (secure ? 443 : 80))
    const host = target.hostname
    const path = `${target.pathname || '/'}${target.search || ''}`
    const key = crypto.randomBytes(16).toString('base64')
    const expectedAccept = crypto.createHash('sha1')
      .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest('base64')

    const socket = secure
      ? tls.connect({ host, port, servername: host })
      : net.connect({ host, port })

    let handshakeDone = false
    let buffer = Buffer.alloc(0)
    let finished = false
    const findings = []

    const finish = (reason) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      socket.destroy()
      console.log(`Console capture ended: ${reason}`)
      resolve(findings)
    }

    const timer = setTimeout(() => finish(`${captureMs / 1000}s capture window completed`), captureMs)

    socket.setTimeout(captureMs + 5000)
    socket.once('timeout', () => finish('socket timeout'))
    socket.once('error', (error) => {
      console.log(`WebSocket error: ${error.message}`)
      finish('socket error')
    })

    const onConnected = () => {
      const request = [
        `GET ${path} HTTP/1.1`,
        `Host: ${target.host}`,
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Key: ${key}`,
        'Sec-WebSocket-Version: 13',
        'Origin: https://games.bisecthosting.com',
        '',
        '',
      ].join('\r\n')
      socket.write(request)
    }

    if (secure) socket.once('secureConnect', onConnected)
    else socket.once('connect', onConnected)

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk])

      if (!handshakeDone) {
        const end = buffer.indexOf('\r\n\r\n')
        if (end === -1) return
        const headerText = buffer.subarray(0, end).toString('utf8')
        buffer = buffer.subarray(end + 4)
        const lines = headerText.split('\r\n')
        const status = lines.shift() || ''
        const headers = Object.fromEntries(lines.map((line) => {
          const colon = line.indexOf(':')
          return colon === -1 ? [line.toLowerCase(), ''] : [line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim()]
        }))

        if (!/^HTTP\/1\.1 101\b/.test(status)) {
          console.log(`WebSocket upgrade failed: ${status}`)
          finish('upgrade rejected')
          return
        }
        if (headers['sec-websocket-accept'] !== expectedAccept) {
          console.log('WebSocket upgrade failed: invalid Sec-WebSocket-Accept')
          finish('invalid handshake')
          return
        }

        handshakeDone = true
        console.log('WebSocket connected; authenticating...')
        socket.write(makeClientFrame(0x1, JSON.stringify({ event: 'auth', args: [token] })))
      }

      buffer = parseFrames(buffer, (opcode, payload) => {
        if (opcode === 0x8) {
          finish('server closed connection')
          return
        }
        if (opcode === 0x9) {
          socket.write(makeClientFrame(0xA, payload))
          return
        }
        if (opcode !== 0x1) return

        const text = payload.toString('utf8')
        let message
        try { message = JSON.parse(text) } catch { return }

        const event = String(message?.event || '')
        if (event === 'auth success') {
          console.log('Authenticated. Requesting console backlog...')
          socket.write(makeClientFrame(0x1, JSON.stringify({ event: 'send logs', args: [null] })))
          return
        }
        if (event !== 'console output') return

        const line = redact(Array.isArray(message.args) ? message.args.join(' ') : message.args)
        const foundCodes = codes(line)
        if (!INTERESTING.test(line) && !foundCodes.length) return

        console.log(`  ${line.slice(0, 600)}`)
        for (const code of foundCodes) {
          findings.push({ code, line, serverNumber })
        }
      })
    })
  })
}

async function probeServer(identifier, index) {
  const serverNumber = index + 1
  console.log(`\n=== Bisect console server ${serverNumber} (${identifier}) ===`)

  try {
    const body = await panelRequest(`/api/client/servers/${encodeURIComponent(identifier)}/websocket`)
    const data = body?.data || body
    const token = data?.token
    const socketUrl = data?.socket
    if (!token || !socketUrl) {
      console.log('WebSocket credentials returned, but token/socket fields were missing.')
      console.log(JSON.stringify(body, null, 2).replace(/"token"\s*:\s*"[^"]+"/gi, '"token":"[redacted]"'))
      return []
    }
    console.log(`WebSocket credentials: OK (${new URL(socketUrl).host})`)
    return await connectConsole(socketUrl, token, serverNumber)
  } catch (error) {
    console.log(`Console probe unavailable: ${error.message}`)
    return []
  }
}

async function main() {
  console.log('WARDOGS Bisect live-console join-code probe')
  console.log('Uses the official Starbase /websocket endpoint and reads console output only. No power or console commands are sent.')
  console.log('Join-code formats detected: 123456, 123-456, 123 456 (also en/em dash variants).')

  if (!API_KEY) {
    console.error('BISECT_API_KEY is not configured.')
    process.exitCode = 1
    return
  }

  const ids = serverIds()
  if (!ids.length) {
    console.error('BISECT_SERVER_IDS / BISECT_SERVER_UUID is not configured.')
    process.exitCode = 1
    return
  }

  const all = []
  for (let index = 0; index < ids.length; index += 1) {
    all.push(...await probeServer(ids[index], index))
  }

  console.log('\n=== Six-digit console candidates ===')
  const grouped = new Map()
  for (const item of all) {
    const key = `${item.serverNumber}:${item.code}`
    if (!grouped.has(key)) grouped.set(key, item)
  }

  if (!grouped.size) {
    console.log('No six-digit values (including 123-456 style codes) were found in the console backlog/capture window.')
    console.log('If the server has been up for a while, re-run this probe immediately before restarting one test server; it will watch the live startup output for 12 seconds per server.')
    return
  }

  for (const item of grouped.values()) {
    console.log(`Server ${item.serverNumber}: ${item.code}`)
    console.log(`  ${item.line.slice(0, 500)}`)
  }
}

main().catch((error) => {
  console.error('Probe failed:', error)
  process.exitCode = 1
})
