import express from 'express'
import { getWardogsRconPlayers, getWardogsRconStatus, wardogsRconConfigured } from '../providers/wardogs-rcon.js'
import { PlayerStatsStore } from './player-stats-store.js'

const DEFAULT_POLL_MS = 60_000
const MIN_POLL_MS = 30_000
const DEFAULT_PORT = 3100

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
    res.json({ ok: true, service: '44th-wardogs-player-stats', summary: store.summary() })
  })

  app.get('/api/stats/summary', (_req, res) => {
    res.json({ summary: store.summary(), generatedAt: new Date().toISOString() })
  })

  app.get('/api/stats/players', (req, res) => {
    const search = String(req.query.search || '')
    const sort = String(req.query.sort || 'kills')
    const limit = clampInteger(req.query.limit, 100, 1, 500)
    const offset = clampInteger(req.query.offset, 0, 0, 100_000)
    const result = store.listPlayers({ search, sort, limit, offset })

    res.json({
      ...result,
      summary: store.summary(),
      generatedAt: new Date().toISOString(),
    })
  })

  app.get('/api/stats/players/:id', (req, res) => {
    const player = store.getPlayer(req.params.id)
    if (!player) return res.status(404).json({ error: 'Player not found' })
    return res.json({ player, generatedAt: new Date().toISOString() })
  })

  let collecting = false

  async function collect() {
    if (collecting) return
    collecting = true
    store.beginCycle()

    try {
      for (let index = 0; index < 2; index += 1) {
        if (!wardogsRconConfigured(index)) continue

        try {
          const [status, players] = await Promise.all([
            getWardogsRconStatus(index, {}),
            getWardogsRconPlayers(index),
          ])

          store.recordServerPoll(index, status, players)
          console.log(`[Player stats] Server #${index + 1}: observed ${players.length} players`)
        } catch (error) {
          console.error(`[Player stats] Server #${index + 1} collection failed:`, error.message)
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
    console.log(`WARDOGS player stats API listening on http://${host}:${port}`)
    console.log(`Player stats file: ${filePath}`)
    console.log(`Player stats poll interval: ${intervalMs}ms`)
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
