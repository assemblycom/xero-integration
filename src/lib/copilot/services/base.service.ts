import db, { type DB } from '@/db'
import { CopilotAPI } from '@/lib/copilot/CopilotAPI'
import type User from '@/lib/copilot/models/User.model'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

class BaseService {
  protected readonly copilot: CopilotAPI
  db: DB

  constructor(protected readonly user: User) {
    this.copilot = new CopilotAPI(user.portalId)
    this.db = db
  }

  setTx(tx: Tx) {
    this.db = tx as unknown as DB
  }
  unsetTx() {
    this.db = db
  }
}

export default BaseService
