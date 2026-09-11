const PANEL_HOST = (process.env.BISECT_PANEL_HOST || 'https://games.bisecthosting.com').replace(/\/$/, '')

function unwrap(payload) {
  return payload?.attributes ?? payload?.data?.attributes ?? payload ?? {}
}

function readPath(value, path) {
  return path.reduce((current, key) => current?.[key], value)
}

function firstValue(value, paths) {
  for (const path of paths) {
    const result = readPath(value, path)
    if (result !== undefined && result !== null && result !== '') return result
  }
  return undefined
}

function startupValue(payload, candidates) {
  const entries = Array.isArray(payload?.data) ? payload.data : []
  const wanted = new Set(candidates.map((candidate) => candidate.toUpperCase()))

  for (const entry of entries) {
    const attributes = unwrap(entry)
    const key = String(attributes.env_variable || attributes.variable || attributes.name || '').toUpperCase()
    if (!wanted.has(key)) continue
    return attributes.server_value ?? attributes.value ?? attributes.default_value
  }

  return undefined
}

function numericScore(value, faction) {
  const factionKey = faction.toLowerCase()
  const scoreObject = firstValue(value, [
    ['scores'],
    ['game_data', 'scores'],
    ['game', 'scores'],
    ['match', 'scores'],
    ['wardogs', 'scores'],
  ])

  if (!scoreObject || typeof scoreObject !== 'object') return null

  for (const [key, score] of Object.entries(scoreObject)) {
    if (key.toLowerCase() !== factionKey) continue
    const number = Number(score?.score ?? score?.points ?? score)
    return Number.isFinite(number) ? number : null
  }

  return null
}

async function bisectRequest(path, { optional = false } = {}) {
  const apiKey = process.env.BISECT_API_KEY
  if (!apiKey) throw new Error('BISECT_API_KEY is not configured')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)

  try {
    const response = await fetch(`${PANEL_HOST}${path}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    })

    if (optional && (response.status === 404 || response.status === 403)) return null
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`Bisect Starbase request failed (${response.status})${body ? `: ${body.slice(0, 180)}` : ''}`)
    }

    return response.json()
  } finally {
    clearTimeout(timeout)
  }
}

function countOnlinePlayers(payload) {
  if (!payload) return null
  if (Array.isArray(payload.data)) return payload.data.length
  if (Array.isArray(payload.players)) return payload.players.length
  const value = Number(payload.count ?? payload.online ?? payload.player_count)
  return Number.isFinite(value) ? value : null
}

export function bisectConfigured() {
  return Boolean(process.env.BISECT_API_KEY && process.env.BISECT_SERVER_UUID)
}

export async function getBisectWardogsServer() {
  const uuid = process.env.BISECT_SERVER_UUID
  if (!uuid) throw new Error('BISECT_SERVER_UUID is not configured')

  const encodedUuid = encodeURIComponent(uuid)
  const [detailsPayload, resourcesPayload, playersPayload, startupPayload] = await Promise.all([
    bisectRequest(`/api/client/servers/${encodedUuid}`),
    bisectRequest(`/api/client/servers/${encodedUuid}/resources`),
    bisectRequest(`/api/client/servers/${encodedUuid}/player/online`, { optional: true }),
    bisectRequest(`/api/client/servers/${encodedUuid}/startup`, { optional: true }),
  ])

  const details = unwrap(detailsPayload)
  const resources = unwrap(resourcesPayload)
  const online = countOnlinePlayers(playersPayload)

  const configuredMax = Number(process.env.WARDOGS_MAX_PLAYERS || 100)
  const startupMax = Number(startupValue(startupPayload, ['MAX_PLAYERS', 'MAXPLAYERS', 'SERVER_MAX_PLAYERS']))
  const maxPlayers = Number.isFinite(startupMax) && startupMax > 0 ? startupMax : configuredMax

  const currentState = String(firstValue(resources, [
    ['current_state'],
    ['state'],
  ]) || 'unknown').toLowerCase()

  const onlineState = ['running', 'ready', 'online'].includes(currentState)
  const map = firstValue(details, [
    ['current_map'],
    ['map'],
    ['game_data', 'map'],
    ['game', 'map'],
    ['match', 'map'],
  ]) || startupValue(startupPayload, ['CURRENT_MAP', 'MAP', 'MAP_NAME', 'SERVER_MAP']) || '—'

  const mode = firstValue(details, [
    ['game_mode'],
    ['mode'],
    ['game_data', 'mode'],
    ['game', 'mode'],
    ['match', 'mode'],
  ]) || startupValue(startupPayload, ['GAME_MODE', 'MODE', 'SERVER_MODE']) || 'WARDOGS'

  const scores = {
    valkyra: numericScore(details, 'valkyra'),
    lonestar: numericScore(details, 'lonestar'),
    manticore: numericScore(details, 'manticore'),
  }

  return {
    id: 'wardogs-main',
    name: process.env.WARDOGS_PUBLIC_SERVER_NAME || details.name || '44th Commando Regiment — WARDOGS Main',
    status: onlineState ? 'Online' : currentState === 'unknown' ? 'Unknown' : 'Offline',
    region: process.env.WARDOGS_SERVER_REGION || 'Europe / UK',
    players: online === null ? `— / ${maxPlayers}` : `${online} / ${maxPlayers}`,
    playerCount: online,
    maxPlayers,
    map: String(map),
    mode: String(mode),
    scores,
    scoreAvailable: Object.values(scores).some((score) => score !== null),
    provider: 'BisectHosting',
    notes: 'Live server information supplied through the BisectHosting Starbase API.',
    address: process.env.WARDOGS_PUBLIC_JOIN_INFO || '',
    updatedAt: new Date().toISOString(),
  }
}
