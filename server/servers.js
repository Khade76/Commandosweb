import { bisectConfigured, getBisectServerIdentifiers, getBisectWardogsServer, getWardogsJoinId } from './providers/bisect.js'
import { getWardogsRconStatus, wardogsRconConfigured } from './providers/wardogs-rcon.js'

const DEFAULT_SERVER_IDENTIFIERS = ['278c7bc5', '9290beb1']

function fallbackWardogsServer(identifier, index, overrides = {}) {
  return {
    id: identifier ? `wardogs-${identifier}` : `wardogs-${index + 1}`,
    identifier: identifier || null,
    joinId: getWardogsJoinId(index),
    name: process.env[`WARDOGS_SERVER_${index + 1}_NAME`] || `44th Commando Regiment — WARDOGS #${index + 1}`,
    status: identifier ? 'Unavailable' : 'Configuration Required',
    region: process.env[`WARDOGS_SERVER_${index + 1}_REGION`] || process.env.WARDOGS_SERVER_REGION || 'Europe / UK',
    players: `— / ${process.env[`WARDOGS_SERVER_${index + 1}_MAX_PLAYERS`] || process.env.WARDOGS_MAX_PLAYERS || 100}`,
    playerCount: null,
    maxPlayers: Number(process.env[`WARDOGS_SERVER_${index + 1}_MAX_PLAYERS`] || process.env.WARDOGS_MAX_PLAYERS || 100),
    map: '—',
    mode: 'WARDOGS',
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

async function getWardogsServer(identifier, index) {
  const cacheKey = identifier || `server-${index + 1}`
  const cached = cache.get(cacheKey)
  if (cached && Date.now() < cached.expiresAt) return cached.value

  let value = fallbackWardogsServer(identifier, index)

  if (bisectConfigured() && identifier) {
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

function configuredServerIdentifiers() {
  const bisectIdentifiers = getBisectServerIdentifiers()
  if (bisectIdentifiers.length) return bisectIdentifiers

  return DEFAULT_SERVER_IDENTIFIERS.filter((_identifier, index) => wardogsRconConfigured(index))
}

export async function getServers() {
  const identifiers = configuredServerIdentifiers()

  if (!identifiers.length) {
    return [
      fallbackWardogsServer(null, 0, {
        notes: 'Configure Bisect or WARDOGS RCON on OVH to enable live status.',
      }),
      trainingServer,
    ]
  }

  const liveServers = await Promise.all(
    identifiers.map((identifier, index) => getWardogsServer(identifier, index)),
  )

  return [...liveServers, trainingServer]
}
