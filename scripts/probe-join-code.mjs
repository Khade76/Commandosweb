import '../server/env.js'

const BISECT_PANEL_HOST = (process.env.BISECT_PANEL_HOST || 'https://games.bisecthosting.com').replace(/\/$/, '')
const SIX_DIGIT = /\b\d{6}\b/g
const GROUPED_SIX_DIGIT = /\b\d{3}[- ]\d{3}\b/g
const INTERESTING_KEY = /(join|connect|session|instance|invite|code|game.?id|server.?id)/i
const INTERESTING_TEXT = /(join|connect|registered|registration|session|instance|invite|game.?id|server.?id|backend)/i
const REDACT_KEY = /(password|secret|token|authorization|api.?key|credential|cookie)/i
const SKIP_RCON_PATH = /(\/players(?:\/|$)|\/bans(?:\/|$)|\/reserved-slots(?:\/|$)|\/audit(?:\?|$)|\/config(?:\/|\?|$))/i
const BUILD_CONTEXT = /(build|cl[-_= ]?\d+|version)/i

function configuredBisectIds() {
  return String(process.env.BISECT_SERVER_IDS || process.env.BISECT_SERVER_UUID || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
}

function rconConfig(index) {
  const n = index + 1
  const url = process.env[`WARDOGS_RCON_SERVER_${n}_URL`] || process.env[`WARDOGS_RCON_${n}_URL`] || ''
  const password = process.env[`WARDOGS_RCON_SERVER_${n}_PASSWORD`] || process.env[`WARDOGS_RCON_${n}_PASSWORD`] || ''
  return { url: String(url).trim().replace(/\/$/, ''), password }
}

function redact(value, key = '') {
  if (REDACT_KEY.test(key)) return '[redacted]'
  if (Array.isArray(value)) return value.map((item) => redact(item))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, redact(child, childKey)]))
  }
  if (typeof value === 'string') {
    return value
      .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [redacted]')
      .replace(/(password|token|secret|api[_ -]?key)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
  }
  return value
}

function sixDigitValues(text) {
  const value = String(text || '')
  const found = new Set()
  for (const match of value.matchAll(SIX_DIGIT)) found.add(match[0])
  for (const match of value.matchAll(GROUPED_SIX_DIGIT)) found.add(match[0].replace(/[- ]/g, ''))
  return [...found]
}

function scoreCandidate(code, context) {
  let score = 1
  if (INTERESTING_TEXT.test(context)) score += 4
  if (/join|connect|invite/i.test(context)) score += 5
  if (/registered|registration|session|instance/i.test(context)) score += 3
  if (BUILD_CONTEXT.test(context)) score -= 5
  if (/\b20\d{2}[.\/-]?\d{2}/.test(context)) score -= 2
  return { code, score, context: context.trim().slice(0, 500) }
}

