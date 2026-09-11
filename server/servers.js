import { bisectConfigured, getBisectWardogsServer } from './providers/bisect.js'

const fallbackWardogsServer = {
  id: 'wardogs-main',
  name: '44th Commando Regiment — WARDOGS Main',
  status: 'Configuration Required',
  region: 'Europe / UK',
  players: '— / 100',
  playerCount: null,
  maxPlayers: 100,
  map: '—',
  mode: 'WARDOGS',
  scores: {
    valkyra: null,
    lonestar: null,
    manticore: null,
  },
  scoreAvailable: false,
  provider: 'BisectHosting',
  address: '',
  notes: 'Live status will appear after the Bisect API key and canonical server UUID are configured on OVH.',
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

let cache = null
let cacheExpiresAt = 0
const CACHE_MS = 15_000

async function getWardogsServer() {
  if (!bisectConfigured()) return fallbackWardogsServer

  if (cache && Date.now() < cacheExpiresAt) return cache

  try {
    cache = await getBisectWardogsServer()
    cacheExpiresAt = Date.now() + CACHE_MS
    return cache
  } catch (error) {
    console.error('Unable to refresh Bisect WARDOGS server status:', error.message)
    return {
      ...fallbackWardogsServer,
      status: cache?.status || 'Unavailable',
      notes: 'Live server data is temporarily unavailable. The website will retry automatically.',
      ...(cache || {}),
    }
  }
}

export async function getServers() {
  return [await getWardogsServer(), trainingServer]
}
