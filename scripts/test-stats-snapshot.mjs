import test from 'node:test'
import assert from 'node:assert/strict'
import { createSnapshotCache, makeRankings, compareRows, metricValue, METRICS } from '../integrations/warcon/wardogs-stats-snapshot.ts'
import { statsParams, validPeriod, profileLink } from '../src/lib/leaderboard.js'

const row = (id, values = {}) => ({ steam_id: String(id), name: String(id), kills: 10, deaths: 2, minutes: 60, matches: 2, ...values })
test('full rankings include players beyond 500 and match the paginated ordering', () => {
  const rows = Array.from({ length: 1200 }, (_, i) => row(String(i).padStart(17, '0'), { kills: i }))
  const rankings = makeRankings(rows)
  assert.deepEqual(rankings.positions(rows[0].steam_id).kills, { rank: 1200, total: 1200 })
  for (const metric of ['kills', 'kd', 'matches', 'time']) {
    rankings.ordered(metric).forEach((r, i) => assert.equal(rankings.positions(r.steam_id)[metric].rank, i + 1))
  }
  assert.equal(rows[0].kills, 0, 'sorting must not mutate source rows')
})
test('ties use deaths then Steam ID for kills; kills then ID for ratios', () => {
  const rows = [row('3'), row('2'), row('1', { deaths: 1 })]
  assert.deepEqual([...rows].sort(compareRows('kills')).map(r => r.steam_id), ['1', '2', '3'])
  assert.equal(metricValue(row('1', { kills: 0, deaths: 0 }), 'kd'), null)
  assert.equal(metricValue(row('1', { deaths: 0 }), 'kd'), 10)
  assert.equal(metricValue(row('1', { minutes: 0 }), 'perHour'), null)
  for (const metric of METRICS) assert.doesNotThrow(() => [...rows].sort(compareRows(metric)))
  assert.throws(() => compareRows('injected'))
})
test('alphabetical ordering preserves PostgreSQL collation rather than JS Unicode order', () => {
  const rows = [row('1', {name:'Z',name_order:'1'}), row('2', {name:'A',name_order:'2'})]
  assert.deepEqual([...rows].sort(compareRows('name')).map(r=>r.name), ['Z','A'])
})
test('snapshots coalesce in-flight calls and expire after completion', async () => {
  let now = 0, loads = 0, resolve
  const cache = createSnapshotCache(() => now, 15, 2, 1)
  const loader = () => { loads++; return new Promise(r => { resolve = r }) }
  const first = cache('scope', loader), second = cache('scope', loader)
  await Promise.resolve()
  await assert.rejects(cache('other', loader), /busy/)
  now = 100; resolve({ rows: 1 })
  assert.equal(await first, await second)
  now = 114; await cache('scope', loader); assert.equal(loads, 1)
  now = 115; assert.equal(await cache('scope', async () => 'new'), 'new')
})
test('cache bounds completed scopes, never keeps failures, separates server and season', async () => {
  const cache = createSnapshotCache(() => 0, 15, 2)
  await assert.rejects(cache('bad', async () => { throw new Error('failed') }))
  assert.equal(await cache('bad', async () => 'retry'), 'retry')
  assert.equal(await cache('server-1-season-A', async () => 1), 1)
  assert.equal(await cache('server-2-season-A', async () => 2), 2)
  assert.equal(await cache('bad', async () => 'evicted'), 'evicted')
})
test('new params retain exact Steam IDs and server/period scope', () => {
  const id = '76561198012345678'
  const params = statsParams({ player: id, server: '5', range: 's:official-1' })
  assert.equal(params.get('player'), id)
  assert.equal(params.get('server'), '5')
  assert.equal(params.get('range'), 's:official-1')
  assert.equal(statsParams({ career: id }).get('career'), id)
  assert.equal(statsParams({ meta: true }).get('meta'), '1')
  assert.equal(statsParams({ player: '123' }).has('player'), false)
  assert.equal(validPeriod('s:../../secret'), false)
  assert.equal(validPeriod('s:'), false)
  assert.equal(profileLink(id, { range: 's:official-1', server: '2' }), `/stats?player=${id}&range=s%3Aofficial-1&server=2`)
})
