import axios, { AxiosInstance } from 'axios'
import { config } from '../config'
import { logger } from '../utils/logger'

// ── Types ─────────────────────────────────────────────────────
// Соответствуют Remnawave API v1.6+
export interface RemnawaveUser {
  uuid:               string
  username:           string
  status:             'ACTIVE' | 'DISABLED' | 'LIMITED' | 'EXPIRED'
  expireAt:           string | null
  usedTrafficBytes:   number
  trafficLimitBytes:  number | null
  trafficLimitStrategy: 'NO_RESET' | 'MONTH' | 'WEEK' | 'DAY'
  subLastUserAgent:   string | null
  subLastOpenedAt:    string | null
  subRevokedAt:       string | null
  onlineAt:           string | null
  email:              string | null
  telegramId:         string | null
  description:        string | null
  shortUuid:          string
  subscriptionUrl:    string    // полный URL подписки из панели
  hwidDeviceLimit:    number | null
  createdAt:          string
  updatedAt:          string
}

export interface RemnawaveUsersResponse {
  users: RemnawaveUser[]
  total: number
}

export interface CreateUserPayload {
  username:           string
  expireAt?:          string | null
  trafficLimitBytes?: number
  email?:             string | null
  telegramId?:        string | null
  description?:       string | null
  activeUserInbounds?: Array<{ uuid: string }>
}

export interface UpdateUserPayload {
  expireAt?:          string | null
  status?:            'ACTIVE' | 'DISABLED'
  trafficLimitBytes?: number | null
  email?:             string | null
  telegramId?:        string | null
  description?:       string | null
}

// ── Service ───────────────────────────────────────────────────
class RemnawaveService {
  private client: AxiosInstance
  private configured: boolean

  constructor() {
    this.configured = !!(config.remnawave.token)

    this.client = axios.create({
      baseURL:  config.remnawave.url,
      headers: {
        'Authorization': `Bearer ${config.remnawave.token}`,
        'Content-Type':  'application/json',
      },
      timeout: 15_000,
    })

    this.client.interceptors.response.use(
      res => res,
      err => {
        const status = err.response?.status
        const msg    = err.response?.data?.message || err.message
        logger.error(`REMNAWAVE API error [${status}]: ${msg}`, {
          url:    err.config?.url,
          method: err.config?.method,
        })
        throw err
      },
    )
  }

  // Проверка что токен задан — не крашим если не настроен
  private check(): boolean {
    if (!this.configured) {
      logger.warn('REMNAWAVE_TOKEN not configured — skipping API call')
      return false
    }
    return true
  }

  // ── Поиск пользователей ───────────────────────────────────

  // Получить по UUID — основной метод для синхронизации подписки
  async getUserByUuid(uuid: string): Promise<RemnawaveUser> {
    const res = await this.client.get(`/api/users/${uuid}`)
    // Remnawave возвращает { response: {...} }
    return res.data.response ?? res.data
  }

  // Получить по email — используется при привязке аккаунта
  // Remnawave API v1.6+: GET /api/users/get-by-email?email=xxx
  async getUserByEmail(email: string): Promise<RemnawaveUser | null> {
    if (!this.check()) return null
    try {
      const res = await this.client.get('/api/users/get-by-email', {
        params: { email },
      })
      return res.data.response ?? res.data ?? null
    } catch (err: any) {
      if (err.response?.status === 404) return null
      // Fallback: поиск через общий список если эндпоинт не найден
      return this.searchUserByField('email', email)
    }
  }

  // Получить по Telegram ID — используется при Telegram-авторизации
  // Remnawave API v1.6+: GET /api/users/get-by-telegram-id?telegramId=xxx
  async getUserByTelegramId(telegramId: string): Promise<RemnawaveUser | null> {
    if (!this.check()) return null
    try {
      const res = await this.client.get('/api/users/get-by-telegram-id', {
        params: { telegramId },
      })
      return res.data.response ?? res.data ?? null
    } catch (err: any) {
      if (err.response?.status === 404) return null
      return this.searchUserByField('telegramId', telegramId)
    }
  }

  // Fallback поиск через список — на случай старых версий API
  private async searchUserByField(
    field: 'email' | 'telegramId',
    value: string,
  ): Promise<RemnawaveUser | null> {
    try {
      const res = await this.client.get('/api/users', {
        params: { start: 0, size: 10, search: value },
      })
      const users: RemnawaveUser[] = res.data.users ?? res.data.response?.users ?? []
      return users.find(u => {
        if (field === 'email')      return u.email      === value
        if (field === 'telegramId') return u.telegramId === value
        return false
      }) ?? null
    } catch {
      return null
    }
  }

  // Получить всех пользователей (для admin)
  async getAllUsers(start = 0, size = 25): Promise<RemnawaveUsersResponse> {
    const res = await this.client.get('/api/users', {
      params: { start, size },
    })
    const data = res.data.response ?? res.data
    return {
      users: data.users ?? [],
      total: data.total ?? 0,
    }
  }

  // ── Управление пользователями ─────────────────────────────

  async createUser(payload: CreateUserPayload): Promise<RemnawaveUser> {
    const res = await this.client.post('/api/users', payload)
    return res.data.response ?? res.data
  }

