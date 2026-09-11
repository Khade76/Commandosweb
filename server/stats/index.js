import '../env.js'
import { startStatsService } from './service.js'

const service = await startStatsService()

async function shutdown(signal) {
  console.log(`Received ${signal}; shutting down WARDOGS player stats service.`)
  await service.stop()
  process.exit(0)
}

process.once('SIGINT', () => shutdown('SIGINT'))
process.once('SIGTERM', () => shutdown('SIGTERM'))
