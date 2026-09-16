import { bisectConfigured, getBisectServerIdentifiers, getBisectWardogsServer, getWardogsJoinCode } from './providers/bisect.js'
import { getWardogsRconStatus, wardogsRconConfigured } from './providers/wardogs-rcon.js'
import { servers as serverDirectory } from '../src/data/site.js'

const DEFAULT_SERVER_IDENTIFIERS = ['278c7bc5', '9290beb1', '9f71e8ef', '12577', '12648']

function fallbackWardogsServer(identifier, index, overrides = {}) {
  return {
    id: identifier ? `wardogs-${identifier}` : `wardogs-${index + 1}`,
    identifier: identifier || null,
    joinCode: getWardogsJoinCode(index),
    joinId: getWardogsJoinCode(index),
    name: process.env[`WARDOGS_SERVER_${index + 1}_NAME`] || serverDirectory[index]?.name || `44th Commando Regiment — WARDOGS #${index + 1}`,
    status: identifier ? 'Unavailable' : 'Configuration Required',
    region: process.env[`WARDOGS_SERVER_${index + 1}_REGION`] || process.env.WARDOGS_SERVER_REGION || serverDirectory[index]?.region || 'Europe / UK',
    players: `— / ${process.env[`WARDOGS_SERVER_${index + 1}_MAX_PLAYERS`] || process.env.WARDOGS_MAX_PLAYERS || 100}`,
    playerCount: null,
    maxPlayers: Number(process.env[`WARDOGS_SERVER_${index + 1}_MAX_PLAYERS`] || process.env.WARDOGS_MAX_PLAYERS || 100),
    map: '—',
    mode: serverDirectory[index]?.mode || 'WARDOGS',
    scores: {
      valkyra: null,
      lonestar: null,
      manticore: null,
    },
    scoreAvailable: false,
    provider: null,
    address: process.env[`WARDOGS_SERVER_${index + 1}_JOIN_INFO`] || '',
    notes: 'Live server data is temporarily unavailable. The website will retry automatically.',
    ...overrides,
  }
}

const trainingServer = {
  id: 'training-events',
  name: '44th Training & Events',
  status: 'Planned',
  region: 'Europe / UK',
  players: '—',
  map: '—',
  mode: 'Events / Training',
  scores: null,
  scoreAvailable: false,
  address: 'Future space for training, events and organised community nights.',
  notes: 'Can later show event passwords, whitelisting and restart notices.',
}

const cache = new Map()
const CACHE_MS = 15_000

async function getWardogsServer(identifier, index, useBisect) {
  const cacheKey = identifier || `server-${index + 1}`
  const cached = cache.get(cacheKey)
  if (cached && Date.now() < cached.expiresAt) return cached.value

  let value = fallbackWardogsServer(identifier, index)

  if (useBisect) {
    try {
      value = await getBisectWardogsServer(identifier, index)
    } catch (error) {
      console.error(`Unable to refresh Bisect WARDOGS server ${identifier}:`, error.message)
      value = cached?.value || value
    }
  }

  if (wardogsRconConfigured(index)) {
    try {
      value = await getWardogsRconStatus(index, value)
    } catch (error) {
      console.error(`Unable to refresh WARDOGS RCON server ${index + 1}:`, error.message)
    }
  }

  cache.set(cacheKey, { value, expiresAt: Date.now() + CACHE_MS })
  return value
}

function configuredServers() {
  const bisectIdentifiers = getBisectServerIdentifiers()
  // Keep the original slot index when only some RCON connections are configured.
  // XRealm (#4 and #5) are RCON-only and must never be queried through Bisect's panel API.
  return DEFAULT_SERVER_IDENTIFIERS.map((identifier, index) => ({
    identifier: index < 3 ? bisectIdentifiers[index] || identifier : identifier,
    index,
    useBisect: index < 3 && bisectConfigured() && Boolean(bisectIdentifiers[index]),
  })).filter(({ index, useBisect }) => useBisect || wardogsRconConfigured(index))
}

export async function getServers() {
  const configured = configuredServers()

  if (!configured.length) {
    return [
      ...DEFAULT_SERVER_IDENTIFIERS.map((identifier, index) => fallbackWardogsServer(identifier, index)),
      trainingServer,
    ]
  }

  const liveServers = await Promise.all(
    configured.map(({ identifier, index, useBisect }) => getWardogsServer(identifier, index, useBisect)),
  )

  return [...liveServers, trainingServer]
}
