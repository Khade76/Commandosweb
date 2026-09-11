import express from 'express'
import { createMariaDbPoolFromEnv, MariaDbPlayerStatsStore } from './mariadb-store.js'
import { fetchStatsSource } from './source.js'

const DEFAULT_POLL_MS = 60_000
const MIN_POLL_MS = 30_000
const DEFAULT_PORT = 3100
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

export async function startStatsService() {
  const intervalMs = pollInterval()
  const pool = createMariaDbPoolFromEnv()
  const store = new MariaDbPlayerStatsStore(pool, intervalMs)
  await store.init()

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

  app.get('/health', async (_req, res) => {
    res.json({
      ok: true,
      service: '44th-wardogs-player-stats',
      database: 'mariadb',
      summaries: {
        normal: await store.summary('normal'),
        hardcore: await store.summary('hardcore'),
      },
    })
  })

  app.get('/api/stats/summary', async (req, res) => {
    const group = normaliseGroup(req.query.group)
    res.json({ summary: await store.summary(group), generatedAt: new Date().toISOString() })
  })

  app.get('/api/stats/players', async (req, res) => {
    const search = String(req.query.search || '')
    const sort = String(req.query.sort || 'kills')
    const group = normaliseGroup(req.query.group)
    const limit = clampInteger(req.query.limit, 100, 1, 500)
    const offset = clampInteger(req.query.offset, 0, 0, 100_000)
    const result = await store.listPlayers({ search, sort, limit, offset, group })

    res.json({
      ...result,
      summary: await store.summary(group),
      generatedAt: new Date().toISOString(),
    })
  })

  app.get('/api/stats/players/:id', async (req, res) => {
    const group = normaliseGroup(req.query.group)
    const player = await store.getPlayer(req.params.id, group)
    if (!player) return res.status(404).json({ error: 'Player not found in this stats group' })
    return res.json({ player, generatedAt: new Date().toISOString() })
  })

  let collecting = false

  async function collect() {
    if (collecting) return
    collecting = true

    try {
      const servers = await fetchStatsSource()
      await store.beginCycle()

      for (const server of servers) {
        if (server.error) {
          console.error(`[Player stats] Server #${server.serverNumber} source error: ${server.error}`)
          continue
        }

        try {
          await store.recordServerPoll(server, server.status, server.players)
          console.log(`[Player stats] Server #${server.serverNumber} (${server.statsGroup}): observed ${server.players.length} players`)
        } catch (error) {
          console.error(`[Player stats] Server #${server.serverNumber} (${server.statsGroup}) collection failed:`, error.message)
        }
      }
    } finally {
      collecting = false
    }
  }

  try {
    await collect()
  } catch (error) {
    console.error('[Player stats] initial collection failed:', error.message)
  }

  const timer = setInterval(() => {
    collect().catch((error) => console.error('[Player stats] poll failed:', error.message))
  }, intervalMs)
  timer.unref?.()

  const server = app.listen(port, host, () => {
    console.log(`WARDOGS player stats API listening on http://${host}:${port}`)
    console.log('Player stats database: MariaDB')
    console.log(`Player stats poll interval: ${intervalMs}ms`)
    console.log(`Stats source: ${env('WARDOGS_STATS_SOURCE_URL', 'not configured')}`)
  })

  return {
    app,
    server,
    store,
    timer,
    async stop() {
      clearInterval(timer)
      await new Promise((resolve) => server.close(resolve))
      await store.close()
    },
  }
}
