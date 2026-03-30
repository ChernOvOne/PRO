import axios, { AxiosInstance } from 'axios'
import { config } from '../config'
import { logger } from '../utils/logger'

// ── Types ─────────────────────────────────────────────────────
export interface RemnawaveUserTraffic {
  usedTrafficBytes:         number
  lifetimeUsedTrafficBytes: number
  onlineAt:                 string | null
  lastConnectedNodeUuid:    string | null
  firstConnectedAt:         string | null
}

export interface RemnawaveUser {
  uuid:                 string
  id:                   number
  shortUuid:            string
  username:             string
  status:               'ACTIVE' | 'DISABLED' | 'LIMITED' | 'EXPIRED'
  trafficLimitBytes:    number
  trafficLimitStrategy: string
  expireAt:             string | null
  telegramId:           number | null
  email:                string | null
  description:          string | null
  tag:                  string | null
  hwidDeviceLimit:      number
  subRevokedAt:         string | null
  subLastUserAgent:     string | null
  subLastOpenedAt:      string | null
  lastTrafficResetAt:   string | null
  createdAt:            string
  updatedAt:            string
  subscriptionUrl:      string
  activeInternalSquads: Array<{ uuid: string; name: string }>
  userTraffic:          RemnawaveUserTraffic
}

export interface HwidDevice {
  hwid:        string
  userUuid:    string
  platform:    string
  osVersion:   string
  deviceModel: string
  userAgent:   string
  createdAt:   string
  updatedAt:   string
}

export interface InternalSquad {
  uuid:         string
  viewPosition: number
  name:         string
  info: {
    membersCount: number
    inboundsCount: number
  }
}

export interface CreateUserPayload {
  username:             string
  status?:              'ACTIVE' | 'DISABLED'
  expireAt?:            string | null
  trafficLimitBytes?:   number
  trafficLimitStrategy?: string
  email?:               string | null
  telegramId?:          number | null
  description?:         string | null
  tag?:                 string | null
  hwidDeviceLimit?:     number
  activeInternalSquads?: string[]
  tagIds?:              string[]   // legacy compat
}

export interface UpdateUserPayload {
  uuid:                  string   // ОБЯЗАТЕЛЕН в теле!
  username?:             string
  expireAt?:             string | null
  status?:               'ACTIVE' | 'DISABLED'
  trafficLimitBytes?:    number | null
  trafficLimitStrategy?: string
  email?:                string | null
  telegramId?:           number | null
  description?:          string | null
  tag?:                  string | null
  hwidDeviceLimit?:      number
  activeInternalSquads?: string[]
}

// ── Service ───────────────────────────────────────────────────
class RemnawaveService {
  private client: AxiosInstance
  public  configured: boolean

  constructor() {
    this.configured = !!(config.remnawave.token)
    this.client = axios.create({
      baseURL: config.remnawave.url,
      headers: {
        'Authorization': `Bearer ${config.remnawave.token}`,
        'Content-Type':  'application/json',
        'accept':        'application/json',
      },
      timeout: 15_000,
    })

    this.client.interceptors.response.use(
      res => res,
      err => {
        const status = err.response?.status
        const msg    = err.response?.data?.message || err.message
        if (status !== 400 && status !== 404) {
          logger.error(`REMNAWAVE API error [${status}]: ${msg}`, {
            url: err.config?.url, method: err.config?.method,
          })
        } else {
          logger.debug(`REMNAWAVE ${status}: ${err.config?.url}`)
        }
        throw err
      },
    )
  }

  private check(): boolean {
    if (!this.configured) { logger.warn('REMNAWAVE_TOKEN not configured'); return false }
    return true
  }

  private unwrap(data: any): any {
    return data?.response ?? data
  }

  // ── GET by UUID ──────────────────────────────────────────────
  async getUserByUuid(uuid: string): Promise<RemnawaveUser> {
    const res  = await this.client.get(`/api/users/${uuid}`)
    const data = this.unwrap(res.data)
    return Array.isArray(data) ? data[0] : data
  }

  // ── GET by Telegram ID ───────────────────────────────────────
  // Документация: GET /api/users/get-by-telegram-id/{telegramId}
  async getUserByTelegramId(telegramId: string): Promise<RemnawaveUser | null> {
    if (!this.check()) return null
    try {
      const tgIdNum = parseInt(telegramId, 10)
      if (isNaN(tgIdNum)) return null

      const res  = await this.client.get(`/api/users/get-by-telegram-id/${tgIdNum}`)
      const data = this.unwrap(res.data)
      // Может вернуть массив (несколько подписок на одном tgId)
      if (Array.isArray(data)) return this.pickBestUser(data)
      return data ?? null
    } catch (e: any) {
      if (e.response?.status === 404) return null
      logger.error(`getUserByTelegramId failed: ${e.message}`)
      return null
    }
  }

