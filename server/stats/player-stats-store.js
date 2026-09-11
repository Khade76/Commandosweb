import fs from 'node:fs'
import path from 'node:path'

const VALID_GROUPS = new Set(['normal', 'hardcore'])

function finiteNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function normaliseGroup(value) {
  const group = String(value || '').trim().toLowerCase()
  return VALID_GROUPS.has(group) ? group : 'normal'
}

function normaliseFaction(value) {
  const faction = String(value || '').trim()
  return faction || 'Unknown'
}

function normalisePlayer(player) {
  const steamId = String(
    player?.steamId
    ?? player?.steamID
    ?? player?.steam_id
    ?? player?.playerId
    ?? player?.id
    ?? '',
  ).trim()

  const rawName = player?.name ?? player?.playerName ?? steamId
  const name = String(rawName || 'Unknown Player').trim()

  if (!steamId) return null

  return {
    steamId,
    name,
    faction: normaliseFaction(player?.faction ?? player?.team),
    kills: finiteNumber(player?.kills),
    deaths: finiteNumber(player?.deaths),
    cash: finiteNumber(player?.cash),
    pingMs: finiteNumber(player?.pingMs ?? player?.ping),
  }
}

function createGroupStats(nowIso) {
  return {
    firstSeen: nowIso,
    lastSeen: nowIso,
    totalKills: 0,
    totalDeaths: 0,
    matchesSeen: 0,
    secondsTracked: 0,
    peakKillsInMatch: 0,
    peakCash: 0,
    factionCounts: {},
    serverCounts: {},
  }
}

function migrateLegacyPlayer(player) {
  const firstSeen = player.firstSeen || new Date().toISOString()
  const lastSeen = player.lastSeen || firstSeen
  const normalStats = {
    firstSeen,
    lastSeen,
    totalKills: finiteNumber(player.totalKills),
    totalDeaths: finiteNumber(player.totalDeaths),
    matchesSeen: finiteNumber(player.matchesSeen),
    secondsTracked: finiteNumber(player.secondsTracked),
    peakKillsInMatch: finiteNumber(player.peakKillsInMatch),
    peakCash: finiteNumber(player.peakCash),
    factionCounts: player.factionCounts || {},
    serverCounts: player.serverCounts || {},
  }

  return {
    steamId: player.steamId,
    name: player.name || player.steamId || 'Unknown Player',
    aliases: Array.isArray(player.aliases) ? player.aliases : [],
    firstSeen,
    lastSeen,
    online: false,
    currentServer: null,
    currentGroup: null,
    currentFaction: null,
    currentPingMs: null,
    currentCash: null,
    groups: {
      normal: normalStats,
    },
  }
}

function normaliseStoredPlayer(player) {
  if (!player || typeof player !== 'object') return null
  if (!player.groups || typeof player.groups !== 'object') return migrateLegacyPlayer(player)

  return {
    ...player,
    aliases: Array.isArray(player.aliases) ? player.aliases : [],
    online: false,
    currentServer: null,
    currentGroup: null,
    currentFaction: null,
    currentPingMs: null,
    currentCash: null,
    groups: Object.fromEntries(
      Object.entries(player.groups)
        .filter(([group]) => VALID_GROUPS.has(group))
        .map(([group, stats]) => [group, {
          firstSeen: stats?.firstSeen || player.firstSeen || new Date().toISOString(),
          lastSeen: stats?.lastSeen || player.lastSeen || player.firstSeen || new Date().toISOString(),
          totalKills: finiteNumber(stats?.totalKills),
          totalDeaths: finiteNumber(stats?.totalDeaths),
          matchesSeen: finiteNumber(stats?.matchesSeen),
          secondsTracked: finiteNumber(stats?.secondsTracked),
          peakKillsInMatch: finiteNumber(stats?.peakKillsInMatch),
          peakCash: finiteNumber(stats?.peakCash),
          factionCounts: stats?.factionCounts || {},
          serverCounts: stats?.serverCounts || {},
        }]),
    ),
  }
}

