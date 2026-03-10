import { getSyncLogsCsv } from '@sync-logs/api/syncLogs.controller'
import { withErrorHandler } from '@/utils/withErrorHandler'

export const maxDuration = 300

export const GET = withErrorHandler(getSyncLogsCsv)