  // ── GET by Email ─────────────────────────────────────────────
  async getUserByEmail(email: string): Promise<RemnawaveUser | null> {
    if (!this.check()) return null
    try {
      const res  = await this.client.get(`/api/users/get-by-email/${encodeURIComponent(email)}`)
      const data = this.unwrap(res.data)
      if (Array.isArray(data)) return this.pickBestUser(data)
      return data ?? null
    } catch (e: any) {
      if (e.response?.status === 404) return null
      // Fallback через общий список
      try {
        const res2  = await this.client.get('/api/users', { params: { start: 0, size: 100 } })
        const data2 = this.unwrap(res2.data)
        const users: RemnawaveUser[] = Array.isArray(data2) ? data2 : (data2.users ?? [])
        const matched = users.filter(u => u.email === email)
        return this.pickBestUser(matched)
      } catch { return null }
    }
  }

  // Выбираем лучшую подписку: ACTIVE с самой поздней датой
  private pickBestUser(users: RemnawaveUser[]): RemnawaveUser | null {
    if (!users.length) return null
    if (users.length === 1) return users[0]
    const active = users.filter(u => u.status === 'ACTIVE')
    const pool   = active.length ? active : users
    return pool.reduce((best, u) => {
      const bDate = best.expireAt ? new Date(best.expireAt).getTime() : 0
      const uDate = u.expireAt    ? new Date(u.expireAt).getTime()    : 0
      return uDate > bDate ? u : best
    })
  }

  // ── All users ────────────────────────────────────────────────
  async getAllUsers(start = 0, size = 25) {
    const res  = await this.client.get('/api/users', { params: { start, size } })
    const data = this.unwrap(res.data)
    return {
      users: Array.isArray(data) ? data : (data.users ?? []) as RemnawaveUser[],
      total: data.total ?? 0,
    }
  }

  // ── CREATE: POST /api/users ──────────────────────────────────
  async createUser(payload: CreateUserPayload): Promise<RemnawaveUser> {
    const res = await this.client.post('/api/users', payload)
    return this.unwrap(res.data)
  }

  // ── UPDATE: PATCH /api/users (uuid в теле!) ─────────────────
  async updateUser(payload: UpdateUserPayload): Promise<RemnawaveUser> {
    const res = await this.client.patch('/api/users', payload)
    return this.unwrap(res.data)
  }

  // ── Enable / Disable ─────────────────────────────────────────
  async enableUser(uuid: string): Promise<RemnawaveUser> {
    return this.updateUser({ uuid, status: 'ACTIVE' })
  }

  async disableUser(uuid: string): Promise<RemnawaveUser> {
    return this.updateUser({ uuid, status: 'DISABLED' })
  }

  // ── Extend subscription ──────────────────────────────────────
  async extendSubscription(uuid: string, days: number, current: Date | null = null): Promise<RemnawaveUser> {
    const base = current ? new Date(current) : new Date()
    if (base < new Date()) base.setTime(Date.now())
    base.setDate(base.getDate() + days)
    return this.updateUser({ uuid, expireAt: base.toISOString(), status: 'ACTIVE' })
  }

  // ── HWID Devices ─────────────────────────────────────────────
  // GET /api/hwid/devices/{userUuid}
  async getDevices(userUuid: string): Promise<{ devices: HwidDevice[]; total: number }> {
    const res  = await this.client.get(`/api/hwid/devices/${userUuid}`)
    const data = this.unwrap(res.data)
    return {
      devices: data.devices ?? [],
      total:   data.total   ?? 0,
    }
  }

  // POST /api/hwid/devices/delete
  async deleteDevice(userUuid: string, hwid: string): Promise<void> {
    await this.client.post('/api/hwid/devices/delete', { userUuid, hwid })
  }

  // ── Internal Squads ──────────────────────────────────────────
  // GET /api/internal-squads
  async getInternalSquads(): Promise<{ squads: InternalSquad[]; total: number }> {
    const res  = await this.client.get('/api/internal-squads')
    const data = this.unwrap(res.data)
    return {
      squads: data.internalSquads ?? [],
      total:  data.total          ?? 0,
    }
  }

  // ── Subscription URL ─────────────────────────────────────────
  getSubscriptionUrl(uuid: string, rmSubscriptionUrl?: string | null): string {
    if (rmSubscriptionUrl) return rmSubscriptionUrl
    return `${config.remnawave.subscriptionUrl}/sub/${uuid}`
  }

