import '../env.js'
import { startStatsService } from '../stats/service.js'

await startStatsService()
await import('../bots/wardogs-status-bots.js')
