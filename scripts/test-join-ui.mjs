import assert from 'node:assert/strict'
import { joinResponse } from '../server/join.js'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}),
})
const context = await browser.newContext()
const page = await context.newPage()
const origin = new URL(process.env.JOIN_TEST_URL || 'http://127.0.0.1:4189').origin
const lobby = '109775242493124785'
const code = '89607037-07ad-4039-8f7d-1fb9a46e707b'
const uri = `steam://joinlobby/1867240/${lobby}`
const fixture = { servers: [
  { id: 'wardogs-278c7bc5', number: 1, name: '44th Commandos #1', joinCode: code, steamLobbyId: lobby },
  { id: 'wardogs-9290beb1', number: 2, name: '44th Commandos #2', joinCode: '6eccb2c4-4e2a-4cf2-b2d5-67faf8e283b1' },
  { id: 'custom.server-4', number: 4, name: '44th Commandos #4', steamJoinUrl: uri },
] }
let mode = 'normal'
const errors = []
const apiCalls = []
page.on('pageerror', (error) => errors.push(error.message))

// Test only local static pages and synthetic API data. No game or RCON requests.
await context.route('**/*', async (route) => {
  const url = new URL(route.request().url())
  if (url.origin !== origin) return route.abort()
  if (url.pathname !== '/api/join.php' && url.pathname !== '/api/join') return route.continue()
  apiCalls.push(url.search)
  if (mode === 'unavailable') return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Unavailable"}' })
  if (mode === 'disabled') return route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"Server not found."}' })
  const response = joinResponse(url.search.slice(1), fixture)
  if (mode === 'unsafe' && response.status === 200) response.body.steamJoinUrl = 'https://external.invalid/launch'
  if (mode === 'wrong-server' && response.status === 200) response.body.server.number = 5
  await route.fulfill({ status: response.status, contentType: 'application/json', body: JSON.stringify(response.body) })
})

try {
  await page.goto(`${origin}/join?lobby=${lobby}`)
  const steam = page.getByRole('link', { name: 'Open in Steam' })
  await steam.waitFor()
  assert.equal(await steam.getAttribute('href'), uri)
  assert.equal(await page.getByLabel('Server join code').count(), 0)

  await page.goto(`${origin}/join?server=1`)
  await steam.waitFor()
  assert.equal(await steam.getAttribute('href'), uri)
  assert.equal(await page.getByLabel('Server join code').inputValue(), code)
  await page.setViewportSize({ width: 390, height: 844 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'no mobile overflow')
  if (process.env.JOIN_SCREENSHOT) await page.screenshot({ path: process.env.JOIN_SCREENSHOT, fullPage: true })

  await page.goto(`${origin}/join?server=2`)
  await page.getByText('Join with your server code', { exact: true }).waitFor()
  assert.equal(await steam.count(), 0)
  assert.equal(await page.getByLabel('Server join code').inputValue(), fixture.servers[1].joinCode)

  await page.goto(`${origin}/join?server=custom.server-4`)
  await steam.waitFor()
  assert.equal(await steam.getAttribute('href'), uri)

  for (const responseMode of ['unsafe', 'wrong-server', 'unavailable']) {
    mode = responseMode
    await page.goto(`${origin}/join?server=1`)
    await page.getByText('Join with your server code', { exact: true }).waitFor()
    assert.equal(await steam.count(), 0, responseMode)
  }

  mode = 'disabled'
  await page.goto(`${origin}/join?server=1`)
  await page.getByRole('heading', { name: 'Choose a server', exact: true }).waitFor()
  assert.equal(await page.getByLabel('Server join code').count(), 0)
  assert.equal(await steam.count(), 0)

  mode = 'normal'
  const count = apiCalls.length
  for (const invalid of [`server=1&lobby=${lobby}`, 'server=1&server=2', 'server=0', 'lobby=18446744073709551616']) {
    await page.goto(`${origin}/join?${invalid}`)
    await page.getByRole('heading', { name: 'Choose a server', exact: true }).waitFor()
  }
  assert.equal(apiCalls.length, count, 'invalid selectors must not request a destination')
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ passed: true, directLobby: true, configuredServer: true, customId: true, manualFallback: true, invalidDestinationRejected: true, disabledServerHidden: true, mobile: true, apiRequests: apiCalls.length }))
} finally {
  await context.close()
  await browser.close()
}