  // ── Full sync for LK ─────────────────────────────────────────
  async syncUserSubscription(remnawaveUuid: string): Promise<{
    status:             string
    expireAt:           string | null
    usedTrafficBytes:   number
    trafficLimitBytes:  number | null
    subscriptionUrl:    string
    onlineAt:           string | null
    subLastOpenedAt:    string | null
    subLastUserAgent:   string | null
    daysLeft:           number | null
    trafficUsedPercent: number | null
    activeSquads:       Array<{ uuid: string; name: string }>
  } | null> {
    try {
      const rm       = await this.getUserByUuid(remnawaveUuid)
      const usedBytes  = rm.userTraffic?.usedTrafficBytes  ?? 0
      const limitBytes = rm.trafficLimitBytes > 0 ? rm.trafficLimitBytes : null

      let daysLeft: number | null = null
      if (rm.expireAt) {
        daysLeft = Math.max(0, Math.ceil((new Date(rm.expireAt).getTime() - Date.now()) / 86_400_000))
      }

      let trafficUsedPercent: number | null = null
      if (limitBytes && limitBytes > 0) {
        trafficUsedPercent = Math.min(100, Math.round(usedBytes / limitBytes * 100))
      }

      return {
        status:             rm.status,
        expireAt:           rm.expireAt,
        usedTrafficBytes:   usedBytes,
        trafficLimitBytes:  limitBytes,
        subscriptionUrl:    this.getSubscriptionUrl(rm.uuid, rm.subscriptionUrl),
        onlineAt:           rm.userTraffic?.onlineAt ?? null,
        subLastOpenedAt:    rm.subLastOpenedAt,
        subLastUserAgent:   rm.subLastUserAgent,
        daysLeft,
        trafficUsedPercent,
        activeSquads:       rm.activeInternalSquads ?? [],
      }
    } catch { return null }
  }

  // ── Delete user ───────────────────────────────────────────────
  async deleteUser(uuid: string): Promise<void> {
    await this.client.delete(`/api/users/${uuid}`)
    logger.info(`REMNAWAVE user deleted: ${uuid}`)
  }

  // ── Revoke subscription (reset shortUuid) ───────────────────
  async revokeSubscription(uuid: string): Promise<RemnawaveUser> {
    const res = await this.client.post(`/api/users/${uuid}/actions/revoke`, {
      revokeOnlyPasswords: false,
    })
    return this.unwrap(res.data)
  }

  // ── Disable user ────────────────────────────────────────────
  async disableUserAction(uuid: string): Promise<RemnawaveUser> {
    const res = await this.client.post(`/api/users/${uuid}/actions/disable`)
    return this.unwrap(res.data)
  }

  // ── Reset traffic ───────────────────────────────────────────
  async resetTrafficAction(uuid: string): Promise<RemnawaveUser> {
    const res = await this.client.post(`/api/users/${uuid}/actions/reset-traffic`)
    return this.unwrap(res.data)
  }

  // ── Get by tag ──────────────────────────────────────────────
  async getUsersByTag(tag: string): Promise<RemnawaveUser[]> {
    if (!this.check()) return []
    try {
      const res  = await this.client.get(`/api/users/by-tag/${encodeURIComponent(tag)}`)
      const data = this.unwrap(res.data)
      return Array.isArray(data) ? data : []
    } catch { return [] }
  }

  // ── System ───────────────────────────────────────────────────
  async getSystemHealth() {
    try {
      const r = await this.client.get('/api/system/health')
      return this.unwrap(r.data)
    } catch { return null }
  }

  async getSystemStats() {
    try { const r = await this.client.get('/api/system/stats'); return this.unwrap(r.data) }
    catch { return null }
  }

  async getNodesMetrics() {
    try {
      const r = await this.client.get('/api/system/nodes/metrics')
      return this.unwrap(r.data)
    } catch { return null }
  }

  async getNodes() {
    try { const r = await this.client.get('/api/nodes'); return this.unwrap(r.data) }
    catch { return null }
  }

  // ── Find or create ───────────────────────────────────────────
  async findOrCreateUser(params: {
    email?:      string
    telegramId?: string
    username:    string
    expireAt?:   string
    squads?:     string[]
  }): Promise<{ user: RemnawaveUser; created: boolean }> {
    let existing: RemnawaveUser | null = null
    if (params.email)      existing = await this.getUserByEmail(params.email)
    if (!existing && params.telegramId)
      existing = await this.getUserByTelegramId(params.telegramId)
    if (existing) return { user: existing, created: false }

    const user = await this.createUser({
      username:             params.username,
      email:                params.email      ?? null,
      telegramId:           params.telegramId ? parseInt(params.telegramId, 10) : null,
      expireAt:             params.expireAt   ?? null,
      activeInternalSquads: params.squads     ?? [],
    })
    return { user, created: true }
  }
}

export const remnawave = new RemnawaveService()
