import { servers as directory } from '../src/data/site.js'
import { getBisectServerIdentifiers, getWardogsJoinCode } from './providers/bisect.js'

const SERVER_IDS = ['wardogs-278c7bc5', 'wardogs-9290beb1', 'wardogs-9f71e8ef', 'wardogs-12577', 'wardogs-12648']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const WEBSITE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/

function blank(value) {
  return value === undefined || value === null || (typeof value === 'string' && !value.trim())
}

export function validSteamLobbyId(value) {
  if (typeof value !== 'string' || !/^[1-9][0-9]{16,19}$/.test(value)) return null
  return BigInt(value) <= 18446744073709551615n ? value : null
}

function lobbyFromUrl(value) {
  if (typeof value !== 'string') return null
  const match = value.match(/^steam:\/\/joinlobby\/1867240\/([1-9][0-9]{16,19})\/?$/)
  return match ? validSteamLobbyId(match[1]) : null
}

function configuredLobby(server) {
  const rawId = server.steamLobbyId ?? ''
  const rawUrl = server.steamJoinUrl ?? ''
  const id = validSteamLobbyId(rawId)
  const fromUrl = lobbyFromUrl(rawUrl)
  if ((!blank(rawId) && !id) || (!blank(rawUrl) && !fromUrl)) return null
  if (id && fromUrl && id !== fromUrl) return null
  return id || fromUrl
}

function result(server, lobby) {
  return {
    status: 200,
    body: {
      server,
      steamLobbyId: lobby,
      steamJoinUrl: lobby ? `steam://joinlobby/1867240/${lobby}` : null,
      available: Boolean(lobby),
      ...(lobby ? {} : { message: 'Direct joining is not available right now. Use the join code below.' }),
    },
  }
}

function error(status, message) {
  return { status, body: { error: {
    400: 'Invalid join request. Specify exactly one server or a valid Steam lobby ID.',
    404: 'Server not found.',
    503: 'WARDOGS joining is not configured.',
  }[status] || message } }
}

// Matches the PHP production endpoint. All destination data is allowlisted;
// this endpoint makes no outbound requests and accepts no redirect URL.
export function joinResponse(rawQuery, config = null) {
  if (typeof rawQuery !== 'string' || rawQuery.length > 2048 || rawQuery.includes('&') || /%(?![0-9a-f]{2})/i.test(rawQuery)) {
    return error(400, 'Choose one server or Steam lobby.')
  }
  const query = new URLSearchParams(rawQuery)
  const entries = [...query.entries()]
  if (entries.length !== 1 || !['server', 'lobby'].includes(entries[0][0])) {
    return error(400, 'Choose one server or Steam lobby.')
  }
  const [selector, value] = entries[0]
  if (selector === 'lobby') {
    const lobby = validSteamLobbyId(value)
    return lobby
      ? result({ id: null, number: null, name: 'WARDOGS', joinCode: null }, lobby)
      : error(400, 'The Steam lobby ID is invalid.')
  }
  if (!WEBSITE_ID.test(value) || (/^[0-9]+$/.test(value) && !/^[1-5]$/.test(value))) {
    return error(400, 'The server identifier is invalid.')
  }
  if (!config || !Array.isArray(config.servers)) return error(503, 'Server joining is temporarily unavailable.')

  const records = []
  for (const server of config.servers) {
    if (!server || typeof server !== 'object' || Array.isArray(server)
      || typeof server.id !== 'string' || !WEBSITE_ID.test(server.id)) {
      return error(503, 'Server joining is temporarily unavailable.')
    }
    const explicit = server.number
    const hasNumber = !blank(explicit)
    if (hasNumber && !/^[1-5]$/.test(String(explicit))) {
      return error(503, 'Server joining is temporarily unavailable.')
    }
    if (hasNumber && !['number', 'string'].includes(typeof explicit)) {
      return error(503, 'Server joining is temporarily unavailable.')
    }
    const knownIndex = SERVER_IDS.indexOf(server.id)
    const number = hasNumber ? Number(explicit) : (knownIndex < 0 ? null : knownIndex + 1)
    records.push({ server, number, knownIndex })
  }
  const numeric = /^[1-5]$/.test(value)
  const matches = records.filter(({ server, number }) => numeric ? number === Number(value) : server.id === value)
  if (matches.length > 1) return error(503, 'Server joining is temporarily unavailable.')
  if (!matches.length || matches[0].server.enabled === false) return error(404, 'That server is not available.')

  const { server, number, knownIndex } = matches[0]
  const configuredCodes = [server.joinCode, server.joinId]
  if (knownIndex >= 0 && configuredCodes.every(blank)) {
    configuredCodes.push(directory.find((item) => item.id === server.id)?.joinCode)
  }
  const joinCode = configuredCodes.find((code) => typeof code === 'string' && UUID.test(code.trim()))?.trim().toLowerCase() || null
  const name = typeof server.name === 'string' && server.name.trim()
    ? server.name.trim().slice(0, 200)
    : (number ? `44th Commandos #${number}` : 'WARDOGS')
  return result({ id: server.id, number, name, joinCode }, configuredLobby(server))
}

export function localJoinConfig() {
  const bisectIds = getBisectServerIdentifiers()
  return { servers: SERVER_IDS.map((defaultId, index) => {
    const id = index < 3 && bisectIds[index] ? `wardogs-${bisectIds[index]}` : defaultId
    const number = index + 1
    return {
      id,
      number,
      name: process.env[`WARDOGS_SERVER_${number}_NAME`] || directory.find((server) => server.id === defaultId)?.name,
      joinCode: getWardogsJoinCode(index),
      steamLobbyId: process.env[`WARDOGS_SERVER_${number}_STEAM_LOBBY_ID`] || '',
      steamJoinUrl: process.env[`WARDOGS_SERVER_${number}_STEAM_JOIN_URL`] || '',
    }
  }) }
}
