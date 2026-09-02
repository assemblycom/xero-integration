import RetryFailedSyncsService from '@failed-syncs/lib/RetryFailedSyncs.service'
import { schedules } from '@trigger.dev/sdk'

// Runs every 8 hours on trigger.dev's own scheduler (no Vercel cron / route).
export const processResyncForFailedRecords = schedules.task({
  id: 'process-resync-for-failed-records',
  cron: '0 */8 * * *',
  machine: 'small-2x',
  run: async () => {
    await new RetryFailedSyncsService().retryFailedSyncs()
  },
})
