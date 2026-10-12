import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const context = await browser.newContext()
const page = await context.newPage()
const requests = [], errors = []
page.on('pageerror', error => errors.push(error.message))
const id = '76561198000000001', other = '76561198000000002'
const player = { id, name: 'Test player', totalKills: 100, totalDeaths: 20, kd: 5, killsPerHour: 10, secondsTracked: 36000, matchesSeen: 10, wins: 6, losses: 4, draws: 0, winRate: .6, cash: 10000, seedMinutes: 5, serverCounts: {'server-1': 2}, factionCounts: {Faction: 2}, aliases: ['Old alias'], ranks: Object.fromEntries(['kills','kd','matches','time'].map(key => [key, {rank:751,total:42000}])) }
const season = {key:'wardogs-1',name:'Season 1',kind:'official',startsAt:'2026-09-10T16:00:00Z',endsAt:null}
await page.route('**/api/player-stats.php?*', async route => {
  const query = new URL(route.request().url()).searchParams
  requests.push(Object.fromEntries(query))
  const head = {version:2, group:'all',server:query.get('server') ? Number(query.get('server')) : null,range:query.get('range'),seasons:[season],source:'warcon-leaderboard',snapshotAt:'2026-10-12T20:00:00Z'}
  let body
  if(query.has('meta')) body = head
  else if(query.has('career')) body = {...head,playerId:query.get('career'),career:{basis:'completed-matches',period:'all',matches:10,vehicleKills:3,killStreak:7,longestM:250,streak:{kind:'win',n:2},maps:[{key:'Test map',matches:10,wins:6,losses:4,draws:0,kills:100,deaths:20}],factions:[],last:[{matchId:1,serverId:'1',serverName:'Server #1',map:'Test map',faction:'Faction',result:'win',kills:10,deaths:2,cashDelta:100,endedAt:'2026-10-12T19:00:00Z'}]}}
  else if(query.has('leaders')) body = {...head,leaders:{kills:player}}
  else body = {...head,total:query.has('player')||query.has('search') ? 1 : 42000,players:[query.has('search') ? {...player,id:other,name:'Comparison player'} : player],summary:{trackedPlayers:42000,onlinePlayers:100,totalKillsRecorded:100000,secondsTracked:360000}}
  await route.fulfill({contentType:'application/json',body:JSON.stringify(body)})
})
try {
  await page.goto(process.env.STATS_TEST_URL || 'http://127.0.0.1:4173/stats')
  await page.getByRole('button', {name:/Test player/}).click()
  await page.getByRole('heading', {name:'Full leaderboard positions'}).waitFor()
  await page.getByText('#751 of 42,000', {exact:true}).first().waitFor()
  assert.equal(requests.some(q=>q.limit==='500'),false)
  assert.equal(requests.some(q=>q.career),false,'career must remain lazy')
  await page.locator('.profile-compare-search input').fill('Comparison')
  await page.getByLabel('Comparison player').selectOption(other)
  await page.getByRole('columnheader',{name:'Comparison player',exact:true}).waitFor()
  await page.getByText('Career records, recent matches and map / faction performance',{exact:true}).click()
  await page.getByRole('heading',{name:'Recorded match career'}).waitFor()
  await page.getByText('250.00 m',{exact:true}).waitFor()
  assert.equal(requests.filter(q=>q.career).length,1)
  const link = await page.getByRole('link',{name:'Permalink to this profile'}).getAttribute('href')
  await page.goto('http://127.0.0.1:4173'+link)
  await page.getByRole('heading',{name:'Test player',exact:true}).waitFor()
  await page.getByRole('button',{name:'← Back to leaderboard'}).click()
  await page.getByLabel('Period',{exact:true}).selectOption('s:wardogs-1')
  await page.getByText(/Season statistics use WARCON/).waitFor()
  await page.getByLabel('Server',{exact:true}).selectOption('5')
  await page.getByRole('button', {name:/Test player/}).click()
  await page.getByText('#751 of 42,000', {exact:true}).first().waitFor()
  assert.ok(requests.some(q=>q.player===id && q.server==='5' && q.range==='s:wardogs-1'))
  await page.setViewportSize({width:390,height:844})
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no page-level mobile overflow')
  if(process.env.STATS_SCREENSHOT) await page.screenshot({path:process.env.STATS_SCREENSHOT,fullPage:true})
  assert.deepEqual(errors,[])
  console.log(JSON.stringify({passed:true,requests:requests.length,no500PlayerDownloads:true,deepRanks:true,careerLazy:true,seasons:true,permalink:true,mobile:true}))
} finally { await context.close(); await browser.close() }
