import express from 'express'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getServers } from './servers.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const distPath = path.resolve(__dirname, '../dist')
const port = Number(process.env.PORT) || 3000
const app = express()

app.disable('x-powered-by')
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: '44th-commando-wardogs-web',
    timestamp: new Date().toISOString(),
  })
})

app.get('/api/servers', async (_req, res) => {
  try {
    res.json({ servers: await getServers() })
  } catch (error) {
    console.error('Unable to load server directory:', error)
    res.status(502).json({ error: 'Unable to load server status' })
  }
})

if (existsSync(distPath)) {
  app.use(express.static(distPath, { index: false }))

  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next()
    return res.sendFile(path.join(distPath, 'index.html'))
  })
} else {
  app.get('/', (_req, res) => {
    res.status(503).send('Frontend build not found. Run npm run build before npm start.')
  })
}

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

app.listen(port, '0.0.0.0', () => {
  console.log(`44th Commando Regiment website listening on port ${port}`)
})
