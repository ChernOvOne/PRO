import axios, { AxiosInstance } from 'axios'
import { config } from '../config'
import { logger } from '../utils/logger'

// ── Types ────────────────────────────────────────────────────
export interface RemnawaveUser {
  uuid:           string
  username:       string
  status:         'ACTIVE' | 'DISABLED' | 'LIMITED' | 'EXPIRED'
  expireAt:       string | null
  usedTrafficBytes: number
  trafficLimitBytes: number | null
  subscriptionUrl: string
  email?:         string
  telegramId?:    string
  createdAt:      string
  updatedAt:      string
}

export interface CreateUserPayload {
  username:         string
  expireAt?:        string
  trafficLimitBytes?: number
  email?:           string
  telegramId?:      string
  note?:            string
  tagIds?:          string[]
}

export interface UpdateUserPayload {
  expireAt?:        string
  status?:          'ACTIVE' | 'DISABLED'
  trafficLimitBytes?: number
  email?:           string
  telegramId?:      string
  tagIds?:          string[]
}

export interface UserSearchResult {
  users: RemnawaveUser[]
  total: number
}

// ── Client ───────────────────────────────────────────────────
class RemnawaveService {
  private client: AxiosInstance

  constructor() {
    this.client = axios.create({
      baseURL: config.remnawave.url,
      headers: {
        'Authorization': `Bearer ${config.remnawave.token}`,
        'Content-Type':  'application/json',
      },
      timeout: 15_000,
    })

    this.client.interceptors.response.use(
      res => res,
      err => {
        const msg = err.response?.data?.message || err.message
        logger.error(`REMNAWAVE API error: ${msg}`, {
          status: err.response?.status,
          url:    err.config?.url,
        })
        throw err
      },
    )
  }

  // ── Users ──────────────────────────────────────────────────
  async getAllUsers(page = 1, limit = 100): Promise<UserSearchResult> {
    const res = await this.client.get('/api/users', {
      params: { page, limit },
    })
    return res.data
  }

  async getUserByUuid(uuid: string): Promise<RemnawaveUser> {
    const res = await this.client.get(`/api/users/${uuid}`)
    return res.data.response
  }

  async getUserByEmail(email: string): Promise<RemnawaveUser | null> {
    try {
      const res = await this.client.get('/api/users', {
        params: { search: email, limit: 5 },
      })
      const users: RemnawaveUser[] = res.data.users || []
      return users.find(u => u.email === email) ?? null
    } catch {
      return null
    }
  }

  async getUserByTelegramId(telegramId: string): Promise<RemnawaveUser | null> {
    try {
      const res = await this.client.get('/api/users', {
        params: { search: telegramId, limit: 5 },
      })
      const users: RemnawaveUser[] = res.data.users || []
      return users.find(u => u.telegramId === telegramId) ?? null
    } catch {
      return null
    }
  }

  async createUser(payload: CreateUserPayload): Promise<RemnawaveUser> {
    const res = await this.client.post('/api/users', payload)
    return res.data.response
  }

  async updateUser(uuid: string, payload: UpdateUserPayload): Promise<RemnawaveUser> {
    const res = await this.client.patch(`/api/users/${uuid}`, payload)
    return res.data.response
  }

  async enableUser(uuid: string): Promise<RemnawaveUser> {
    return this.updateUser(uuid, { status: 'ACTIVE' })
  }

  async disableUser(uuid: string): Promise<RemnawaveUser> {
    return this.updateUser(uuid, { status: 'DISABLED' })
  }

  // ── Subscription extension ─────────────────────────────────
  async extendSubscription(
    uuid:    string,
    days:    number,
    current: Date | null = null,
  ): Promise<RemnawaveUser> {
    const base = current
      ? new Date(current)
      : new Date()

    // If current is in the past, extend from now
    if (base < new Date()) base.setTime(Date.now())
    base.setDate(base.getDate() + days)

    return this.updateUser(uuid, {
      expireAt: base.toISOString(),
      status:   'ACTIVE',
    })
  }

  // ── Subscription URL ───────────────────────────────────────
  getSubscriptionUrl(uuid: string): string {
    return `${config.remnawave.subscriptionUrl}/sub/${uuid}`
  }

  // ── System stats ───────────────────────────────────────────
  async getSystemStats() {
    const res = await this.client.get('/api/system/stats')
    return res.data
  }

  async getNodes() {
    const res = await this.client.get('/api/nodes')
    return res.data
  }

  // ── Bulk import helper ─────────────────────────────────────
  async findOrCreateUser(params: {
    email?:      string
    telegramId?: string
    username:    string
    expireAt?:   string
  }): Promise<{ user: RemnawaveUser; created: boolean }> {
    // Try to find by email first, then telegram ID
    let existing: RemnawaveUser | null = null

    if (params.email) {
      existing = await this.getUserByEmail(params.email)
    }
    if (!existing && params.telegramId) {
      existing = await this.getUserByTelegramId(params.telegramId)
    }

    if (existing) {
      return { user: existing, created: false }
    }

    const user = await this.createUser({
      username:   params.username,
      email:      params.email,
      telegramId: params.telegramId,
      expireAt:   params.expireAt,
    })
    return { user, created: true }
  }
}

export const remnawave = new RemnawaveService()
