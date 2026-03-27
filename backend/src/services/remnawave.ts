import axios, { AxiosInstance } from 'axios'
import { config } from '../config'
import { logger } from '../utils/logger'

// ── Types — точно соответствуют реальному ответу Remnawave API ─
export interface RemnawaveUserTraffic {
  usedTrafficBytes:          number
  lifetimeUsedTrafficBytes:  number
  onlineAt:                  string | null
  lastConnectedNodeUuid:     string | null
  firstConnectedAt:          string | null
}

export interface RemnawaveUser {
  uuid:                 string
  id:                   number
  shortUuid:            string
  username:             string
  status:               'ACTIVE' | 'DISABLED' | 'LIMITED' | 'EXPIRED'
  trafficLimitBytes:    number   // 0 = безлимит
  trafficLimitStrategy: string
  expireAt:             string | null
  telegramId:           number | null   // ЧИСЛО, не строка!
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
  userTraffic:          RemnawaveUserTraffic  // трафик в отдельном объекте!
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
  telegramId?:        number | null   // число!
  description?:       string | null
  tagIds?:            string[]
  activeUserInbounds?: Array<{ uuid: string }>
}

export interface UpdateUserPayload {
  expireAt?:          string | null
  status?:            'ACTIVE' | 'DISABLED'
  trafficLimitBytes?: number | null
  email?:             string | null
  telegramId?:        number | null
  description?:       string | null
}

// ── Helpers ───────────────────────────────────────────────────
// Из реального ответа: поле response может быть массивом или объектом
function unwrap(data: any): any {
  return data?.response ?? data
}

// ── Service ───────────────────────────────────────────────────
class RemnawaveService {
  private client: AxiosInstance
  private configured: boolean

