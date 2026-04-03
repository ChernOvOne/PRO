import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'

export async function adminChannelRoutes(app: FastifyInstance) {
  const admin = { preHandler: [app.adminOnly] }

  // ─────────────────────────────────────────────────────────
  //  LIST NOTIFICATION CHANNELS
  // ─────────────────────────────────────────────────────────
  app.get('/', admin, async () => {
    return prisma.buhNotificationChannel.findMany({
      orderBy: { createdAt: 'desc' },
    })
  })

  // ─────────────────────────────────────────────────────────
  //  CREATE NOTIFICATION CHANNEL
  // ─────────────────────────────────────────────────────────
  app.post('/', admin, async (req, reply) => {
    const body = z.object({
      name:          z.string().min(1),
      chatId:        z.string().min(1),
      isActive:      z.boolean().optional(),
      notifyIncome:  z.boolean().optional(),
      notifyExpense: z.boolean().optional(),
      notifyInkas:   z.boolean().optional(),
      notifyPayment: z.boolean().optional(),
      notifyAd:      z.boolean().optional(),
      notifyServer:  z.boolean().optional(),
    }).parse(req.body)

    const channel = await prisma.buhNotificationChannel.create({
      data: {
        name:          body.name,
        chatId:        body.chatId,
        isActive:      body.isActive,
        notifyIncome:  body.notifyIncome,
        notifyExpense: body.notifyExpense,
        notifyInkas:   body.notifyInkas,
        notifyPayment: body.notifyPayment,
        notifyAd:      body.notifyAd,
        notifyServer:  body.notifyServer,
      },
    })

    return reply.status(201).send(channel)
  })

  // ─────────────────────────────────────────────────────────
  //  UPDATE NOTIFICATION CHANNEL
  // ─────────────────────────────────────────────────────────
  app.patch('/:id', admin, async (req, reply) => {
    const { id } = req.params as { id: string }

    const body = z.object({
      name:          z.string().min(1).optional(),
      chatId:        z.string().min(1).optional(),
      isActive:      z.boolean().optional(),
      notifyIncome:  z.boolean().optional(),
      notifyExpense: z.boolean().optional(),
      notifyInkas:   z.boolean().optional(),
      notifyPayment: z.boolean().optional(),
      notifyAd:      z.boolean().optional(),
      notifyServer:  z.boolean().optional(),
    }).parse(req.body)

    const existing = await prisma.buhNotificationChannel.findUnique({ where: { id } })
    if (!existing) return reply.status(404).send({ error: 'Channel not found' })

    return prisma.buhNotificationChannel.update({
      where: { id },
      data: body,
    })
  })

  // ─────────────────────────────────────────────────────────
  //  DELETE NOTIFICATION CHANNEL
  // ─────────────────────────────────────────────────────────
  app.delete('/:id', admin, async (req, reply) => {
    const { id } = req.params as { id: string }

    const existing = await prisma.buhNotificationChannel.findUnique({ where: { id } })
    if (!existing) return reply.status(404).send({ error: 'Channel not found' })

    await prisma.buhNotificationChannel.delete({ where: { id } })
    return { ok: true }
  })

  // ─────────────────────────────────────────────────────────
  //  SEND TEST MESSAGE (stub for Phase 6)
  // ─────────────────────────────────────────────────────────
  app.post('/test/:id', admin, async (req, reply) => {
    const { id } = req.params as { id: string }

    const existing = await prisma.buhNotificationChannel.findUnique({ where: { id } })
    if (!existing) return reply.status(404).send({ error: 'Channel not found' })

    return { ok: true, message: 'Test message sent' }
  })
}