function collectFromObject(value, path = '$', output = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectFromObject(item, `${path}[${index}]`, output))
    return output
  }
  if (!value || typeof value !== 'object') return output

  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`
    if (REDACT_KEY.test(key)) continue

    if (INTERESTING_KEY.test(key)) {
      const safe = redact(child, key)
      const rendered = typeof safe === 'string' ? safe : JSON.stringify(safe)
      output.push({ type: 'field', path: childPath, value: rendered?.slice(0, 500) ?? String(safe) })
      for (const code of sixDigitValues(rendered)) {
        output.push({ type: 'candidate', ...scoreCandidate(code, `${childPath}: ${rendered}`) })
      }
    } else if (typeof child === 'string' || typeof child === 'number') {
      const rendered = String(child)
      for (const code of sixDigitValues(rendered)) {
        output.push({ type: 'candidate', ...scoreCandidate(code, `${childPath}: ${rendered}`) })
      }
    }

    collectFromObject(child, childPath, output)
  }
  return output
}

async function fetchJson(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    const text = await response.text()
    let body = null
    try { body = text ? JSON.parse(text) : null } catch { body = text }
    return { response, body, text }
  } finally {
    clearTimeout(timeout)
  }
}

async function probeRcon(index) {
  const number = index + 1
  const { url, password } = rconConfig(index)
  console.log(`\n=== RCON server ${number} ===`)
  if (!url || !password) {
    console.log('Not configured; skipping RCON probe.')
    return []
  }

  let base
  try { base = new URL(url) } catch {
    console.log(`Invalid RCON URL: ${url}`)
    return []
  }

  const headers = { Authorization: `Bearer ${password}`, Accept: 'application/json' }
  const capabilitiesUrl = new URL('/v1/capabilities', base).toString()
  let capabilities
  try {
    const result = await fetchJson(capabilitiesUrl, { headers })
    if (!result.response.ok || !result.body || typeof result.body !== 'object') {
      console.log(`Capabilities unavailable: HTTP ${result.response.status}`)
      return []
    }
    capabilities = result.body
  } catch (error) {
    console.log(`Capabilities request failed: ${error?.message || error}`)
    return []
  }

  const advertised = Array.isArray(capabilities.routes) ? capabilities.routes : []
  const getRoutes = advertised
    .map((route) => String(route).trim())
    .filter((route) => /^GET\s+\/v1\//i.test(route))
    .map((route) => route.replace(/^GET\s+/i, '').split('?')[0])
    .filter((path) => !/[{}]/.test(path))
    .filter((path) => !SKIP_RCON_PATH.test(path))

  const preferred = getRoutes.filter((path) => /(status|health|session|join|connect|instance|server|info|detail|code)/i.test(path))
  const routes = [...new Set(['/v1/status', '/v1/health', ...preferred])]
  console.log(`Advertised routes: ${advertised.length}; safe candidate GET routes to inspect: ${routes.length}`)

  const findings = []
  for (const path of routes) {
    try {
      const result = await fetchJson(new URL(path, base).toString(), { headers })
      if (!result.response.ok) {
        console.log(`  ${path}: HTTP ${result.response.status}`)
        continue
      }
      const found = collectFromObject(result.body)
      const fields = found.filter((entry) => entry.type === 'field')
      const candidates = found.filter((entry) => entry.type === 'candidate')
      console.log(`  ${path}: OK${fields.length ? `; ${fields.length} interesting field(s)` : ''}${candidates.length ? `; ${candidates.length} six-digit candidate(s)` : ''}`)
      for (const field of fields.slice(0, 20)) console.log(`    field ${field.path} = ${field.value}`)
      findings.push(...candidates.map((candidate) => ({ ...candidate, source: `RCON ${number} ${path}` })))
    } catch (error) {
      console.log(`  ${path}: failed (${error?.message || error})`)
    }
  }
  return findings
}

async function bisectRequest(path) {
  const apiKey = process.env.BISECT_API_KEY
  if (!apiKey) throw new Error('BISECT_API_KEY is not configured')
  const result = await fetchJson(`${BISECT_PANEL_HOST}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
  })
  if (!result.response.ok) throw new Error(`HTTP ${result.response.status}: ${String(result.text || '').slice(0, 160)}`)
  return result.body
}

function fileRows(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.data)) return payload.data
  if (Array.isArray(payload?.files)) return payload.files
  return []
}

function fileName(row) {
  const data = row?.attributes ?? row ?? {}
  return String(data.name || data.filename || data.file || data.path || '').trim()
}

function fileModified(row) {
  const data = row?.attributes ?? row ?? {}
  const raw = data.modified_at || data.modifiedAt || data.updated_at || data.updatedAt || data.mtime || ''
  const time = Date.parse(raw)
  return Number.isFinite(time) ? time : 0
}

async function listBisectLogs(identifier) {
  const encoded = encodeURIComponent(identifier)
  const directories = ['/Saved/Logs', 'Saved/Logs', '/home/container/Saved/Logs']
  const failures = []
  for (const directory of directories) {
    try {
      const query = new URLSearchParams({ directory }).toString()
      const body = await bisectRequest(`/api/client/servers/${encoded}/files/list?${query}`)
      const rows = fileRows(body)
      if (rows.length) return { directory, rows }
      failures.push(`${directory}: empty`)
    } catch (error) {
      failures.push(`${directory}: ${error?.message || error}`)
    }
  }
  throw new Error(`Unable to list Saved/Logs (${failures.join('; ')})`)
}

