import assert from 'node:assert/strict'
import test from 'node:test'
import { servers as directory } from '../src/data/site.js'
import { getWardogsJoinCode } from '../server/providers/bisect.js'

async function withConfig(values, run) {
  const originalEnv = { ...process.env }
  const originalFetch = globalThis.fetch
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('BISECT_') || key.startsWith('WARDOGS_')) delete process.env[key]
  }
  Object.assign(process.env, values)
  const calls = []
  globalThis.fetch = async (url) => {
    calls.push(String(url))
    if (String(url).startsWith('https://xrealm5.test/')) {
      return { ok: true, text: async () => JSON.stringify({
        serverName: '44th Commandos #5 | discord.gg/44thwardogs',
        players: { current: 18, max: 100 }, map: 'Kavkazi', experiences: ['KOTH'],
        factionScores: [{ name: 'Lonestar', score: 12 }],
      }) }
    }
    if (String(url).startsWith('https://xrealm.test/')) {
      return { ok: true, text: async () => JSON.stringify({
        serverName: '44th Commandos #4 | Hardcore | discord.gg/44thwardogs',
        players: { current: 42, max: 100 }, map: 'Ozeti', experiences: ['KOTH_Hardcore'],
        factionScores: [{ name: 'Valkyra', score: 8 }],
      }) }
    }
    if (String(url).includes('/12577') || String(url).includes('/12648')) {
      throw new Error('XRealm must not be queried through Bisect')
    }
    return { ok: true, json: async () => ({ attributes: { current_state: 'running' } }) }
  }
  try {
    const { getServers } = await import(`../server/servers.js?case=${Date.now()}-${Math.random()}`)
    await run(await getServers(), calls)
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key]
    Object.assign(process.env, originalEnv)
    globalThis.fetch = originalFetch
  }
}

test('fallback directory contains five distinct servers and both XRealm join codes', async () => {
  await withConfig({}, async (servers, calls) => {
    assert.deepEqual(servers.map((server) => server.id), directory.map((server) => server.id))
    assert.equal(new Set(servers.map((server) => server.id)).size, 6)
    assert.equal(getWardogsJoinCode(3), '7f15ef51-2673-4eab-b3c8-d8176a3b41e4')
    assert.equal(getWardogsJoinCode(4), '3500961c-24df-40b1-b299-6a897eddc2bd')
    assert.equal(servers[3].mode, 'Hardcore')
    assert.equal(servers[3].address, '')
    assert.equal(servers[4].id, 'wardogs-12648')
    assert.equal(servers[4].region, 'XRealm')
    assert.equal(servers[2].id, 'wardogs-9f71e8ef')
    assert.deepEqual(calls, [])
  })
})

test('RCON slot four works alone without being renumbered to slot one', async () => {
  await withConfig({ WARDOGS_RCON_SERVER_4_URL: 'https://xrealm.test', WARDOGS_RCON_SERVER_4_PASSWORD: 'test-only' }, async (servers, calls) => {
    const server = servers[0]
    assert.equal(server.id, 'wardogs-12577')
    assert.equal(server.status, 'Online')
    assert.equal(server.playerCount, 42)
    assert.equal(server.scores.valkyra, 8)
    assert.equal(server.joinCode, directory[3].joinCode)
    assert.equal(server.joinId, directory[3].joinCode)
    assert.equal(server.address, '')
    assert.deepEqual(calls, ['https://xrealm.test/v1/status'])
  })
})

test('RCON slot five works alone without being renumbered', async () => {
  await withConfig({ WARDOGS_RCON_SERVER_5_URL: 'https://xrealm5.test', WARDOGS_RCON_SERVER_5_PASSWORD: 'test-only' }, async (servers, calls) => {
    const server = servers[0]
    assert.equal(server.id, 'wardogs-12648')
    assert.equal(server.status, 'Online')
    assert.equal(server.playerCount, 18)
    assert.equal(server.scores.lonestar, 12)
    assert.equal(server.joinCode, directory[4].joinCode)
    assert.equal(server.joinId, directory[4].joinCode)
    assert.equal(server.address, '')
    assert.deepEqual(calls, ['https://xrealm5.test/v1/status'])
  })
})

test('three Bisect servers and both XRealm servers use their own providers', async () => {
  await withConfig({
    BISECT_API_KEY: 'test-only', BISECT_SERVER_IDS: '278c7bc5,9290beb1,9f71e8ef',
    WARDOGS_RCON_SERVER_4_URL: 'https://xrealm.test', WARDOGS_RCON_SERVER_4_PASSWORD: 'test-only',
    WARDOGS_RCON_SERVER_5_URL: 'https://xrealm5.test', WARDOGS_RCON_SERVER_5_PASSWORD: 'test-only',
  }, async (servers, calls) => {
    assert.deepEqual(servers.map((server) => server.id), directory.map((server) => server.id))
    assert.equal(servers[3].provider, 'WARDOGS RCON')
    assert.equal(servers[4].provider, 'WARDOGS RCON')
    assert.equal(calls.filter((url) => url.startsWith('https://xrealm.test/')).length, 1)
    assert.equal(calls.filter((url) => url.startsWith('https://xrealm5.test/')).length, 1)
    assert.equal(calls.some((url) => url.includes('/12577') || url.includes('/12648')), false)
    assert.equal(calls.length, 14)
  })
})

test('slot three alone retains its own identifier and join-code override', async () => {
  await withConfig({
    WARDOGS_RCON_SERVER_3_URL: 'https://xrealm.test', WARDOGS_RCON_SERVER_3_PASSWORD: 'test-only',
    WARDOGS_SERVER_3_JOIN_CODE: '89607037-07ad-4039-8f7d-1fb9a46e707b',
  }, async (servers) => {
    assert.equal(servers[0].id, 'wardogs-9f71e8ef')
    assert.equal(servers[0].joinCode, '89607037-07ad-4039-8f7d-1fb9a46e707b')
  })
})
