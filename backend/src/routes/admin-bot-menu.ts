import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'

const LinkTypeEnum = z.enum(['callback', 'url', 'webapp', 'block'])

const MenuItemInput = z.object({
  label:     z.string().min(1).max(200),
  linkType:  LinkTypeEnum,
  payload:   z.string().min(1),
  row:       z.number().int().min(0).max(50).default(0),
  col:       z.number().int().min(0).max(10).default(0),
  sortOrder: z.number().int().optional(),
  isActive:  z.boolean().default(true),
  staffOnly: z.boolean().default(false),
})

export async function adminBotMenuRoutes(app: FastifyInstance) {
  const admin = { preHandler: [app.adminOnly] }

  // ── GET /api/admin/bot-menu — list all items (active + inactive) ─
  app.get('/', admin, async () => {
    return prisma.botMenuItem.findMany({
      orderBy: [{ row: 'asc' }, { col: 'asc' }, { sortOrder: 'asc' }],
    })
  })

  // ── POST /api/admin/bot-menu — create item ──────────────────────
  app.post('/', admin, async (req) => {
    const body = MenuItemInput.parse(req.body)
    const last = await prisma.botMenuItem.aggregate({ _max: { sortOrder: true } })
    return prisma.botMenuItem.create({
      data: { ...body, sortOrder: body.sortOrder ?? (last._max.sortOrder ?? 0) + 1 },
    })
  })

  // ── PUT /api/admin/bot-menu/:id — update item ───────────────────
  app.put<{ Params: { id: string } }>('/:id', admin, async (req) => {
    const { id } = req.params
    const body = MenuItemInput.partial().parse(req.body)
    return prisma.botMenuItem.update({ where: { id }, data: body })
  })

  // ── DELETE /api/admin/bot-menu/:id ──────────────────────────────
  app.delete<{ Params: { id: string } }>('/:id', admin, async (req) => {
    const { id } = req.params
    await prisma.botMenuItem.delete({ where: { id } })
    return { ok: true }
  })

  // ── PUT /api/admin/bot-menu/reorder — bulk reorder (row/col/sort) ─
  app.put('/reorder', admin, async (req) => {
    const body = z.object({
      items: z.array(z.object({
        id:        z.string().uuid(),
        row:       z.number().int().min(0).max(50),
        col:       z.number().int().min(0).max(10),
        sortOrder: z.number().int(),
      })),
    }).parse(req.body)

    await prisma.$transaction(
      body.items.map(i => prisma.botMenuItem.update({
        where: { id: i.id },
        data:  { row: i.row, col: i.col, sortOrder: i.sortOrder },
      })),
    )
    return { ok: true }
  })

  // ── POST /api/admin/bot-menu/reset-defaults — seed canonical menu ─
  // Drops everything and re-inserts the built-in default layout. Used from
  // the UI when the admin wants to start over after experimenting.
  app.post('/reset-defaults', admin, async () => {
    await prisma.botMenuItem.deleteMany({})
    const defaults = [
      { label: '🔑 Подписка',   linkType: 'callback', payload: 'menu:subscription', row: 0, col: 0 },
      { label: '💳 Тарифы',     linkType: 'callback', payload: 'menu:tariffs',      row: 0, col: 1 },
      { label: '👥 Рефералы',   linkType: 'callback', payload: 'menu:referral',     row: 1, col: 0 },
      { label: '💰 Баланс',     linkType: 'callback', payload: 'menu:balance',      row: 1, col: 1 },
      { label: '🎟 Промокод',   linkType: 'callback', payload: 'menu:promo',        row: 2, col: 0 },
      { label: '📱 Устройства', linkType: 'callback', payload: 'menu:devices',      row: 2, col: 1 },
      { label: '📖 Инструкции', linkType: 'callback', payload: 'menu:instructions', row: 3, col: 0 },
    ].map((i, idx) => ({ ...i, sortOrder: idx, isActive: true, staffOnly: false }))
    await prisma.botMenuItem.createMany({ data: defaults })
    return prisma.botMenuItem.findMany({ orderBy: [{ row: 'asc' }, { col: 'asc' }] })
  })
}