async function readBisectFile(identifier, path) {
  const encoded = encodeURIComponent(identifier)
  const query = new URLSearchParams({ file: path }).toString()
  const apiKey = process.env.BISECT_API_KEY
  const result = await fetchJson(`${BISECT_PANEL_HOST}/api/client/servers/${encoded}/files/contents?${query}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'text/plain, application/json' },
  })
  if (!result.response.ok) throw new Error(`HTTP ${result.response.status}`)
  if (typeof result.body === 'string') return result.body
  if (typeof result.body?.contents === 'string') return result.body.contents
  if (typeof result.body?.content === 'string') return result.body.content
  return result.text
}

function interestingLogLines(text) {
  const lines = String(text || '').split(/\r?\n/)
  const output = []
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const codes = sixDigitValues(line)
    if (!INTERESTING_TEXT.test(line) && !codes.length) continue
    const context = lines.slice(Math.max(0, index - 1), Math.min(lines.length, index + 2)).join('\n')
    const safe = redact(context)
    output.push({ line: index + 1, text: safe.slice(0, 1000), codes })
  }
  return output
}

async function probeBisectLogs(identifier, index) {
  console.log(`\n=== Bisect game logs server ${index + 1} (${identifier}) ===`)
  try {
    const { directory, rows } = await listBisectLogs(identifier)
    const logRows = rows
      .filter((row) => /\.log$|log/i.test(fileName(row)))
      .sort((a, b) => fileModified(b) - fileModified(a))
      .slice(0, 4)

    if (!logRows.length) {
      console.log(`No log files found in ${directory}.`)
      return []
    }

    const findings = []
    for (const row of logRows) {
      const name = fileName(row)
      const path = `${directory.replace(/\/$/, '')}/${name}`
      console.log(`  scanning ${name}`)
      let text
      try { text = await readBisectFile(identifier, path) } catch (error) {
        console.log(`    unable to read: ${error?.message || error}`)
        continue
      }

      const hits = interestingLogLines(text)
      for (const hit of hits.slice(-80)) {
        const relevantCodes = sixDigitValues(hit.text)
        if (relevantCodes.length || /(register|session|join|connect|instance|backend)/i.test(hit.text)) {
          console.log(`    line ~${hit.line}: ${hit.text.replace(/\s+/g, ' ').slice(0, 420)}`)
        }
        for (const code of relevantCodes) {
          findings.push({ ...scoreCandidate(code, hit.text), source: `Bisect ${identifier} ${name}:${hit.line}` })
        }
      }
    }
    return findings
  } catch (error) {
    console.log(`Bisect log probe unavailable: ${error?.message || error}`)
    return []
  }
}

function printSummary(findings) {
  console.log('\n=== Join-code candidates ===')
  const deduped = new Map()
  for (const item of findings) {
    const existing = deduped.get(item.code)
    if (!existing || item.score > existing.score) deduped.set(item.code, item)
  }
  const ranked = [...deduped.values()].sort((a, b) => b.score - a.score)
  if (!ranked.length) {
    console.log('No six-digit candidates were found on the authorised RCON/Bisect surfaces tested.')
    return
  }
  for (const item of ranked.slice(0, 20)) {
    console.log(`- ${item.code}  score=${item.score}  source=${item.source}`)
    console.log(`  ${item.context.replace(/\s+/g, ' ').slice(0, 500)}`)
  }
  console.log('\nHigh scores are clues, not proof. A real join code should correlate with the code shown in the WARDOGS client and change after a server restart.')
}

async function main() {
  console.log('WARDOGS join-code diagnostic')
  console.log('This probe uses only configured WDRCON endpoints and your Bisect server/file API. It does not call WARDOGS private backend services.')

  const all = []
  for (let index = 0; index < 3; index += 1) all.push(...await probeRcon(index))

  const ids = configuredBisectIds()
  if (!process.env.BISECT_API_KEY) {
    console.log('\nBISECT_API_KEY is not configured; skipping Bisect log inspection.')
  } else if (!ids.length) {
    console.log('\nNo Bisect server IDs are configured; skipping Bisect log inspection.')
  } else {
    for (let index = 0; index < ids.length; index += 1) {
      all.push(...await probeBisectLogs(ids[index], index))
    }
  }

  printSummary(all)
}

main().catch((error) => {
  console.error('\nProbe failed:', error)
  process.exitCode = 1
})