  async updateUser(uuid: string, payload: UpdateUserPayload): Promise<RemnawaveUser> {
    const res = await this.client.patch(`/api/users/${uuid}`, payload)
    return res.data.response ?? res.data
  }

  // Включить пользователя: POST /api/users/{uuid}/enable
  async enableUser(uuid: string): Promise<RemnawaveUser> {
    try {
      const res = await this.client.post(`/api/users/${uuid}/enable`)
      return res.data.response ?? res.data
    } catch {
      // Fallback для старых версий
      return this.updateUser(uuid, { status: 'ACTIVE' })
    }
  }

  // Выключить пользователя: POST /api/users/{uuid}/disable
  async disableUser(uuid: string): Promise<RemnawaveUser> {
    try {
      const res = await this.client.post(`/api/users/${uuid}/disable`)
      return res.data.response ?? res.data
    } catch {
      return this.updateUser(uuid, { status: 'DISABLED' })
    }
  }

  // Сброс трафика: POST /api/users/{uuid}/reset-traffic
  async resetTraffic(uuid: string): Promise<RemnawaveUser> {
    const res = await this.client.post(`/api/users/${uuid}/reset-traffic`)
    return res.data.response ?? res.data
  }

  // Отозвать подписку (принудительный реконнект клиентов)
  async revokeSubscription(uuid: string): Promise<RemnawaveUser> {
    const res = await this.client.post(`/api/users/${uuid}/revoke-subscription`)
    return res.data.response ?? res.data
  }

  // ── Продление подписки ────────────────────────────────────

  async extendSubscription(
    uuid:    string,
    days:    number,
    current: Date | null = null,
  ): Promise<RemnawaveUser> {
    const base = current ? new Date(current) : new Date()
    // Если дата в прошлом — продлеваем от сегодня
    if (base < new Date()) base.setTime(Date.now())
    base.setDate(base.getDate() + days)

    return this.updateUser(uuid, {
      expireAt: base.toISOString(),
      status:   'ACTIVE',
    })
  }

  // ── URL подписки ──────────────────────────────────────────

  // Возвращает URL подписки — предпочитаем тот что вернул сам REMNAWAVE
  getSubscriptionUrl(uuid: string, rmSubscriptionUrl?: string): string {
    if (rmSubscriptionUrl) return rmSubscriptionUrl
    return `${config.remnawave.subscriptionUrl}/sub/${uuid}`
  }

  // ── Системная статистика ──────────────────────────────────

  async getSystemStats() {
    const res = await this.client.get('/api/system/stats')
    return res.data.response ?? res.data
  }

  async getBandwidthStats() {
    try {
      const res = await this.client.get('/api/system/bandwidth-stats')
      return res.data.response ?? res.data
    } catch { return null }
  }

  async getNodes() {
    const res = await this.client.get('/api/nodes')
    return res.data.response ?? res.data
  }

  // ── Хелпер: найти или создать пользователя ────────────────

  async findOrCreateUser(params: {
    email?:      string
    telegramId?: string
    username:    string
    expireAt?:   string
  }): Promise<{ user: RemnawaveUser; created: boolean }> {
    let existing: RemnawaveUser | null = null

    if (params.email) {
      existing = await this.getUserByEmail(params.email)
    }
    if (!existing && params.telegramId) {
      existing = await this.getUserByTelegramId(params.telegramId)
    }

    if (existing) return { user: existing, created: false }

    const user = await this.createUser({
      username:   params.username,
      email:      params.email ?? null,
      telegramId: params.telegramId ?? null,
      expireAt:   params.expireAt ?? null,
    })
    return { user, created: true }
  }

  // ── Полная синхронизация подписки пользователя ────────────
  // Возвращает актуальные данные подписки для отображения в ЛК

  async syncUserSubscription(remnawaveUuid: string): Promise<{
    status:             'ACTIVE' | 'DISABLED' | 'LIMITED' | 'EXPIRED'
    expireAt:           string | null
    usedTrafficBytes:   number
    trafficLimitBytes:  number | null
    subscriptionUrl:    string
    onlineAt:           string | null
    subLastOpenedAt:    string | null
    daysLeft:           number | null
    trafficUsedPercent: number | null
  } | null> {
    try {
      const rm = await this.getUserByUuid(remnawaveUuid)

      // Считаем дни до истечения
      let daysLeft: number | null = null
      if (rm.expireAt) {
        const ms = new Date(rm.expireAt).getTime() - Date.now()
        daysLeft = Math.max(0, Math.ceil(ms / 86_400_000))
      }

      // Процент использованного трафика
      let trafficUsedPercent: number | null = null
      if (rm.trafficLimitBytes && rm.trafficLimitBytes > 0) {
        trafficUsedPercent = Math.min(
          100,
          Math.round((rm.usedTrafficBytes / rm.trafficLimitBytes) * 100),
        )
      }

      return {
        status:             rm.status,
        expireAt:           rm.expireAt,
        usedTrafficBytes:   rm.usedTrafficBytes,
        trafficLimitBytes:  rm.trafficLimitBytes,
        subscriptionUrl:    this.getSubscriptionUrl(rm.uuid, rm.subscriptionUrl),
        onlineAt:           rm.onlineAt,
        subLastOpenedAt:    rm.subLastOpenedAt,
        daysLeft,
        trafficUsedPercent,
      }
    } catch {
      return null
    }
  }
}

export const remnawave = new RemnawaveService()