function publicPlayer(player, requestedGroup = 'normal') {
  const group = normaliseGroup(requestedGroup)
  const stats = player.groups?.[group]
  if (!stats) return null

  const kills = finiteNumber(stats.totalKills)
  const deaths = finiteNumber(stats.totalDeaths)
  const onlineInGroup = Boolean(player.online && player.currentGroup === group)

  return {
    id: player.steamId,
    name: player.name,
    aliases: Array.isArray(player.aliases) ? player.aliases : [],
    group,
    firstSeen: stats.firstSeen,
    lastSeen: stats.lastSeen,
    online: onlineInGroup,
    currentServer: onlineInGroup ? player.currentServer ?? null : null,
    currentGroup: onlineInGroup ? player.currentGroup ?? null : null,
    currentFaction: onlineInGroup ? player.currentFaction ?? null : null,
    currentPingMs: onlineInGroup ? player.currentPingMs ?? null : null,
    currentCash: onlineInGroup ? player.currentCash ?? null : null,
    totalKills: kills,
    totalDeaths: deaths,
    kd: deaths > 0 ? Number((kills / deaths).toFixed(2)) : kills,
    matchesSeen: finiteNumber(stats.matchesSeen),
    secondsTracked: finiteNumber(stats.secondsTracked),
    peakKillsInMatch: finiteNumber(stats.peakKillsInMatch),
    peakCash: finiteNumber(stats.peakCash),
    factionCounts: stats.factionCounts || {},
    serverCounts: stats.serverCounts || {},
  }
}

export class PlayerStatsStore {
  constructor(filePath, pollIntervalMs) {
    this.filePath = path.resolve(filePath)
    this.pollIntervalMs = pollIntervalMs
    this.data = this.#load()
  }

