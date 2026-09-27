import test from 'node:test'
import assert from 'node:assert/strict'
import { statsParams, pageInfo, isRankedView, SORT_OPTIONS, PERIOD_OPTIONS } from '../src/lib/leaderboard.js'

test('defaults use the combined WARCON board and 25 rows', () => {
  assert.deepEqual(Object.fromEntries(statsParams()), { group: 'all', range: 'all', sort: 'kills', limit: '25', offset: '0' })
})
test('every supported metric and period is passed to the server', () => {
  for (const [sort] of SORT_OPTIONS) for (const [range] of PERIOD_OPTIONS) {
    const params = statsParams({ sort, range })
    assert.equal(params.get('sort'), sort)
    assert.equal(params.get('range'), range)
  }
})
test('all five server scopes work without creating a Hardcore split', () => {
  for (let server = 1; server <= 5; server++) assert.equal(statsParams({ server }).get('server'), String(server))
  for (const server of ['', 'all', 'hardcore', '6', '-1']) assert.equal(statsParams({ server }).has('server'), false)
})
test('Steam IDs stay strings and names are safely encoded', () => {
  const id = '76561198012345678'
  assert.equal(statsParams({ search: id }).get('search'), id)
  assert.equal(statsParams({ search: '  A&B + friends  ' }).get('search'), 'A&B + friends')
  assert.equal(statsParams({ search: 'a'.repeat(100) }).get('search').length, 80)
})
test('leader and profile requests retain the selected scope', () => {
  const params = statsParams({ server: '5', range: '7d', leaders: true, limit: 1 })
  assert.equal(params.get('server'), '5')
  assert.equal(params.get('range'), '7d')
  assert.equal(params.get('leaders'), '1')
})
test('pagination goes beyond the former 500-player list', () => {
  const page = pageInfo(1234, 22, 25)
  assert.deepEqual(page, { page: 22, pages: 50, offset: 525, first: 526, last: 550, total: 1234 })
  assert.equal(statsParams({ offset: page.offset }).get('offset'), '525')
})
test('empty and final pages have correct counts', () => {
  assert.deepEqual(pageInfo(0, 1, 25), { page: 1, pages: 1, offset: 0, first: 0, last: 0, total: 0 })
  assert.deepEqual(pageInfo(53, 3, 25), { page: 3, pages: 3, offset: 50, first: 51, last: 53, total: 53 })
})
test('shrinking results and API limits cannot produce duplicate out-of-range pages', () => {
  assert.equal(pageInfo(12, 8, 25).page, 1)
  assert.equal(pageInfo(200000, 999999, 25).offset, 100000)
  assert.equal(statsParams({ offset: -5, limit: 9999 }).get('offset'), '0')
  assert.equal(statsParams({ offset: -5, limit: 9999 }).get('limit'), '500')
})
test('filtered and alphabetical positions are not presented as global ranks', () => {
  assert.equal(isRankedView('', 'kills'), true)
  assert.equal(isRankedView(' ', 'wins'), true)
  assert.equal(isRankedView('Khade', 'kills'), false)
  assert.equal(isRankedView('', 'name'), false)
  assert.equal(isRankedView('', 'lastSeen'), false)
})
