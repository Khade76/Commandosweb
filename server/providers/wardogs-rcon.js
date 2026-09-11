function envValue(index, suffix) {
  const n = index + 1
  return process.env[`WARDOGS_RCON_SERVER_${n}_${suffix}`] || process.env[`WARDOGS_RCON_${n}_${suffix}`] || ''
}

function normaliseBaseUrl(value) {
  return String(value || '').trim().replace(/\/$/, '')
}

function finiteNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function scoreValue(row) {
  if (!row || typeof row !== 'object') return null

  for (const key of ['score', 'points', 'value', 'current', 'tickets', 'total', 'amount']) {
    const number = finiteNumber(row[key])
    if (number !== null) return number
  }

  return null
}

function factionScores(rows) {
  const scores = {
    valkyra: null,
    lonestar: null,
    manticore: null,
  }

  if (!Array.isArray(rows)) return scores

  for (const row of rows) {
    const name = String(row?.name || '').trim().toLowerCase()
    const value = scoreValue(row)
    if (!name || value === null) continue

    if (name.includes('valkyra')) scores.valkyra = value
    else if (name.includes('lonestar')) scores.lonestar = value
    else if (name.includes('manticore')) scores.manticore = value
  }

  return scores
}

function experienceMode(experience) {
  const value = String(experience || '').trim()
  if (!value) return ''

  // WARDOGS experience IDs currently look like Bakurani_KOTH_01.
  // Use the middle mode token for the public card while retaining the raw IDs separately.
  const match = value.match(/_([A-Za-z0-9]+)_\d+$/)
  return match?.[1]?.toUpperCase() || value
}

function displayMode(experiences, fallback = 'WARDOGS') {
  const modes = [...new Set(experiences.map(experienceMode).filter(Boolean))]
  return modes.length ? modes.join(' + ') : fallback
}

export function getWardogsRconConfig(index = 0) {
  return {
    url: normaliseBaseUrl(envValue(index, 'URL')),
    password: envValue(index, 'PASSWORD'),
  }
}

export function wardogsRconConfigured(index = 0) {
  const config = getWardogsRconConfig(index)
  return Boolean(config.url && config.password)
}

async function rconRequest(index, path) {
  const { url, password } = getWardogsRconConfig(index)
  if (!url || !password) throw new Error(`WARDOGS RCON server ${index + 1} is not configured`)

  let parsed
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`WARDOGS RCON server ${index + 1} URL is invalid`)
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('WARDOGS RCON URL must use HTTP or HTTPS')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 6000)

  try {
    const response = await fetch(`${url}${path}`, {
      headers: {
        Authorization: `Bearer ${password}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    })

    const text = await response.text()
    let body = null
    try { body = text ? JSON.parse(text) : null } catch { body = null }

    if (!response.ok) {
      const message = body?.error?.message || body?.message || body?.error || text.slice(0, 160) || response.statusText
      throw new Error(`WARDOGS RCON request failed (${response.status}): ${message}`)
    }

    return body || {}
  } finally {
    clearTimeout(timeout)
  }
}

export async function getWardogsRconStatus(index = 0, base = {}) {
  const status = await rconRequest(index, '/v1/status')
  const currentPlayers = finiteNumber(status?.players?.current)
  const maxPlayers = finiteNumber(status?.players?.max)
  const scores = factionScores(status?.factionScores)
  const experiences = Array.isArray(status?.experiences)
    ? status.experiences.filter(Boolean).map(String)
    : []

  const resolvedCurrent = currentPlayers ?? base.playerCount ?? null
  const resolvedMax = maxPlayers ?? base.maxPlayers ?? null

  return {
    ...base,
    name: status.serverName || base.name,
    status: 'Online',
    players: resolvedMax === null
      ? String(resolvedCurrent ?? '—')
      : `${resolvedCurrent ?? '—'} / ${resolvedMax}`,
    playerCount: resolvedCurrent,
    maxPlayers: resolvedMax,
    map: status.map || base.map || '—',
    mode: displayMode(experiences, base.mode || 'WARDOGS'),
    experiences,
    lighting: status.lighting || null,
    matchSeconds: finiteNumber(status.matchSeconds),
    scoreCap: finiteNumber(status.scoreCap),
    scoreTick: status.scoreTick || null,
    scores,
    factionScores: Array.isArray(status.factionScores) ? status.factionScores : [],
    scoreAvailable: Object.values(scores).some((score) => score !== null),
    rotation: status.rotation || null,
    provider: base.provider ? `WARDOGS RCON + ${base.provider}` : 'WARDOGS RCON',
    notes: 'Live match data supplied directly by the WARDOGS RCON API.',
    updatedAt: new Date().toISOString(),
  }
}

export async function testWardogsRcon(index = 0) {
  const [status, capabilities] = await Promise.all([
    rconRequest(index, '/v1/status'),
    rconRequest(index, '/v1/capabilities').catch(() => null),
  ])

  return { status, capabilities }
}
