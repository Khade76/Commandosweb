import fs from 'node:fs'
import path from 'node:path'

function finiteNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
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

  const name = String(player?.name ?? player?.playerName ?? steamId || 'Unknown Player').trim()

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

function publicPlayer(player) {
  const kills = finiteNumber(player.totalKills)
  const deaths = finiteNumber(player.totalDeaths)

  return {
    id: player.steamId,
    name: player.name,
    aliases: Array.isArray(player.aliases) ? player.aliases : [],
    firstSeen: player.firstSeen,
    lastSeen: player.lastSeen,
    online: Boolean(player.online),
    currentServer: player.currentServer ?? null,
    currentFaction: player.currentFaction ?? null,
    currentPingMs: player.currentPingMs ?? null,
    currentCash: player.currentCash ?? null,
    totalKills: kills,
    totalDeaths: deaths,
    kd: deaths > 0 ? Number((kills / deaths).toFixed(2)) : kills,
    matchesSeen: finiteNumber(player.matchesSeen),
    secondsTracked: finiteNumber(player.secondsTracked),
    peakKillsInMatch: finiteNumber(player.peakKillsInMatch),
    peakCash: finiteNumber(player.peakCash),
    factionCounts: player.factionCounts || {},
    serverCounts: player.serverCounts || {},
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
        return {
          version: 1,
          createdAt: parsed.createdAt || new Date().toISOString(),
          updatedAt: parsed.updatedAt || null,
          players: parsed.players || {},
          snapshots: parsed.snapshots || {},
        }
      }
    } catch {
      // First run or damaged file: start clean rather than preventing the service from starting.
    }

    return {
      version: 1,
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
      player.currentFaction = null
      player.currentPingMs = null
      player.currentCash = null
    }
  }

  recordServerPoll(serverIndex, status, players) {
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
        totalKills: 0,
        totalDeaths: 0,
        matchesSeen: 0,
        secondsTracked: 0,
        peakKillsInMatch: 0,
        peakCash: 0,
        factionCounts: {},
        serverCounts: {},
      }

      if (record.name && record.name !== observed.name && !record.aliases.includes(record.name)) {
        record.aliases.unshift(record.name)
        record.aliases = record.aliases.slice(0, 10)
      }

      record.name = observed.name
      record.lastSeen = nowIso
      record.online = true
      record.currentServer = serverNumber
      record.currentFaction = observed.faction
      record.currentPingMs = observed.pingMs
      record.currentCash = observed.cash
      record.peakKillsInMatch = Math.max(finiteNumber(record.peakKillsInMatch), observed.kills)
      record.peakCash = Math.max(finiteNumber(record.peakCash), observed.cash)
      record.factionCounts[observed.faction] = finiteNumber(record.factionCounts[observed.faction]) + 1
      record.serverCounts[serverKey] = finiteNumber(record.serverCounts[serverKey]) + 1

      const markerChanged = previous && previous.matchMarker !== matchMarker
      const statsReset = previous && (
        observed.kills < finiteNumber(previous.kills)
        || observed.deaths < finiteNumber(previous.deaths)
      )
      const newMatch = !previous || markerChanged || statsReset

      if (!previous) {
        record.totalKills += observed.kills
        record.totalDeaths += observed.deaths
        record.matchesSeen += 1
      } else if (newMatch) {
        record.totalKills += observed.kills
        record.totalDeaths += observed.deaths
        record.matchesSeen += 1
      } else {
        record.totalKills += Math.max(0, observed.kills - finiteNumber(previous.kills))
        record.totalDeaths += Math.max(0, observed.deaths - finiteNumber(previous.deaths))

        const elapsedSeconds = Math.max(0, Math.round((now - finiteNumber(previous.seenAt, now)) / 1000))
        const maxCredibleSeconds = Math.ceil((this.pollIntervalMs / 1000) * 2.5)
        if (elapsedSeconds <= maxCredibleSeconds) record.secondsTracked += elapsedSeconds
      }

      this.data.players[observed.steamId] = record
      this.data.snapshots[snapshotKey] = {
        kills: observed.kills,
        deaths: observed.deaths,
        seenAt: now,
        matchMarker,
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

  summary() {
    const players = Object.values(this.data.players)
    return {
      trackedPlayers: players.length,
      onlinePlayers: players.filter((player) => player.online).length,
      totalKillsRecorded: players.reduce((sum, player) => sum + finiteNumber(player.totalKills), 0),
      totalDeathsRecorded: players.reduce((sum, player) => sum + finiteNumber(player.totalDeaths), 0),
      secondsTracked: players.reduce((sum, player) => sum + finiteNumber(player.secondsTracked), 0),
      updatedAt: this.data.updatedAt,
    }
  }

  listPlayers({ search = '', sort = 'kills', limit = 100, offset = 0 } = {}) {
    const query = String(search || '').trim().toLowerCase()
    const rows = Object.values(this.data.players)
      .map(publicPlayer)
      .filter((player) => !query || player.name.toLowerCase().includes(query) || player.id.includes(query))

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
      total: rows.length,
      players: rows.slice(offset, offset + limit),
    }
  }

  getPlayer(id) {
    const player = this.data.players[String(id)]
    return player ? publicPlayer(player) : null
  }
}
