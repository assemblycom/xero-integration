import { afterEach, beforeEach } from 'vitest'
import env from '@/config/server.env'

// FLAG_ENABLE_DELETE_SYNC defaults to false and env is parsed once at import.
// Flip the shared singleton on for delete-sync tests and reset it after so the
// value never leaks into other files (the suite runs isolate:false).
export function enableDeleteSyncForTest() {
  beforeEach(() => {
    env.FLAG_ENABLE_DELETE_SYNC = true
  })
  afterEach(() => {
    env.FLAG_ENABLE_DELETE_SYNC = false
  })
}
