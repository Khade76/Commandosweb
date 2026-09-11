const PANEL_HOST = (process.env.BISECT_PANEL_HOST || 'https://games.bisecthosting.com').replace(/\/$/, '')

const DEFAULT_JOIN_IDS = ['175590', '294832']

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

export function getBisectServerIdentifiers() {
  const configured = process.env.BISECT_SERVER_IDS || process.env.BISECT_SERVER_UUID || ''
  return configured
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
}

export function getWardogsJoinId(index = 0) {
  return process.env[`WARDOGS_SERVER_${index + 1}_JOIN_ID`] || DEFAULT_JOIN_IDS[index] || null
}

export function bisectConfigured() {
  return Boolean(process.env.BISECT_API_KEY && getBisectServerIdentifiers().length)
}

export async function getBisectWardogsServer(identifier, index = 0) {
  if (!identifier) throw new Error('Bisect server identifier is not configured')

  const encodedIdentifier = encodeURIComponent(identifier)
  const [detailsPayload, resourcesPayload, playersPayload, startupPayload] = await Promise.all([
    bisectRequest(`/api/client/servers/${encodedIdentifier}`),
    bisectRequest(`/api/client/servers/${encodedIdentifier}/resources`),
    bisectRequest(`/api/client/servers/${encodedIdentifier}/player/online`, { optional: true }),
    bisectRequest(`/api/client/servers/${encodedIdentifier}/startup`, { optional: true }),
  ])

  const details = unwrap(detailsPayload)
  const resources = unwrap(resourcesPayload)
  const online = countOnlinePlayers(playersPayload)

  const configuredMax = Number(process.env[`WARDOGS_SERVER_${index + 1}_MAX_PLAYERS`] || process.env.WARDOGS_MAX_PLAYERS || 100)
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

  const configuredName = process.env[`WARDOGS_SERVER_${index + 1}_NAME`]
  const configuredRegion = process.env[`WARDOGS_SERVER_${index + 1}_REGION`]
  const configuredJoinInfo = process.env[`WARDOGS_SERVER_${index + 1}_JOIN_INFO`]

  return {
    id: `wardogs-${identifier}`,
    identifier,
    joinId: getWardogsJoinId(index),
    name: configuredName || details.name || `44th Commando Regiment — WARDOGS #${index + 1}`,
    status: onlineState ? 'Online' : currentState === 'unknown' ? 'Unknown' : 'Offline',
    region: configuredRegion || process.env.WARDOGS_SERVER_REGION || 'Europe / UK',
    players: online === null ? `— / ${maxPlayers}` : `${online} / ${maxPlayers}`,
    playerCount: online,
    maxPlayers,
    map: String(map),
    mode: String(mode),
    scores,
    scoreAvailable: Object.values(scores).some((score) => score !== null),
    provider: 'BisectHosting',
    notes: 'Live server information supplied through the BisectHosting Starbase API.',
    address: configuredJoinInfo || process.env.WARDOGS_PUBLIC_JOIN_INFO || '',
    updatedAt: new Date().toISOString(),
  }
}
