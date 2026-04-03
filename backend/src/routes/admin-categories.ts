import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'

export async function adminCategoryRoutes(app: FastifyInstance) {
  const admin = { preHandler: [app.adminOnly] }
  const staff = { preHandler: [app.requireStaff] }

  // ── GET / — list active categories ─────────────────────────
  app.get('/', staff, async () => {
    return prisma.buhCategory.findMany({
      where:   { isActive: true },
      orderBy: { sortOrder: 'asc' },
    })
  })

  // ── POST / — create category ───────────────────────────────
  app.post('/', admin, async (req) => {
    const body = z
      .object({
        name:      z.string().min(1),
        color:     z.string().min(1),
        icon:      z.string().optional(),
        sortOrder: z.number().int().optional(),
      })
      .parse(req.body)

    return prisma.buhCategory.create({ data: body })
  })

  // ── PATCH /:id — update category ───────────────────────────
  app.patch('/:id', admin, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params)

    const body = z
      .object({
        name:      z.string().min(1).optional(),
        color:     z.string().min(1).optional(),
        icon:      z.string().nullable().optional(),
        sortOrder: z.number().int().optional(),
        isActive:  z.boolean().optional(),
      })
      .parse(req.body)

    const existing = await prisma.buhCategory.findUnique({ where: { id } })
    if (!existing) return reply.status(404).send({ error: 'Category not found' })

    return prisma.buhCategory.update({ where: { id }, data: body })
  })

  // ── DELETE /:id — soft or hard delete category ─────────────
  app.delete('/:id', admin, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params)

    const existing = await prisma.buhCategory.findUnique({ where: { id } })
    if (!existing) return reply.status(404).send({ error: 'Category not found' })

    const txCount = await prisma.buhTransaction.count({ where: { categoryId: id } })

    if (txCount > 0) {
      await prisma.buhCategory.update({
        where: { id },
        data:  { isActive: false },
      })
      return { ok: true, mode: 'soft' }
    }

    await prisma.buhCategory.delete({ where: { id } })
    return { ok: true, mode: 'hard' }
  })

  // ── GET /auto-rules — list auto-tag rules ──────────────────
  app.get('/auto-rules', admin, async () => {
    return prisma.buhAutoTagRule.findMany({
      include: { category: true },
      orderBy: { keyword: 'asc' },
    })
  })

  // ── POST /auto-rules — create auto-tag rule ────────────────
  app.post('/auto-rules', admin, async (req, reply) => {
    const body = z
      .object({
        categoryId: z.string().min(1),
        keyword:    z.string().min(1),
      })
      .parse(req.body)

    const category = await prisma.buhCategory.findUnique({ where: { id: body.categoryId } })
    if (!category) return reply.status(404).send({ error: 'Category not found' })

    return prisma.buhAutoTagRule.create({ data: body })
  })

  // ── DELETE /auto-rules/:id — delete auto-tag rule ──────────
  app.delete('/auto-rules/:id', admin, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params)

    const existing = await prisma.buhAutoTagRule.findUnique({ where: { id } })
    if (!existing) return reply.status(404).send({ error: 'Rule not found' })

    await prisma.buhAutoTagRule.delete({ where: { id } })
    return { ok: true }
  })
}
