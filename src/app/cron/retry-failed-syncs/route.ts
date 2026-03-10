import { retryFailedSyncs } from '@failed-syncs/api/failedSyncs.controller'
import { withErrorHandler } from '@/utils/withErrorHandler'

export const maxDuration = 300

export const GET = withErrorHandler(retryFailedSyncs)
