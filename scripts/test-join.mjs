import assert from 'node:assert/strict'
import test from 'node:test'
import { joinResponse, localJoinConfig, validSteamLobbyId } from '../server/join.js'

const lobby = '109775242493124785'
const otherLobby = '109775242493124786'
const uri = `steam://joinlobby/1867240/${lobby}`
const code = '89607037-07ad-4039-8f7d-1fb9a46e707b'
const one = { id: 'wardogs-278c7bc5', name: '44th Commandos #1', joinCode: code, steamLobbyId: lobby }
const config = { servers: [one] }

test('known lobby handoff keeps every digit and works without configuration', () => {
  const response = joinResponse(`lobby=${lobby}`)
  assert.equal(response.status, 200)
  assert.equal(response.body.steamJoinUrl, uri)
  assert.equal(response.body.steamLobbyId, lobby)
  assert.equal(response.body.available, true)
  assert.equal(response.body.server.number, null)
  assert.equal(response.body.server.id, null)
  assert.equal(response.body.server.joinCode, null)
})

test('lobby IDs must be canonical uint64 decimal strings', () => {
  assert.equal(validSteamLobbyId('18446744073709551615'), '18446744073709551615')
  for (const value of [Number(lobby), '', '0', '000000000000000000', `0${lobby}`, '1e17', '109775242493124785.0', '18446744073709551616', '-109775242493124785', ` ${lobby}`, `${lobby}\n`, '123']) {
    assert.equal(validSteamLobbyId(value), null, String(value))
  }
})

test('rejects ambiguous and malicious query parameters without outbound lookup', () => {
  for (const query of ['', 'server=1&', '&server=1', 'server=0', 'server=01', 'server=6', 'server=1&server=2', `server=1&lobby=${lobby}`, `lobby=${lobby}&lobby=${lobby}`, 'server[]=1', 'server=1&redirect=https://evil.test', 'server=https://evil.test', 'lobby=1e17', 'lobby=18446744073709551616', 'lobby=%3Cscript%3E', 'server=%2Fetc%2Fpasswd']) {
    assert.equal(joinResponse(query, config).status, 400, query)
  }
})

test('numeric and stable-ID routes resolve the same configured server', () => {
  const numeric = joinResponse('server=1', config)
  const stable = joinResponse('server=wardogs-278c7bc5', config)
  assert.deepEqual(numeric, stable)
  assert.equal(numeric.body.steamJoinUrl, uri)
  assert.deepEqual(numeric.body.server, { id: one.id, number: 1, name: one.name, joinCode: code })
})

test('config subsets and ordering never renumber servers', () => {
  const reordered = { servers: [{ id: 'wardogs-12648', steamJoinUrl: uri }, one] }
  assert.equal(joinResponse('server=5', reordered).body.server.id, 'wardogs-12648')
  assert.equal(joinResponse('server=1', reordered).body.server.id, one.id)
  const subset = { servers: [{ id: 'wardogs-12577', steamLobbyId: lobby }] }
  assert.equal(joinResponse('server=4', subset).body.steamJoinUrl, uri)
  assert.equal(joinResponse('server=1', subset).status, 404)
})

test('custom server IDs need explicit numbers for numbered bot links', () => {
  const custom = { servers: [{ id: 'custom.server-4', number: '4', steamJoinUrl: `${uri}/` }] }
  assert.equal(joinResponse('server=4', custom).body.server.id, 'custom.server-4')
  assert.equal(joinResponse('server=custom.server-4', custom).body.steamJoinUrl, uri)
})

test('disabled, unknown and ambiguous servers cannot launch', () => {
  assert.equal(joinResponse('server=2', config).status, 404)
  assert.equal(joinResponse('server=1', { servers: [{ ...one, enabled: false }] }).status, 404)
  assert.equal(joinResponse('server=1', { servers: [one, { ...one }] }).status, 503)
  assert.equal(joinResponse('server=1', { servers: [one, { id: 'custom', number: 1 }] }).status, 503)
  for (const invalid of [null, {}, { servers: 'bad' }, { servers: [null] }, { servers: [{ id: 'bad/id' }] }, { servers: [{ ...one, number: 6 }] }]) {
    assert.equal(joinResponse('server=1', invalid).status, 503)
  }
})

test('only fixed-app Steam lobby URLs are accepted from private config', () => {
  assert.equal(joinResponse('server=1', { servers: [{ ...one, steamLobbyId: '', steamJoinUrl: uri }] }).body.steamJoinUrl, uri)
  for (const invalidUrl of ['https://evil.test', 'javascript:alert(1)', 'steam://run/1867240', `steam://joinlobby/730/${lobby}`, `${uri}?redirect=evil`, `${uri}/76561198000000000`, `${uri}#x`, `${uri}\n`]) {
    const result = joinResponse('server=1', { servers: [{ ...one, steamJoinUrl: invalidUrl }] })
    assert.equal(result.body.available, false, invalidUrl)
    assert.equal(result.body.steamJoinUrl, null)
  }
  assert.equal(joinResponse('server=1', { servers: [{ ...one, steamJoinUrl: `steam://joinlobby/1867240/${otherLobby}` }] }).body.available, false)
  assert.equal(joinResponse('server=1', { servers: [{ ...one, steamLobbyId: Number(lobby) }] }).body.available, false)
})

test('missing lobby uses manual code; join UUID never becomes a Steam lobby', () => {
  const result = joinResponse('server=1', { servers: [{ ...one, steamLobbyId: '' }] })
  assert.equal(result.status, 200)
  assert.equal(result.body.available, false)
  assert.equal(result.body.steamLobbyId, null)
  assert.equal(result.body.server.joinCode, code)
  assert.equal(joinResponse('server=1', { servers: [{ ...one, steamLobbyId: code }] }).body.available, false)
  const unknown = joinResponse('server=custom', { servers: [{ id: 'custom', joinCode: 'bad' }] })
  assert.equal(unknown.body.server.joinCode, null)
})

test('private config secrets are never exposed', () => {
  const result = joinResponse('server=1', { servers: [{ ...one, url: 'http://private-rcon.test:9000', password: 'never-send-me', api_key: 'secret-key' }], warcon: { stats_api_key: 'secret-stats' } })
  const json = JSON.stringify(result.body)
  for (const secret of ['private-rcon', 'never-send-me', 'secret-key', 'secret-stats', 'password', 'api_key']) assert.equal(json.includes(secret), false)
})

test('local Node config exposes five separate slots', () => {
  const local = localJoinConfig()
  assert.deepEqual(local.servers.map((server) => server.number), [1, 2, 3, 4, 5])
  assert.equal(local.servers[4].id, 'wardogs-12648')
})

test('local Node joining respects existing custom Bisect identifiers', () => {
  const original = process.env.BISECT_SERVER_IDS
  try {
    process.env.BISECT_SERVER_IDS = 'custom-one,custom-two,custom-three'
    const local = localJoinConfig()
    assert.equal(local.servers[0].id, 'wardogs-custom-one')
    assert.equal(local.servers[1].id, 'wardogs-custom-two')
    assert.equal(local.servers[2].id, 'wardogs-custom-three')
    assert.equal(joinResponse('server=wardogs-custom-two', local).body.server.number, 2)
    assert.equal(joinResponse('server=2', local).body.server.id, 'wardogs-custom-two')
  } finally {
    if (original === undefined) delete process.env.BISECT_SERVER_IDS
    else process.env.BISECT_SERVER_IDS = original
  }
})
