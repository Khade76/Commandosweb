const VALID_GROUPS = new Set(['normal', 'hardcore'])

function env(name, fallback = '') {
  return String(process.env[name] ?? fallback).trim()
}

function normaliseGroup(value, fallback = 'normal') {
  const group = String(value || '').trim().toLowerCase()
  return VALID_GROUPS.has(group) ? group : fallback
}

export async function fetchStatsSource() {
  const url = env('WARDOGS_STATS_SOURCE_URL')
  const token = env('WARDOGS_STATS_SOURCE_TOKEN')
  if (!url || !token) {
    throw new Error('WARDOGS_STATS_SOURCE_URL and WARDOGS_STATS_SOURCE_TOKEN must be configured')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
      signal: controller.signal,
    })

    const text = await response.text()
    let payload = null
    try { payload = text ? JSON.parse(text) : null } catch { payload = null }

    if (!response.ok) {
      const message = payload?.error || text.slice(0, 160) || response.statusText
      throw new Error(`Stats source returned HTTP ${response.status}: ${message}`)
    }

    if (!Array.isArray(payload?.servers)) {
      throw new Error('Stats source returned an invalid payload')
    }

    return payload.servers.map((server, index) => ({
      serverNumber: Number.parseInt(server?.serverNumber, 10) || index + 1,
      id: String(server?.id || `server-${index + 1}`),
      name: String(server?.name || `WARDOGS Server #${index + 1}`),
      statsGroup: normaliseGroup(server?.statsGroup, index === 2 ? 'hardcore' : 'normal'),
      status: server?.status && typeof server.status === 'object' ? server.status : {},
      players: Array.isArray(server?.players) ? server.players : [],
      error: server?.error ? String(server.error) : null,
    }))
  } finally {
    clearTimeout(timeout)
  }
}
