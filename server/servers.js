import { bisectConfigured, getBisectServerIdentifiers, getBisectWardogsServer } from './providers/bisect.js'

function fallbackWardogsServer(identifier, index, overrides = {}) {
  return {
    id: identifier ? `wardogs-${identifier}` : `wardogs-${index + 1}`,
    identifier: identifier || null,
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
    provider: 'BisectHosting',
    address: process.env[`WARDOGS_SERVER_${index + 1}_JOIN_INFO`] || '',
    notes: identifier
      ? 'Live server data is temporarily unavailable. The website will retry automatically.'
      : 'Configure the Bisect API key and server identifier on OVH to enable live status.',
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
  const cached = cache.get(identifier)
  if (cached && Date.now() < cached.expiresAt) return cached.value

  try {
    const value = await getBisectWardogsServer(identifier, index)
    cache.set(identifier, { value, expiresAt: Date.now() + CACHE_MS })
    return value
  } catch (error) {
    console.error(`Unable to refresh Bisect WARDOGS server ${identifier}:`, error.message)
    return fallbackWardogsServer(identifier, index, cached?.value || {})
  }
}

export async function getServers() {
  if (!bisectConfigured()) return [fallbackWardogsServer(null, 0), trainingServer]

  const identifiers = getBisectServerIdentifiers()
  const liveServers = await Promise.all(
    identifiers.map((identifier, index) => getWardogsServer(identifier, index)),
  )

  return [...liveServers, trainingServer]
}
