import '../env.js'
import { ActivityType, Client, Events, GatewayIntentBits } from 'discord.js'

const DEFAULT_REFRESH_MS = 30_000
const MIN_REFRESH_MS = 15_000
const REQUEST_TIMEOUT_MS = 8_000

function env(name, fallback = '') {
  return String(process.env[name] ?? fallback).trim()
}

function refreshInterval() {
  const configured = Number(process.env.DISCORD_STATUS_REFRESH_MS || DEFAULT_REFRESH_MS)
  if (!Number.isFinite(configured)) return DEFAULT_REFRESH_MS
  return Math.max(MIN_REFRESH_MS, configured)
}

function statusApiUrl() {
  const defaultUrl = `http://127.0.0.1:${Number(process.env.PORT) || 3000}/api/servers`
  return env('DISCORD_STATUS_API_URL', defaultUrl)
}

const botDefinitions = [
  {
    number: 1,
    token: env('DISCORD_WARDOGS_SERVER_1_BOT_TOKEN'),
    serverIdentifier: env('DISCORD_WARDOGS_SERVER_1_IDENTIFIER', '278c7bc5'),
  },
  {
    number: 2,
    token: env('DISCORD_WARDOGS_SERVER_2_BOT_TOKEN'),
    serverIdentifier: env('DISCORD_WARDOGS_SERVER_2_IDENTIFIER', '9290beb1'),
  },
]

const bots = botDefinitions
  .filter((definition) => definition.token)
  .map((definition) => ({
    ...definition,
    client: new Client({ intents: [GatewayIntentBits.Guilds] }),
  }))

function findServer(servers, definition) {
  return servers.find((server) => server?.identifier === definition.serverIdentifier)
    || servers.find((server) => server?.id === `wardogs-${definition.serverIdentifier}`)
    || null
}

function presenceFor(server) {
  if (!server) {
    return {
      status: 'idle',
      activity: 'Status unavailable',
    }
  }

  const current = Number.isFinite(server.playerCount) ? server.playerCount : null
  const max = Number.isFinite(server.maxPlayers) ? server.maxPlayers : null
  const players = current !== null && max !== null
    ? `${current}/${max} players`
    : String(server.players || 'players unavailable')

  if (String(server.status).toLowerCase() === 'online') {
    return {
      status: 'online',
      activity: `Online • ${players}`,
    }
  }

  if (String(server.status).toLowerCase() === 'offline') {
    return {
      status: 'dnd',
      activity: `Offline • ${players}`,
    }
  }

  return {
    status: 'idle',
    activity: `${server.status || 'Unavailable'} • ${players}`,
  }
}

async function loadServers() {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(statusApiUrl(), {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`server API returned HTTP ${response.status}`)
    }

    const payload = await response.json()
    if (!Array.isArray(payload?.servers)) {
      throw new Error('server API response did not contain a servers array')
    }

    return payload.servers
  } finally {
    clearTimeout(timeout)
  }
}

async function refreshPresences() {
  if (!bots.some(({ client }) => client.isReady())) return

  let servers
  try {
    servers = await loadServers()
  } catch (error) {
    console.error(`Unable to load WARDOGS status from ${statusApiUrl()}:`, error.message)
    servers = []
  }

  for (const bot of bots) {
    if (!bot.client.isReady()) continue

    const server = findServer(servers, bot)
    const presence = presenceFor(server)

    bot.client.user.setPresence({
      status: presence.status,
      activities: [{
        name: presence.activity,
        type: ActivityType.Watching,
      }],
    })

    console.log(
      `[Discord Server #${bot.number}] ${bot.client.user.tag}: ${presence.activity}`,
    )
  }
}

if (!bots.length) {
  console.error('No Discord status bot tokens are configured.')
  console.error('Set DISCORD_WARDOGS_SERVER_1_BOT_TOKEN and/or DISCORD_WARDOGS_SERVER_2_BOT_TOKEN in .env.')
  process.exit(1)
}

console.log(`Discord status source: ${statusApiUrl()}`)

for (const bot of bots) {
  bot.client.once(Events.ClientReady, (readyClient) => {
    console.log(`[Discord Server #${bot.number}] logged in as ${readyClient.user.tag}`)
    refreshPresences().catch((error) => console.error('Initial Discord presence refresh failed:', error))
  })

  bot.client.on(Events.Error, (error) => {
    console.error(`[Discord Server #${bot.number}] client error:`, error)
  })

  bot.client.login(bot.token).catch((error) => {
    console.error(`[Discord Server #${bot.number}] login failed:`, error.message)
  })
}

const timer = setInterval(() => {
  refreshPresences().catch((error) => console.error('Discord presence refresh failed:', error))
}, refreshInterval())

timer.unref?.()

async function shutdown(signal) {
  console.log(`Received ${signal}; shutting down Discord status bots.`)
  clearInterval(timer)
  for (const { client } of bots) client.destroy()
  process.exit(0)
}

process.once('SIGINT', () => shutdown('SIGINT'))
process.once('SIGTERM', () => shutdown('SIGTERM'))
