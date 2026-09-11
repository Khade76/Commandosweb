import '../server/env.js'
import { testWardogsRcon, wardogsRconConfigured } from '../server/providers/wardogs-rcon.js'

for (let index = 0; index < 2; index += 1) {
  const serverNumber = index + 1
  console.log(`\n=== WARDOGS RCON server ${serverNumber} ===`)

  if (!wardogsRconConfigured(index)) {
    console.log('Not configured. Set WARDOGS_RCON_SERVER_' + serverNumber + '_URL and _PASSWORD in .env.')
    continue
  }

  try {
    const result = await testWardogsRcon(index)
    console.log('\n/v1/status')
    console.log(JSON.stringify(result.status, null, 2))

    console.log('\n/v1/capabilities')
    console.log(JSON.stringify(result.capabilities, null, 2))
  } catch (error) {
    console.error(`RCON server ${serverNumber} failed: ${error.message}`)
  }
}
