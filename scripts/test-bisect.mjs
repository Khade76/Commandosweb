import '../server/env.js'

const host = (process.env.BISECT_PANEL_HOST || 'https://games.bisecthosting.com').replace(/\/$/, '')
const apiKey = process.env.BISECT_API_KEY
const ids = (process.env.BISECT_SERVER_IDS || '278c7bc5,9290beb1')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)

if (!apiKey) {
  console.error('BISECT_API_KEY is not set.')
  process.exit(1)
}

const sensitiveKey = /(password|passwd|secret|token|api[_-]?key|private[_-]?key|credential|authorization)/i
const interestingKey = /(map|mode|score|team|faction|player|state|status|name|feature|identifier|uuid)/i

function scrub(value, depth = 0) {
  if (depth > 6) return '[depth-limit]'
  if (Array.isArray(value)) return value.slice(0, 25).map((item) => scrub(item, depth + 1))
  if (!value || typeof value !== 'object') return value

  const output = {}
  for (const [key, child] of Object.entries(value)) {
    if (sensitiveKey.test(key)) {
      output[key] = '[redacted]'
      continue
    }
    if (interestingKey.test(key) || depth < 2) output[key] = scrub(child, depth + 1)
  }
  return output
}

function unwrap(entry) {
  return entry?.attributes ?? entry?.data?.attributes ?? entry ?? {}
}

function rconStartupVariables(payload) {
  const entries = Array.isArray(payload?.data) ? payload.data : []
  const results = []

  for (const entry of entries) {
    const attributes = unwrap(entry)
    const variable = String(attributes.env_variable || attributes.variable || attributes.name || '').trim()
    if (!variable || !/(rcon|api.*port|internal.*port|server.*port)/i.test(variable)) continue

    const rawValue = attributes.server_value ?? attributes.value ?? attributes.default_value ?? null
    results.push({
      variable,
      value: sensitiveKey.test(variable) ? '[redacted]' : rawValue,
    })
  }

  return results
}

async function request(path) {
  const response = await fetch(`${host}${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
  })

  const text = await response.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { body = text.slice(0, 500) }

  return { status: response.status, ok: response.ok, body }
}

for (const id of ids) {
  console.log(`\n=== Bisect server ${id} ===`)
  for (const suffix of ['', '/resources', '/player/online', '/startup']) {
    const path = `/api/client/servers/${encodeURIComponent(id)}${suffix}`
    try {
      const result = await request(path)
      console.log(`\n${path} -> HTTP ${result.status}`)
      console.log(JSON.stringify(scrub(result.body), null, 2))

      if (suffix === '/startup') {
        const variables = rconStartupVariables(result.body)
        console.log('\nRCON/port startup variables:')
        console.log(JSON.stringify(variables.length ? variables : ['No RCON-related startup variables found'], null, 2))
      }
    } catch (error) {
      console.error(`${path} -> ${error.message}`)
    }
  }
}
