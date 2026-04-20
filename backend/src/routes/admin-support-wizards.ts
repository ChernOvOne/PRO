import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'

const CATEGORIES = ['BILLING', 'TECH', 'REFUND', 'SUBSCRIPTION', 'OTHER'] as const
const NODE_TYPES = ['choice', 'text', 'textarea', 'terminal'] as const

const OptionSchema = z.object({
  value: z.string(),
  label: z.string(),
  icon: z.string().optional().nullable(),
  nextNodeId: z.string().optional().nullable(),
})

export async function adminSupportWizardRoutes(app: FastifyInstance) {
  const admin = { preHandler: [app.adminOnly] }

  /* ── Wizards CRUD ────────────────────────────────────────── */

  app.get('/wizards', admin, async () =>
    prisma.supportWizard.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        nodes: { orderBy: { createdAt: 'asc' } },
      },
    })
  )

  app.get('/wizards/:id', admin, async (req, reply) => {
    const { id } = req.params as { id: string }
    const wizard = await prisma.supportWizard.findUnique({
      where: { id },
      include: { nodes: { orderBy: { createdAt: 'asc' } } },
    })
    if (!wizard) return reply.status(404).send({ error: 'Not found' })
    return wizard
  })

  app.post('/wizards', admin, async (req) => {
    const body = z.object({
      category: z.enum(CATEGORIES),
      title: z.string().min(1),
      icon: z.string().optional().nullable(),
      description: z.string().optional().nullable(),
      enabled: z.boolean().default(true),
      sortOrder: z.number().int().default(0),
    }).parse(req.body)

    return prisma.supportWizard.create({ data: body })
  })

  app.put('/wizards/:id', admin, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = z.object({
      category: z.enum(CATEGORIES).optional(),
      title: z.string().min(1).optional(),
      icon: z.string().optional().nullable(),
      description: z.string().optional().nullable(),
      enabled: z.boolean().optional(),
      entryNodeId: z.string().optional().nullable(),
      sortOrder: z.number().int().optional(),
    }).parse(req.body)

    try {
      return await prisma.supportWizard.update({ where: { id }, data: body })
    } catch {
      return reply.status(404).send({ error: 'Not found' })
    }
  })

  app.delete('/wizards/:id', admin, async (req, reply) => {
    const { id } = req.params as { id: string }
    try {
      await prisma.supportWizard.delete({ where: { id } })
      return { ok: true }
    } catch {
      return reply.status(404).send({ error: 'Not found' })
    }
  })

  /* ── Nodes CRUD ──────────────────────────────────────────── */

  app.post('/wizards/:id/nodes', admin, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = z.object({
      nodeType: z.enum(NODE_TYPES),
      answerId: z.string().optional().nullable(),
      question: z.string().optional().nullable(),
      hint: z.string().optional().nullable(),
      placeholder: z.string().optional().nullable(),
      optional: z.boolean().default(false),
      options: z.array(OptionSchema).optional().nullable(),
      nextNodeId: z.string().optional().nullable(),
      posX: z.number().default(0),
      posY: z.number().default(0),
      subjectTemplate: z.string().optional().nullable(),
      bodyTemplate: z.string().optional().nullable(),
    }).parse(req.body)

    const wizard = await prisma.supportWizard.findUnique({ where: { id } })
    if (!wizard) return reply.status(404).send({ error: 'Wizard not found' })

    const node = await prisma.supportWizardNode.create({
      data: {
        wizardId: id,
        nodeType: body.nodeType,
        answerId: body.answerId ?? null,
        question: body.question ?? null,
        hint: body.hint ?? null,
        placeholder: body.placeholder ?? null,
        optional: body.optional,
        options: body.options ?? undefined,
        nextNodeId: body.nextNodeId ?? null,
        posX: body.posX,
        posY: body.posY,
        subjectTemplate: body.subjectTemplate ?? null,
        bodyTemplate: body.bodyTemplate ?? null,
      },
    })

    // If this is the first node, set it as entry
    if (!wizard.entryNodeId) {
      await prisma.supportWizard.update({
        where: { id },
        data: { entryNodeId: node.id },
      })
    }
    return node
  })

  app.put('/wizards/:id/nodes/:nodeId', admin, async (req, reply) => {
    const { id, nodeId } = req.params as { id: string; nodeId: string }
    const body = z.object({
      nodeType: z.enum(NODE_TYPES).optional(),
      answerId: z.string().optional().nullable(),
      question: z.string().optional().nullable(),
      hint: z.string().optional().nullable(),
      placeholder: z.string().optional().nullable(),
      optional: z.boolean().optional(),
      options: z.array(OptionSchema).optional().nullable(),
      nextNodeId: z.string().optional().nullable(),
      posX: z.number().optional(),
      posY: z.number().optional(),
      subjectTemplate: z.string().optional().nullable(),
      bodyTemplate: z.string().optional().nullable(),
    }).parse(req.body)

    try {
      return await prisma.supportWizardNode.update({
        where: { id: nodeId, wizardId: id },
        data: {
          ...body,
          options: body.options === undefined ? undefined : (body.options ?? undefined),
        } as any,
      })
    } catch {
      return reply.status(404).send({ error: 'Node not found' })
    }
  })

  app.delete('/wizards/:id/nodes/:nodeId', admin, async (req, reply) => {
    const { id, nodeId } = req.params as { id: string; nodeId: string }
    const wizard = await prisma.supportWizard.findUnique({ where: { id } })
    if (!wizard) return reply.status(404).send({ error: 'Not found' })

    try {
      await prisma.supportWizardNode.delete({ where: { id: nodeId, wizardId: id } })
    } catch {
      return reply.status(404).send({ error: 'Node not found' })
    }

    // Clear entry pointer if we just deleted the entry node
    if (wizard.entryNodeId === nodeId) {
      await prisma.supportWizard.update({
        where: { id },
        data: { entryNodeId: null },
      })
    }

    // Clear any edges pointing at the deleted node
    const remaining = await prisma.supportWizardNode.findMany({ where: { wizardId: id } })
    for (const n of remaining) {
      let dirty = false
      let newNextNodeId = n.nextNodeId
      let newOptions = n.options as any

      if (n.nextNodeId === nodeId) { newNextNodeId = null; dirty = true }
      if (Array.isArray(newOptions)) {
        const cleaned = newOptions.map((o: any) =>
          o?.nextNodeId === nodeId ? { ...o, nextNodeId: null } : o
        )
        if (JSON.stringify(cleaned) !== JSON.stringify(newOptions)) {
          newOptions = cleaned
          dirty = true
        }
      }
      if (dirty) {
        await prisma.supportWizardNode.update({
          where: { id: n.id },
          data: { nextNodeId: newNextNodeId, options: newOptions ?? undefined },
        })
      }
    }

    return { ok: true }
  })

  // Bulk reposition: save all node positions at once after DnD
  app.put('/wizards/:id/positions', admin, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = z.object({
      positions: z.array(z.object({
        id: z.string(),
        posX: z.number(),
        posY: z.number(),
      })),
    }).parse(req.body)

    await prisma.$transaction(
      body.positions.map(p =>
        prisma.supportWizardNode.update({
          where: { id: p.id, wizardId: id },
          data: { posX: p.posX, posY: p.posY },
        })
      )
    )
    return { ok: true }
  })
}

/* ──────────────────────────────────────────────────────────────
   Public: enabled wizards for user-facing ticket creation
   ────────────────────────────────────────────────────────────── */
export async function publicSupportWizardRoutes(app: FastifyInstance) {
  app.get('/wizards', async () => {
    return prisma.supportWizard.findMany({
      where: { enabled: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { nodes: { orderBy: { createdAt: 'asc' } } },
    })
  })
}
