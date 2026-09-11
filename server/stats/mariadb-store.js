import mysql from 'mysql2/promise'

const VALID_GROUPS = new Set(['normal', 'hardcore'])

function env(name, fallback = '') {
  return String(process.env[name] ?? fallback).trim()
}

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

  if (!steamId) return null

  return {
    steamId,
    name: String(player?.name ?? player?.playerName ?? steamId).trim() || 'Unknown Player',
    faction: normaliseFaction(player?.faction ?? player?.team),
    kills: Math.max(0, finiteNumber(player?.kills)),
    deaths: Math.max(0, finiteNumber(player?.deaths)),
    cash: finiteNumber(player?.cash),
    pingMs: Math.max(0, finiteNumber(player?.pingMs ?? player?.ping)),
  }
}

function mysqlDate(value) {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function inPlaceholders(values) {
  return values.map(() => '?').join(',')
}

export function createMariaDbPoolFromEnv() {
  const host = env('WARDOGS_DB_HOST')
  const user = env('WARDOGS_DB_USER')
  const password = env('WARDOGS_DB_PASSWORD')
  const database = env('WARDOGS_DB_NAME')
  const port = Math.max(1, Math.min(65535, Number.parseInt(env('WARDOGS_DB_PORT', '3306'), 10) || 3306))
  const connectionLimit = Math.max(1, Math.min(50, Number.parseInt(env('WARDOGS_DB_CONNECTION_LIMIT', '10'), 10) || 10))

  const missing = [
    ['WARDOGS_DB_HOST', host],
    ['WARDOGS_DB_USER', user],
    ['WARDOGS_DB_PASSWORD', password],
    ['WARDOGS_DB_NAME', database],
  ].filter(([, value]) => !value).map(([name]) => name)

  if (missing.length) {
    throw new Error(`Missing MariaDB configuration: ${missing.join(', ')}`)
  }

  const useSsl = /^(1|true|yes|on)$/i.test(env('WARDOGS_DB_SSL'))

  return mysql.createPool({
    host,
    port,
    user,
    password,
    database,
    waitForConnections: true,
    connectionLimit,
    queueLimit: 0,
    charset: 'utf8mb4',
    timezone: 'Z',
    supportBigNumbers: true,
    bigNumberStrings: false,
    ...(useSsl ? { ssl: { rejectUnauthorized: !/^(0|false|no|off)$/i.test(env('WARDOGS_DB_SSL_REJECT_UNAUTHORIZED', 'true')) } } : {}),
  })
}

export class MariaDbPlayerStatsStore {
  constructor(pool, pollIntervalMs) {
    this.pool = pool
    this.pollIntervalMs = pollIntervalMs
  }

  async init() {
    await this.pool.query('SELECT 1')
    try {
      await this.pool.query('SELECT 1 FROM players LIMIT 1')
    } catch (error) {
      if (error?.code === 'ER_NO_SUCH_TABLE') {
        throw new Error('WARDOGS stats schema is missing. Import database/schema.sql into the configured MariaDB database first.')
      }
      throw error
    }
  }

  async beginCycle() {
    await this.pool.query('DELETE FROM player_live_state')
  }

  async recordServerPoll(server, status, players) {
    const group = normaliseGroup(server?.statsGroup)
    const serverNumber = Math.max(1, Number.parseInt(server?.serverNumber, 10) || 1)
    const serverExternalId = String(server?.id || `server-${serverNumber}`).slice(0, 128)
    const serverName = String(server?.name || `WARDOGS Server #${serverNumber}`).slice(0, 191)
    const now = new Date()
    const experiences = Array.isArray(status?.experiences) ? status.experiences.join(',') : ''
    const rotationIndex = status?.rotation?.nowIndex ?? ''
    const matchMarker = `${status?.map || ''}|${experiences}|${rotationIndex}`.slice(0, 512)
    const observedPlayers = players.map(normalisePlayer).filter(Boolean)

    const connection = await this.pool.getConnection()
    try {
      await connection.beginTransaction()

      await connection.execute(
        `INSERT INTO stats_servers (server_number, external_id, name, stats_group, last_seen)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           external_id = VALUES(external_id),
           name = VALUES(name),
           stats_group = VALUES(stats_group),
           last_seen = VALUES(last_seen)`,
        [serverNumber, serverExternalId, serverName, group, now],
      )

      const [serverRows] = await connection.execute(
        'SELECT id FROM stats_servers WHERE server_number = ? LIMIT 1',
        [serverNumber],
      )
      const serverId = Number(serverRows[0]?.id)
      if (!serverId) throw new Error(`Unable to resolve database server id for WARDOGS Server #${serverNumber}`)

      for (const observed of observedPlayers) {
        const [playerRows] = await connection.execute(
          'SELECT id, current_name FROM players WHERE steam_id = ? LIMIT 1 FOR UPDATE',
          [observed.steamId],
        )

        let playerId
        if (!playerRows.length) {
          const [insertResult] = await connection.execute(
            `INSERT INTO players (steam_id, current_name, first_seen, last_seen)
             VALUES (?, ?, ?, ?)`,
            [observed.steamId, observed.name, now, now],
          )
          playerId = Number(insertResult.insertId)
        } else {
          playerId = Number(playerRows[0].id)
          const previousName = String(playerRows[0].current_name || '').trim()
          if (previousName && previousName !== observed.name) {
            await connection.execute(
              `INSERT INTO player_aliases (player_id, alias, first_seen, last_seen)
               VALUES (?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE last_seen = VALUES(last_seen)`,
              [playerId, previousName, now, now],
            )
          }

          await connection.execute(
            'UPDATE players SET current_name = ?, last_seen = ? WHERE id = ?',
            [observed.name, now, playerId],
          )
        }

        await connection.execute(
          `INSERT IGNORE INTO player_group_stats
             (player_id, stats_group, first_seen, last_seen)
           VALUES (?, ?, ?, ?)`,
          [playerId, group, now, now],
        )

        const [snapshotRows] = await connection.execute(
          `SELECT kills, deaths, seen_at, match_marker
           FROM player_snapshots
           WHERE server_id = ? AND player_id = ?
           LIMIT 1`,
          [serverId, playerId],
        )
        const previous = snapshotRows[0] || null

        const markerChanged = previous && String(previous.match_marker || '') !== matchMarker
        const statsReset = previous && (
          observed.kills < finiteNumber(previous.kills)
          || observed.deaths < finiteNumber(previous.deaths)
        )
        const newMatch = !previous || markerChanged || statsReset

        let killDelta = observed.kills
        let deathDelta = observed.deaths
        let matchDelta = 1
        let elapsedSeconds = 0

        if (previous && !newMatch) {
          killDelta = Math.max(0, observed.kills - finiteNumber(previous.kills))
          deathDelta = Math.max(0, observed.deaths - finiteNumber(previous.deaths))
          matchDelta = 0

          const previousSeenAt = new Date(previous.seen_at).getTime()
          const elapsed = Number.isFinite(previousSeenAt)
            ? Math.max(0, Math.round((now.getTime() - previousSeenAt) / 1000))
            : 0
          const maxCredibleSeconds = Math.ceil((this.pollIntervalMs / 1000) * 2.5)
          if (elapsed <= maxCredibleSeconds) elapsedSeconds = elapsed
        }

        await connection.execute(
          `UPDATE player_group_stats
           SET last_seen = ?,
               total_kills = total_kills + ?,
               total_deaths = total_deaths + ?,
               matches_seen = matches_seen + ?,
               seconds_tracked = seconds_tracked + ?,
               peak_kills_in_match = GREATEST(peak_kills_in_match, ?),
               peak_cash = GREATEST(peak_cash, ?)
           WHERE player_id = ? AND stats_group = ?`,
          [now, killDelta, deathDelta, matchDelta, elapsedSeconds, observed.kills, observed.cash, playerId, group],
        )

        await connection.execute(
          `INSERT INTO player_server_stats
             (player_id, server_id, first_seen, last_seen, total_kills, total_deaths, matches_seen, seconds_tracked, polls_seen)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
           ON DUPLICATE KEY UPDATE
             last_seen = VALUES(last_seen),
             total_kills = total_kills + VALUES(total_kills),
             total_deaths = total_deaths + VALUES(total_deaths),
             matches_seen = matches_seen + VALUES(matches_seen),
             seconds_tracked = seconds_tracked + VALUES(seconds_tracked),
             polls_seen = polls_seen + 1`,
          [playerId, serverId, now, now, killDelta, deathDelta, matchDelta, elapsedSeconds],
        )

        await connection.execute(
          `INSERT INTO player_faction_stats
             (player_id, stats_group, faction, first_seen, last_seen, total_kills, total_deaths, seconds_tracked, polls_seen)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
           ON DUPLICATE KEY UPDATE
             last_seen = VALUES(last_seen),
             total_kills = total_kills + VALUES(total_kills),
             total_deaths = total_deaths + VALUES(total_deaths),
             seconds_tracked = seconds_tracked + VALUES(seconds_tracked),
             polls_seen = polls_seen + 1`,
          [playerId, group, observed.faction, now, now, killDelta, deathDelta, elapsedSeconds],
        )

        await connection.execute(
          `INSERT INTO player_snapshots
             (server_id, player_id, stats_group, kills, deaths, seen_at, match_marker)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             stats_group = VALUES(stats_group),
             kills = VALUES(kills),
             deaths = VALUES(deaths),
             seen_at = VALUES(seen_at),
             match_marker = VALUES(match_marker)`,
          [serverId, playerId, group, observed.kills, observed.deaths, now, matchMarker],
        )

        await connection.execute(
          `INSERT INTO player_live_state
             (player_id, server_id, stats_group, faction, ping_ms, cash, last_seen)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             server_id = VALUES(server_id),
             stats_group = VALUES(stats_group),
             faction = VALUES(faction),
             ping_ms = VALUES(ping_ms),
             cash = VALUES(cash),
             last_seen = VALUES(last_seen)`,
          [playerId, serverId, group, observed.faction, observed.pingMs, observed.cash, now],
        )
      }

      await connection.commit()
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  }

  async summary(requestedGroup = 'normal') {
    const group = normaliseGroup(requestedGroup)
    const [rows] = await this.pool.execute(
      `SELECT
         COUNT(*) AS tracked_players,
         SUM(CASE WHEN live.player_id IS NULL THEN 0 ELSE 1 END) AS online_players,
         COALESCE(SUM(stats.total_kills), 0) AS total_kills,
         COALESCE(SUM(stats.total_deaths), 0) AS total_deaths,
         COALESCE(SUM(stats.seconds_tracked), 0) AS seconds_tracked,
         MAX(stats.last_seen) AS updated_at
       FROM player_group_stats stats
       LEFT JOIN player_live_state live
         ON live.player_id = stats.player_id AND live.stats_group = stats.stats_group
       WHERE stats.stats_group = ?`,
      [group],
    )

    const row = rows[0] || {}
    return {
      group,
      trackedPlayers: finiteNumber(row.tracked_players),
      onlinePlayers: finiteNumber(row.online_players),
      totalKillsRecorded: finiteNumber(row.total_kills),
      totalDeathsRecorded: finiteNumber(row.total_deaths),
      secondsTracked: finiteNumber(row.seconds_tracked),
      updatedAt: mysqlDate(row.updated_at),
    }
  }

  async #enrichPlayers(rows, group) {
    if (!rows.length) return []
    const ids = rows.map((row) => Number(row.db_id)).filter(Boolean)
    const placeholders = inPlaceholders(ids)
    const aliasMap = new Map()
    const factionMap = new Map()
    const serverMap = new Map()

    const [aliases] = await this.pool.execute(
      `SELECT player_id, alias FROM player_aliases
       WHERE player_id IN (${placeholders})
       ORDER BY last_seen DESC`,
      ids,
    )
    for (const row of aliases) {
      const list = aliasMap.get(Number(row.player_id)) || []
      if (list.length < 10) list.push(String(row.alias))
      aliasMap.set(Number(row.player_id), list)
    }

    const [factions] = await this.pool.execute(
      `SELECT player_id, faction, polls_seen FROM player_faction_stats
       WHERE stats_group = ? AND player_id IN (${placeholders})`,
      [group, ...ids],
    )
    for (const row of factions) {
      const counts = factionMap.get(Number(row.player_id)) || {}
      counts[String(row.faction)] = finiteNumber(row.polls_seen)
      factionMap.set(Number(row.player_id), counts)
    }

    const [servers] = await this.pool.execute(
      `SELECT pss.player_id, ss.server_number, pss.polls_seen
       FROM player_server_stats pss
       INNER JOIN stats_servers ss ON ss.id = pss.server_id
       WHERE ss.stats_group = ? AND pss.player_id IN (${placeholders})`,
      [group, ...ids],
    )
    for (const row of servers) {
      const counts = serverMap.get(Number(row.player_id)) || {}
      counts[`server-${row.server_number}`] = finiteNumber(row.polls_seen)
      serverMap.set(Number(row.player_id), counts)
    }

    return rows.map((row) => {
      const kills = finiteNumber(row.total_kills)
      const deaths = finiteNumber(row.total_deaths)
      return {
        id: String(row.steam_id),
        name: String(row.current_name || row.steam_id),
        aliases: aliasMap.get(Number(row.db_id)) || [],
        group,
        firstSeen: mysqlDate(row.first_seen),
        lastSeen: mysqlDate(row.last_seen),
        online: Boolean(row.live_player_id),
        currentServer: row.server_number === null || row.server_number === undefined ? null : Number(row.server_number),
        currentGroup: row.live_player_id ? group : null,
        currentFaction: row.live_player_id ? row.faction || null : null,
        currentPingMs: row.live_player_id ? finiteNumber(row.ping_ms) : null,
        currentCash: row.live_player_id ? finiteNumber(row.cash) : null,
        totalKills: kills,
        totalDeaths: deaths,
        kd: deaths > 0 ? Number((kills / deaths).toFixed(2)) : kills,
        matchesSeen: finiteNumber(row.matches_seen),
        secondsTracked: finiteNumber(row.seconds_tracked),
        peakKillsInMatch: finiteNumber(row.peak_kills_in_match),
        peakCash: finiteNumber(row.peak_cash),
        factionCounts: factionMap.get(Number(row.db_id)) || {},
        serverCounts: serverMap.get(Number(row.db_id)) || {},
      }
    })
  }

  async listPlayers({ search = '', sort = 'kills', limit = 100, offset = 0, group = 'normal' } = {}) {
    const selectedGroup = normaliseGroup(group)
    const query = String(search || '').trim()
    const safeLimit = Math.max(1, Math.min(500, Number.parseInt(limit, 10) || 100))
    const safeOffset = Math.max(0, Math.min(100000, Number.parseInt(offset, 10) || 0))
    const sortSql = {
      kills: 'stats.total_kills DESC',
      deaths: 'stats.total_deaths DESC',
      kd: '(CASE WHEN stats.total_deaths > 0 THEN stats.total_kills / stats.total_deaths ELSE stats.total_kills END) DESC',
      time: 'stats.seconds_tracked DESC',
      matches: 'stats.matches_seen DESC',
      lastSeen: 'stats.last_seen DESC',
      name: 'p.current_name ASC',
    }[sort] || 'stats.total_kills DESC'

    const where = ['stats.stats_group = ?']
    const params = [selectedGroup]
    if (query) {
      const like = `%${query}%`
      where.push(`(
        p.current_name LIKE ? OR p.steam_id LIKE ? OR
        EXISTS (
          SELECT 1 FROM player_aliases alias
          WHERE alias.player_id = p.id AND alias.alias LIKE ?
        )
      )`)
      params.push(like, like, like)
    }

    const whereSql = where.join(' AND ')
    const [countRows] = await this.pool.execute(
      `SELECT COUNT(*) AS total
       FROM player_group_stats stats
       INNER JOIN players p ON p.id = stats.player_id
       WHERE ${whereSql}`,
      params,
    )

    const [rows] = await this.pool.execute(
      `SELECT
         p.id AS db_id,
         p.steam_id,
         p.current_name,
         stats.first_seen,
         stats.last_seen,
         stats.total_kills,
         stats.total_deaths,
         stats.matches_seen,
         stats.seconds_tracked,
         stats.peak_kills_in_match,
         stats.peak_cash,
         live.player_id AS live_player_id,
         live.faction,
         live.ping_ms,
         live.cash,
         server.server_number
       FROM player_group_stats stats
       INNER JOIN players p ON p.id = stats.player_id
       LEFT JOIN player_live_state live
         ON live.player_id = p.id AND live.stats_group = stats.stats_group
       LEFT JOIN stats_servers server ON server.id = live.server_id
       WHERE ${whereSql}
       ORDER BY ${sortSql}
       LIMIT ? OFFSET ?`,
      [...params, safeLimit, safeOffset],
    )

    return {
      group: selectedGroup,
      total: finiteNumber(countRows[0]?.total),
      players: await this.#enrichPlayers(rows, selectedGroup),
    }
  }

  async getPlayer(id, requestedGroup = 'normal') {
    const steamId = String(id || '').trim()
    if (!steamId) return null
    const result = await this.listPlayers({ search: steamId, group: requestedGroup, limit: 500, offset: 0 })
    return result.players.find((player) => player.id === steamId) || null
  }

  async close() {
    await this.pool.end()
  }
}