  #load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'))
      if (parsed && typeof parsed === 'object') {
        const players = Object.fromEntries(
          Object.entries(parsed.players || {})
            .map(([id, player]) => [id, normaliseStoredPlayer(player)])
            .filter(([, player]) => Boolean(player)),
        )

        return {
          version: 2,
          createdAt: parsed.createdAt || new Date().toISOString(),
          updatedAt: parsed.updatedAt || null,
          players,
          snapshots: parsed.snapshots || {},
        }
      }
    } catch {
      // First run or damaged file: start clean rather than preventing the service from starting.
    }

    return {
      version: 2,
      createdAt: new Date().toISOString(),
      updatedAt: null,
      players: {},
      snapshots: {},
    }
  }

  beginCycle() {
    for (const player of Object.values(this.data.players)) {
      player.online = false
      player.currentServer = null
      player.currentGroup = null
      player.currentFaction = null
      player.currentPingMs = null
      player.currentCash = null
    }
  }

  recordServerPoll(serverIndex, serverGroup, status, players) {
    const group = normaliseGroup(serverGroup)
    const now = Date.now()
    const nowIso = new Date(now).toISOString()
    const serverNumber = serverIndex + 1
    const serverKey = `server-${serverNumber}`
    const experiences = Array.isArray(status?.experiences) ? status.experiences.join(',') : ''
    const rotationIndex = status?.rotation?.nowIndex ?? ''
    const matchMarker = `${status?.map || ''}|${experiences}|${rotationIndex}`

    for (const rawPlayer of players) {
      const observed = normalisePlayer(rawPlayer)
      if (!observed) continue

      const snapshotKey = `${serverKey}:${observed.steamId}`
      const previous = this.data.snapshots[snapshotKey]
      const record = this.data.players[observed.steamId] || {
        steamId: observed.steamId,
        name: observed.name,
        aliases: [],
        firstSeen: nowIso,
        lastSeen: nowIso,
        online: true,
        currentServer: serverNumber,
        currentGroup: group,
        currentFaction: observed.faction,
        currentPingMs: observed.pingMs,
        currentCash: observed.cash,
        groups: {},
      }

      if (record.name && record.name !== observed.name && !record.aliases.includes(record.name)) {
        record.aliases.unshift(record.name)
        record.aliases = record.aliases.slice(0, 10)
      }

      const stats = record.groups[group] || createGroupStats(nowIso)

      record.name = observed.name
      record.lastSeen = nowIso
      record.online = true
      record.currentServer = serverNumber
      record.currentGroup = group
      record.currentFaction = observed.faction
      record.currentPingMs = observed.pingMs
      record.currentCash = observed.cash

      stats.lastSeen = nowIso
      stats.peakKillsInMatch = Math.max(finiteNumber(stats.peakKillsInMatch), observed.kills)
      stats.peakCash = Math.max(finiteNumber(stats.peakCash), observed.cash)
      stats.factionCounts[observed.faction] = finiteNumber(stats.factionCounts[observed.faction]) + 1
      stats.serverCounts[serverKey] = finiteNumber(stats.serverCounts[serverKey]) + 1

      const markerChanged = previous && previous.matchMarker !== matchMarker
      const statsReset = previous && (
        observed.kills < finiteNumber(previous.kills)
        || observed.deaths < finiteNumber(previous.deaths)
      )
      const newMatch = !previous || markerChanged || statsReset

      if (!previous) {
        stats.totalKills += observed.kills
        stats.totalDeaths += observed.deaths
        stats.matchesSeen += 1
      } else if (newMatch) {
        stats.totalKills += observed.kills
        stats.totalDeaths += observed.deaths
        stats.matchesSeen += 1
      } else {
        stats.totalKills += Math.max(0, observed.kills - finiteNumber(previous.kills))
        stats.totalDeaths += Math.max(0, observed.deaths - finiteNumber(previous.deaths))

        const elapsedSeconds = Math.max(0, Math.round((now - finiteNumber(previous.seenAt, now)) / 1000))
        const maxCredibleSeconds = Math.ceil((this.pollIntervalMs / 1000) * 2.5)
        if (elapsedSeconds <= maxCredibleSeconds) stats.secondsTracked += elapsedSeconds
      }

      record.groups[group] = stats
      this.data.players[observed.steamId] = record
      this.data.snapshots[snapshotKey] = {
        kills: observed.kills,
        deaths: observed.deaths,
        seenAt: now,
        matchMarker,
        group,
      }
    }
  }

  save() {
    this.data.updatedAt = new Date().toISOString()
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
    const tempPath = `${this.filePath}.tmp`
    fs.writeFileSync(tempPath, JSON.stringify(this.data, null, 2))
    fs.renameSync(tempPath, this.filePath)
  }

  summary(requestedGroup = 'normal') {
    const group = normaliseGroup(requestedGroup)
    const players = Object.values(this.data.players)
      .map((player) => publicPlayer(player, group))
      .filter(Boolean)

    return {
      group,
      trackedPlayers: players.length,
      onlinePlayers: players.filter((player) => player.online).length,
      totalKillsRecorded: players.reduce((sum, player) => sum + finiteNumber(player.totalKills), 0),
      totalDeathsRecorded: players.reduce((sum, player) => sum + finiteNumber(player.totalDeaths), 0),
      secondsTracked: players.reduce((sum, player) => sum + finiteNumber(player.secondsTracked), 0),
      updatedAt: this.data.updatedAt,
    }
  }

  listPlayers({ search = '', sort = 'kills', limit = 100, offset = 0, group = 'normal' } = {}) {
    const selectedGroup = normaliseGroup(group)
    const query = String(search || '').trim().toLowerCase()
    const rows = Object.values(this.data.players)
      .map((player) => publicPlayer(player, selectedGroup))
      .filter(Boolean)
      .filter((player) => {
        if (!query) return true
        if (player.name.toLowerCase().includes(query) || player.id.includes(query)) return true
        return player.aliases.some((alias) => String(alias).toLowerCase().includes(query))
      })

    const sorters = {
      kills: (a, b) => b.totalKills - a.totalKills,
      deaths: (a, b) => b.totalDeaths - a.totalDeaths,
      kd: (a, b) => b.kd - a.kd,
      time: (a, b) => b.secondsTracked - a.secondsTracked,
      matches: (a, b) => b.matchesSeen - a.matchesSeen,
      lastSeen: (a, b) => String(b.lastSeen).localeCompare(String(a.lastSeen)),
      name: (a, b) => a.name.localeCompare(b.name),
    }

    rows.sort(sorters[sort] || sorters.kills)

    return {
      group: selectedGroup,
      total: rows.length,
      players: rows.slice(offset, offset + limit),
    }
  }

  getPlayer(id, requestedGroup = 'normal') {
    const player = this.data.players[String(id)]
    return player ? publicPlayer(player, requestedGroup) : null
  }
}
