import express from 'express'
import { getWardogsRconPlayers, getWardogsRconStatus, wardogsRconConfigured } from '../providers/wardogs-rcon.js'
import { PlayerStatsStore } from './player-stats-store.js'

const DEFAULT_POLL_MS = 60_000
const MIN_POLL_MS = 30_000
const DEFAULT_PORT = 3100
const DEFAULT_SERVER_COUNT = 3
const VALID_GROUPS = new Set(['normal', 'hardcore'])

function env(name, fallback = '') {
  return String(process.env[name] ?? fallback).trim()
}

function pollInterval() {
  const configured = Number(process.env.WARDOGS_STATS_POLL_MS || DEFAULT_POLL_MS)
  if (!Number.isFinite(configured)) return DEFAULT_POLL_MS
  return Math.max(MIN_POLL_MS, configured)
}

function clampInteger(value, fallback, min, max) {
  const number = Number.parseInt(value, 10)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, number))
}

function normaliseGroup(value, fallback = 'normal') {
  const group = String(value || '').trim().toLowerCase()
  return VALID_GROUPS.has(group) ? group : fallback
}

function serverGroup(index) {
  const number = index + 1
  const fallback = number === 3 ? 'hardcore' : 'normal'
  return normaliseGroup(process.env[`WARDOGS_SERVER_${number}_STATS_GROUP`], fallback)
}

function configuredServerIndexes() {
  const count = clampInteger(process.env.WARDOGS_STATS_SERVER_COUNT, DEFAULT_SERVER_COUNT, 1, 10)
  return Array.from({ length: count }, (_value, index) => index)
    .filter((index) => wardogsRconConfigured(index))
}

export async function startStatsService() {
  const intervalMs = pollInterval()
  const filePath = env('WARDOGS_STATS_FILE', './runtime/wardogs-player-stats.json')
  const store = new PlayerStatsStore(filePath, intervalMs)
  const app = express()
  const port = clampInteger(process.env.WARDOGS_STATS_PORT, DEFAULT_PORT, 1, 65535)
  const host = env('WARDOGS_STATS_HOST', '0.0.0.0')
  const allowedOrigin = env('WARDOGS_STATS_ALLOWED_ORIGIN', '*')

  app.disable('x-powered-by')

  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.setHeader('Cache-Control', 'no-store')
    if (req.method === 'OPTIONS') return res.sendStatus(204)
    next()
  })

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      service: '44th-wardogs-player-stats',
      summaries: {
        normal: store.summary('normal'),
        hardcore: store.summary('hardcore'),
      },
    })
  })

  app.get('/api/stats/summary', (req, res) => {
    const group = normaliseGroup(req.query.group)
    res.json({ summary: store.summary(group), generatedAt: new Date().toISOString() })
  })

  app.get('/api/stats/players', (req, res) => {
    const search = String(req.query.search || '')
    const sort = String(req.query.sort || 'kills')
    const group = normaliseGroup(req.query.group)
    const limit = clampInteger(req.query.limit, 100, 1, 500)
    const offset = clampInteger(req.query.offset, 0, 0, 100_000)
    const result = store.listPlayers({ search, sort, limit, offset, group })

    res.json({
      ...result,
      summary: store.summary(group),
      generatedAt: new Date().toISOString(),
    })
  })

  app.get('/api/stats/players/:id', (req, res) => {
    const group = normaliseGroup(req.query.group)
    const player = store.getPlayer(req.params.id, group)
    if (!player) return res.status(404).json({ error: 'Player not found in this stats group' })
    return res.json({ player, generatedAt: new Date().toISOString() })
  })

  let collecting = false

  async function collect() {
    if (collecting) return
    collecting = true
    store.beginCycle()

    try {
      const indexes = configuredServerIndexes()

      for (const index of indexes) {
        const group = serverGroup(index)

        try {
          const [status, players] = await Promise.all([
            getWardogsRconStatus(index, {}),
            getWardogsRconPlayers(index),
          ])

          store.recordServerPoll(index, group, status, players)
          console.log(`[Player stats] Server #${index + 1} (${group}): observed ${players.length} players`)
        } catch (error) {
          console.error(`[Player stats] Server #${index + 1} (${group}) collection failed:`, error.message)
        }
      }

      store.save()
    } finally {
      collecting = false
    }
  }

  await collect()
  const timer = setInterval(() => {
    collect().catch((error) => console.error('[Player stats] poll failed:', error))
  }, intervalMs)
  timer.unref?.()

  const server = app.listen(port, host, () => {
    const configured = configuredServerIndexes()
      .map((index) => `#${index + 1}:${serverGroup(index)}`)
      .join(', ') || 'none'

    console.log(`WARDOGS player stats API listening on http://${host}:${port}`)
    console.log(`Player stats file: ${filePath}`)
    console.log(`Player stats poll interval: ${intervalMs}ms`)
    console.log(`Player stats servers: ${configured}`)
  })

  return {
    app,
    server,
    store,
    timer,
    async stop() {
      clearInterval(timer)
      await new Promise((resolve) => server.close(resolve))
    },
  }
}
