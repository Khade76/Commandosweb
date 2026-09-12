import '../server/env.js'

const META_FORGE_URL = 'https://metaforge.app/wardogs/server-status'
const BISECT_PANEL_HOST = (process.env.BISECT_PANEL_HOST || 'https://games.bisecthosting.com').replace(/\/$/, '')
const API_KEY = process.env.BISECT_API_KEY || ''
const CODE_RE = /\b\d{3}(?:[-\s–—]?\d{3})\b/g

function serverIds() {
  return String(process.env.BISECT_SERVER_IDS || process.env.BISECT_SERVER_UUID || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
}

function normalizeCode(value) {
  return String(value || '').replace(/\D/g, '')
}

async function fetchText(url, options = {}, timeoutMs = 20000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    const text = await response.text()
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`)
    return text
  } finally {
    clearTimeout(timer)
  }
}

async function panelJson(path) {
  if (!API_KEY) return null
  const text = await fetchText(`${BISECT_PANEL_HOST}${path}`, {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      Accept: 'application/json',
    },
  })
  try { return JSON.parse(text) } catch { return null }
}

function unwrap(payload) {
  return payload?.attributes ?? payload?.data?.attributes ?? payload ?? {}
}

function extractInvocationAddress(invocation = '') {
  const host = String(invocation).match(/-hostaddress=([^\s]+)/i)?.[1]?.replace(/["']/g, '') || ''
  const port = String(invocation).match(/-(?:hostport|port)=([^\s]+)/i)?.[1]?.replace(/["']/g, '') || ''
  return { host, port }
}

async function rconStatus(index) {
  const n = index + 1
  const url = process.env[`WARDOGS_RCON_SERVER_${n}_URL`] || process.env[`WARDOGS_RCON_${n}_URL`] || ''
  const password = process.env[`WARDOGS_RCON_SERVER_${n}_PASSWORD`] || process.env[`WARDOGS_RCON_${n}_PASSWORD`] || ''
  if (!url || !password) return null

  try {
    const target = new URL('/v1/status', url)
    const text = await fetchText(target, {
      headers: { Authorization: `Bearer ${password}`, Accept: 'application/json' },
    }, 8000)
    return JSON.parse(text)
  } catch {
    return null
  }
}

async function resolveTargets() {
  const ids = serverIds()
  const count = Math.max(3, ids.length)
  const targets = []

  for (let index = 0; index < count; index += 1) {
    const status = await rconStatus(index)
    let details = null
    if (ids[index] && API_KEY) {
      try {
        details = unwrap(await panelJson(`/api/client/servers/${encodeURIComponent(ids[index])}`))
      } catch {}
    }

    const invocation = details?.invocation || ''
    const { host, port } = extractInvocationAddress(invocation)
    const configuredName = process.env[`WARDOGS_SERVER_${index + 1}_NAME`] || ''
    const name = status?.serverName || configuredName || details?.name || ''

    if (!name && !host) continue
    targets.push({
      index: index + 1,
      identifier: ids[index] || '',
      name,
      host,
      port,
    })
  }
  return targets
}

function htmlToLooseText(html) {
  return String(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (block) => block)
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
}

function contexts(haystack, needle, radius = 900) {
  const out = []
  if (!needle) return out
  const lowerHay = haystack.toLowerCase()
  const lowerNeedle = needle.toLowerCase()
  let start = 0
  while (out.length < 8) {
    const at = lowerHay.indexOf(lowerNeedle, start)
    if (at === -1) break
    out.push(haystack.slice(Math.max(0, at - radius), Math.min(haystack.length, at + needle.length + radius)))
    start = at + lowerNeedle.length
  }
  return out
}

function candidateCodes(text) {
  const found = new Map()
  for (const match of String(text).matchAll(CODE_RE)) {
    const normalized = normalizeCode(match[0])
    if (normalized.length !== 6) continue
    if (!found.has(normalized)) found.set(normalized, match[0])
  }
  return [...found].map(([code, raw]) => ({ code, raw }))
}

function discoverPublicUrls(html) {
  const urls = new Set()
  for (const match of String(html).matchAll(/https?:\\?\/\\?\/[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]+/g)) {
    const value = match[0].replace(/\\\//g, '/')
    if (/wardogs|server|pragma|gamelift|api/i.test(value)) urls.add(value.slice(0, 500))
  }
  for (const match of String(html).matchAll(/["'`](\/[^"'`\s]{1,180})["'`]/g)) {
    const value = match[1]
    if (/api|wardogs|server/i.test(value)) urls.add(value)
  }
  return [...urls].slice(0, 80)
}

async function main() {
  console.log('WARDOGS public server-browser mirror probe')
  console.log(`Source: ${META_FORGE_URL}`)
  console.log('This reads a public web page only; it does not contact WARDOGS/Pragma/GameLift directly.\n')

  const targets = await resolveTargets()
  if (!targets.length) {
    console.log('Could not resolve any local server names/IPs from the existing RCON/Bisect configuration.')
    process.exitCode = 1
    return
  }

  for (const target of targets) {
    console.log(`Target ${target.index}: ${target.name || '(no name)'}${target.host ? ` @ ${target.host}${target.port ? ':' + target.port : ''}` : ''}`)
  }

  let html
  try {
    html = await fetchText(META_FORGE_URL, {
      headers: {
        'User-Agent': '44th-Commandos-WARDOGS-public-directory-check/1.0',
        Accept: 'text/html,application/xhtml+xml',
      },
    }, 30000)
  } catch (error) {
    console.error(`\nUnable to fetch MetaForge: ${error.message}`)
    process.exitCode = 1
    return
  }

  console.log(`\nFetched ${html.length.toLocaleString()} characters from the public status page.`)
  const loose = htmlToLooseText(html)
  const overall = []

  for (const target of targets) {
    console.log(`\n=== Public mirror match: server ${target.index} ===`)
    const needles = [...new Set([
      target.name,
      target.host,
      target.host && target.port ? `${target.host}:${target.port}` : '',
    ].filter(Boolean))]

    let matched = false
    for (const needle of needles) {
      const chunks = [...contexts(html, needle), ...contexts(loose, needle)]
      if (!chunks.length) continue
      matched = true
      console.log(`Matched: ${needle}`)
      for (const chunk of chunks.slice(0, 4)) {
        const candidates = candidateCodes(chunk)
          .filter((item) => item.code !== '499480')
        const clean = chunk.replace(/\s+/g, ' ').slice(0, 900)
        console.log(`  context: ${clean}`)
        for (const candidate of candidates) {
          overall.push({ server: target.index, needle, ...candidate, context: clean })
        }
      }
    }

    if (!matched) console.log('No occurrence of this server name/IP was found in the public page payload.')
  }

  console.log('\n=== Public join-code candidates ===')
  const unique = new Map()
  for (const item of overall) {
    const key = `${item.server}:${item.code}`
    if (!unique.has(key)) unique.set(key, item)
  }

  if (unique.size) {
    for (const item of unique.values()) {
      console.log(`Server ${item.server}: ${item.raw} -> ${item.code} (near ${item.needle})`)
      console.log(`  ${item.context.slice(0, 600)}`)
    }
  } else {
    console.log('No join-code candidate was found next to either configured server in the current public page payload.')
  }

  const urls = discoverPublicUrls(html)
  if (urls.length) {
    console.log('\n=== Public page endpoints/URLs worth inspecting ===')
    for (const url of urls) console.log(`- ${url}`)
  }
}

main().catch((error) => {
  console.error('Public mirror probe failed:', error)
  process.exitCode = 1
})