  constructor() {
    this.configured = !!(config.remnawave.token)

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
        const status = err.response?.status
        const msg    = err.response?.data?.message || err.message
        // 400/404 — ожидаемые ответы при поиске, не логируем как ERROR
        if (status !== 400 && status !== 404) {
          logger.error(`REMNAWAVE API error [${status}]: ${msg}`, {
            url:    err.config?.url,
            method: err.config?.method,
          })
        } else {
          logger.debug(`REMNAWAVE ${status} on ${err.config?.url} — trying fallback`)
        }
        throw err
      },
    )
  }

  private check(): boolean {
    if (!this.configured) {
      logger.warn('REMNAWAVE_TOKEN not configured — skipping API call')
      return false
    }
    return true
  }

  // ── Получить по UUID ────────────────────────────────────────
  async getUserByUuid(uuid: string): Promise<RemnawaveUser> {
    const res  = await this.client.get(`/api/users/${uuid}`)
    const data = unwrap(res.data)
    // Может вернуть массив или объект
    if (Array.isArray(data)) return data[0]
    return data
  }

  // ── Поиск по Telegram ID ────────────────────────────────────
  // Реальный эндпоинт: GET /api/users — с параметром поиска по telegramId
  // telegramId в Remnawave — число (int), передаём как число
  async getUserByTelegramId(telegramId: string): Promise<RemnawaveUser | null> {
    if (!this.check()) return null
    try {
      const tgIdNum = parseInt(telegramId, 10)
      if (isNaN(tgIdNum)) return null

      // Пробуем варианты endpoint в порядке приоритета
      const endpoints = [
        // Вариант 1: path param (наиболее распространённый в REST API)
        () => this.client.get(`/api/users/get-by-telegram-id/${tgIdNum}`),
        // Вариант 2: query param telegramId
        () => this.client.get('/api/users/get-by-telegram-id', { params: { telegramId: tgIdNum } }),
        // Вариант 3: query param telegram_id (snake_case)
        () => this.client.get('/api/users/get-by-telegram-id', { params: { telegram_id: tgIdNum } }),
      ]

      for (const attempt of endpoints) {
        try {
          const res  = await attempt()
          const data = unwrap(res.data)
          if (Array.isArray(data)) return this.pickBestUser(data)
          if (data) return data
        } catch (e: any) {
          // 400/404 — этот вариант не работает, пробуем следующий
          if (e.response?.status === 400 || e.response?.status === 404) continue
          throw e  // другая ошибка — пробрасываем
        }
      }

      // Финальный fallback: получаем всех пользователей и фильтруем на клиенте.
      // Перебираем страницы пока не найдём нужного telegramId.
      return await this.searchByTelegramIdFallback(tgIdNum)
    } catch {
      return null
    }
  }

  // Поиск перебором страниц — используется если специальный endpoint недоступен
  private async searchByTelegramIdFallback(telegramId: number): Promise<RemnawaveUser | null> {
    const pageSize = 100
    let start = 0
    for (let page = 0; page < 20; page++) {  // максимум 2000 пользователей
      try {
        const res  = await this.client.get('/api/users', {
          params: { start, size: pageSize },
        })
        const data  = unwrap(res.data)
        const users: RemnawaveUser[] = Array.isArray(data) ? data : (data.users ?? [])
        if (!users.length) break  // конец списка

        const matched = users.filter(u => u.telegramId === telegramId)
        if (matched.length) return this.pickBestUser(matched)

        if (users.length < pageSize) break  // последняя страница
        start += pageSize
      } catch {
        break
      }
    }
    return null
  }

  // ── Поиск по Email ──────────────────────────────────────────
  async getUserByEmail(email: string): Promise<RemnawaveUser | null> {
    if (!this.check()) return null
    try {
      const endpoints = [
        () => this.client.get(`/api/users/get-by-email/${encodeURIComponent(email)}`),
        () => this.client.get('/api/users/get-by-email', { params: { email } }),
      ]

      for (const attempt of endpoints) {
        try {
          const res  = await attempt()
          const data = unwrap(res.data)
          if (Array.isArray(data)) return this.pickBestUser(data)
          if (data) return data
        } catch (e: any) {
          if (e.response?.status === 400 || e.response?.status === 404) continue
          throw e
        }
      }

      // Fallback: перебор страниц
      const pageSize = 100
      let start = 0
      for (let page = 0; page < 20; page++) {
        try {
          const res   = await this.client.get('/api/users', {
            params: { start, size: pageSize },
          })
          const data  = unwrap(res.data)
          const users: RemnawaveUser[] = Array.isArray(data) ? data : (data.users ?? [])
          if (!users.length) break
          const matched = users.filter(u => u.email === email)
          if (matched.length) return this.pickBestUser(matched)
          if (users.length < pageSize) break
          start += pageSize
        } catch { break }
      }
      return null
    } catch {
      return null
    }
  }

  // Из нескольких записей выбираем лучшую:
  // 1. ACTIVE с самой поздней датой истечения
  // 2. иначе самую свежую по expireAt
  private pickBestUser(users: RemnawaveUser[]): RemnawaveUser | null {
    if (!users.length) return null
    if (users.length === 1) return users[0]

    const active = users.filter(u => u.status === 'ACTIVE')
    const pool   = active.length ? active : users

    return pool.reduce((best, u) => {
      const bestDate = best.expireAt ? new Date(best.expireAt).getTime() : 0
      const uDate    = u.expireAt    ? new Date(u.expireAt).getTime()    : 0
      return uDate > bestDate ? u : best
    })
  }

  // ── Все пользователи (для admin) ────────────────────────────
  async getAllUsers(start = 0, size = 25): Promise<RemnawaveUsersResponse> {
    const res  = await this.client.get('/api/users', { params: { start, size } })
    const data = unwrap(res.data)
    return {
      users: Array.isArray(data) ? data : (data.users ?? []),
      total: data.total ?? 0,
    }
  }

  // ── CRUD ────────────────────────────────────────────────────
  async createUser(payload: CreateUserPayload): Promise<RemnawaveUser> {
    const res = await this.client.post('/api/users', payload)
    return unwrap(res.data)
  }

  async updateUser(uuid: string, payload: UpdateUserPayload): Promise<RemnawaveUser> {
    const res = await this.client.patch(`/api/users/${uuid}`, payload)
    return unwrap(res.data)
  }

  async enableUser(uuid: string): Promise<RemnawaveUser> {
    try {
      const res = await this.client.post(`/api/users/${uuid}/enable`)
      return unwrap(res.data)
    } catch {
      return this.updateUser(uuid, { status: 'ACTIVE' })
    }
  }

  async disableUser(uuid: string): Promise<RemnawaveUser> {
    try {
      const res = await this.client.post(`/api/users/${uuid}/disable`)
      return unwrap(res.data)
    } catch {
      return this.updateUser(uuid, { status: 'DISABLED' })
    }
  }

  async resetTraffic(uuid: string): Promise<RemnawaveUser> {
    const res = await this.client.post(`/api/users/${uuid}/reset-traffic`)
    return unwrap(res.data)
  }

  async revokeSubscription(uuid: string): Promise<RemnawaveUser> {
    const res = await this.client.post(`/api/users/${uuid}/revoke-subscription`)
    return unwrap(res.data)
  }

  // ── Продление подписки ──────────────────────────────────────
  async extendSubscription(
    uuid:    string,
    days:    number,
    current: Date | null = null,
  ): Promise<RemnawaveUser> {
    const base = current ? new Date(current) : new Date()
    if (base < new Date()) base.setTime(Date.now())
    base.setDate(base.getDate() + days)
    return this.updateUser(uuid, { expireAt: base.toISOString(), status: 'ACTIVE' })
  }

  // ── URL подписки ─────────────────────────────────────────────
  getSubscriptionUrl(uuid: string, rmSubscriptionUrl?: string | null): string {
    if (rmSubscriptionUrl) return rmSubscriptionUrl
    return `${config.remnawave.subscriptionUrl}/sub/${uuid}`
  }

  // ── Полная синхронизация для ЛК ────────────────────────────
  // Собирает все нужные данные для отображения подписки пользователю
  async syncUserSubscription(remnawaveUuid: string): Promise<{
    status:             string
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

      // Трафик теперь в userTraffic (из реального ответа API)
      const usedBytes  = rm.userTraffic?.usedTrafficBytes  ?? 0
      const limitBytes = rm.trafficLimitBytes > 0 ? rm.trafficLimitBytes : null

      let daysLeft: number | null = null
      if (rm.expireAt) {
        const ms = new Date(rm.expireAt).getTime() - Date.now()
        daysLeft = Math.max(0, Math.ceil(ms / 86_400_000))
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
        daysLeft,
        trafficUsedPercent,
      }
    } catch {
      return null
    }
  }

  // ── Статистика ───────────────────────────────────────────────
  async getSystemStats() {
    try {
      const res = await this.client.get('/api/system/stats')
      return unwrap(res.data)
    } catch { return null }
  }

  async getNodes() {
    try {
      const res = await this.client.get('/api/nodes')
      return unwrap(res.data)
    } catch { return null }
  }

  // ── Хелпер: найти или создать ───────────────────────────────
  async findOrCreateUser(params: {
    email?:      string
    telegramId?: string
    username:    string
    expireAt?:   string
  }): Promise<{ user: RemnawaveUser; created: boolean }> {
    let existing: RemnawaveUser | null = null

    if (params.email)      existing = await this.getUserByEmail(params.email)
    if (!existing && params.telegramId)
      existing = await this.getUserByTelegramId(params.telegramId)

    if (existing) return { user: existing, created: false }

    const user = await this.createUser({
      username:   params.username,
      email:      params.email      ?? null,
      telegramId: params.telegramId ? parseInt(params.telegramId, 10) : null,
      expireAt:   params.expireAt   ?? null,
    })
    return { user, created: true }
  }
}

export const remnawave = new RemnawaveService()
