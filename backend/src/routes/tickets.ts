import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { prisma } from '../db'
import { logger } from '../utils/logger'

const UPLOAD_DIR = '/app/uploads'

/* ── Schemas ──────────────────────────────────────────────── */

const CreateTicketSchema = z.object({
  subject:  z.string().min(2).max(200),
  category: z.enum(['BILLING', 'TECH', 'REFUND', 'SUBSCRIPTION', 'OTHER']).default('OTHER'),
  message:  z.string().min(1).max(5000),
  source:   z.enum(['WEB', 'MINIAPP']).default('WEB'),
})

const SendMessageSchema = z.object({
  body:        z.string().min(1).max(5000),
  attachments: z.array(z.object({
    name: z.string(),
    url:  z.string(),
    size: z.number().optional(),
    type: z.string().optional(),
  })).optional(),
  source:      z.enum(['WEB', 'MINIAPP']).default('WEB'),
})

/* ── Client routes (/api/tickets) ────────────────────────── */

export async function ticketRoutes(app: FastifyInstance) {
  // Upload attachment (authenticated user)
  app.post('/upload', { preHandler: [app.authenticate] }, async (req, reply) => {
    const contentType = req.headers['content-type'] || ''
    if (!contentType.startsWith('multipart/form-data')) {
      return reply.status(400).send({ error: 'Content-Type must be multipart/form-data' })
    }
    try {
      const data = await (req as any).file()
      if (!data) return reply.status(400).send({ error: 'No file uploaded' })

      const buf = await data.toBuffer()
      if (buf.length > 10 * 1024 * 1024) {
        return reply.status(400).send({ error: 'Файл слишком большой (макс 10 МБ)' })
      }

      // Security: only images
      const ext = (data.filename || 'file').split('.').pop()?.toLowerCase() || 'bin'
      const allowedExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif']
      if (!allowedExts.includes(ext)) {
        return reply.status(400).send({ error: 'Разрешены только изображения (JPG, PNG, GIF, WebP, HEIC)' })
      }

      // Mime check
      const mime = (data.mimetype || '').toLowerCase()
      if (!mime.startsWith('image/')) {
        return reply.status(400).send({ error: 'Файл не является изображением' })
      }

      // Magic bytes check (file signature) — defense against renamed executables
      const signatures: Array<{ sig: number[]; offset?: number }> = [
        { sig: [0xff, 0xd8, 0xff] },             // JPEG
        { sig: [0x89, 0x50, 0x4e, 0x47] },       // PNG
        { sig: [0x47, 0x49, 0x46, 0x38] },       // GIF
        { sig: [0x52, 0x49, 0x46, 0x46], offset: 0 }, // RIFF (WebP)
      ]
      const isValidImage = signatures.some(({ sig, offset = 0 }) =>
        sig.every((b, i) => buf[offset + i] === b)
      )
      // HEIC starts with ftyp box
      const isHeic = buf.length > 12 && buf.slice(4, 8).toString('ascii') === 'ftyp' &&
        ['heic', 'heix', 'mif1', 'msf1'].includes(buf.slice(8, 12).toString('ascii'))

      if (!isValidImage && !isHeic) {
        return reply.status(400).send({ error: 'Файл повреждён или не является изображением' })
      }

      // Generate safe filename (no user input in name)
      const safeExt = ext === 'jpeg' ? 'jpg' : ext
      const filename = `ticket-${randomUUID()}.${safeExt}`
      await mkdir(UPLOAD_DIR, { recursive: true })
      await writeFile(join(UPLOAD_DIR, filename), buf)

      logger.info(`Ticket attachment: ${filename} (${buf.length} bytes)`)

      return {
        ok: true,
        url: `/uploads/${filename}`,
        name: data.filename,
        size: buf.length,
        type: data.mimetype || `image/${ext}`,
      }
    } catch (err: any) {
      logger.error('Ticket upload error: ' + (err?.message || String(err)))
      return reply.status(500).send({ error: 'Ошибка загрузки' })
    }
  })

  // List user's tickets
  app.get('/', { preHandler: [app.authenticate] }, async (req) => {
    const userId = (req.user as any).sub as string

    const tickets = await prisma.ticket.findMany({
      where: { userId },
      orderBy: { lastMessageAt: 'desc' },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          where: { isInternal: false },
        },
      },
    })

    return tickets.map(t => ({
      id: t.id,
      subject: t.subject,
      category: t.category,
      status: t.status,
      priority: t.priority,
      lastMessageAt: t.lastMessageAt,
      unreadCount: t.unreadByUser,
      lastMessage: t.messages[0] ? {
        body: t.messages[0].body,
        authorType: t.messages[0].authorType,
        createdAt: t.messages[0].createdAt,
      } : null,
      createdAt: t.createdAt,
    }))
  })

  // Get single ticket with all messages
  app.get('/:id', { preHandler: [app.authenticate] }, async (req, reply) => {
    const userId = (req.user as any).sub as string
    const { id } = req.params as { id: string }

    const ticket = await prisma.ticket.findFirst({
      where: { id, userId },
      include: {
        messages: {
          where: { isInternal: false },
          orderBy: { createdAt: 'asc' },
          include: {
            author: { select: { id: true, email: true, telegramName: true, role: true, avatarColor: true } },
          },
        },
      },
    })

    if (!ticket) return reply.status(404).send({ error: 'Ticket not found' })

    // Mark messages as read by user
    await prisma.$transaction([
      prisma.ticketMessage.updateMany({
        where: {
          ticketId: ticket.id,
          authorType: 'ADMIN',
          readByUserAt: null,
        },
        data: { readByUserAt: new Date() },
      }),
      prisma.ticket.update({
        where: { id: ticket.id },
        data: { unreadByUser: 0 },
      }),
    ])

    return ticket
  })

  // Create new ticket
  app.post('/', { preHandler: [app.authenticate] }, async (req, reply) => {
    const userId = (req.user as any).sub as string
    const data = CreateTicketSchema.parse(req.body)

    const ticket = await prisma.ticket.create({
      data: {
        userId,
        subject: data.subject,
        category: data.category,
        source: data.source,
        messages: {
          create: {
            authorType: 'USER',
            authorId: userId,
            body: data.message,
            source: data.source,
          },
        },
        unreadByAdmin: 1,
        lastMessageAt: new Date(),
      },
    })

    logger.info(`Ticket created: ${ticket.id} by user ${userId}`)

    // TODO: notify admin via TG channel
    return { id: ticket.id, status: ticket.status }
  })

  // Send message in ticket
  app.post('/:id/messages', { preHandler: [app.authenticate] }, async (req, reply) => {
    const userId = (req.user as any).sub as string
    const { id } = req.params as { id: string }
    const data = SendMessageSchema.parse(req.body)

    const ticket = await prisma.ticket.findFirst({ where: { id, userId } })
    if (!ticket) return reply.status(404).send({ error: 'Ticket not found' })
    if (ticket.status === 'CLOSED') {
      return reply.status(400).send({ error: 'Ticket is closed' })
    }

    const msg = await prisma.ticketMessage.create({
      data: {
        ticketId: ticket.id,
        authorType: 'USER',
        authorId: userId,
        body: data.body,
        attachments: data.attachments ? (data.attachments as any) : undefined,
        source: data.source,
      },
    })

    // Reopen if was resolved, bump unread
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        status: ticket.status === 'RESOLVED' ? 'OPEN' : ticket.status,
        lastMessageAt: new Date(),
        unreadByAdmin: { increment: 1 },
      },
    })

    return msg
  })

  // Close ticket by user
  app.post('/:id/close', { preHandler: [app.authenticate] }, async (req, reply) => {
    const userId = (req.user as any).sub as string
    const { id } = req.params as { id: string }

    const ticket = await prisma.ticket.findFirst({ where: { id, userId } })
    if (!ticket) return reply.status(404).send({ error: 'Ticket not found' })

    await prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
      },
    })

    return { ok: true }
  })

  // Rate resolved ticket
  app.post('/:id/rate', { preHandler: [app.authenticate] }, async (req, reply) => {
    const userId = (req.user as any).sub as string
    const { id } = req.params as { id: string }
    const { rating, comment } = req.body as { rating: number; comment?: string }

    if (rating < 1 || rating > 5) return reply.status(400).send({ error: 'Rating 1-5' })

    const ticket = await prisma.ticket.findFirst({ where: { id, userId } })
    if (!ticket) return reply.status(404).send({ error: 'Ticket not found' })

    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { rating, ratingComment: comment ?? null },
    })

    return { ok: true }
  })
}
