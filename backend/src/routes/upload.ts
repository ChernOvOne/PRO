import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'crypto'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { logger } from '../utils/logger'

const UPLOAD_DIR = '/app/uploads'
const MAX_SIZE = 5 * 1024 * 1024 // 5MB

export async function uploadRoutes(app: FastifyInstance) {
  // Upload file (admin only)
  app.post('/upload', { preHandler: [app.adminOnly] }, async (req, reply) => {
    const contentType = req.headers['content-type'] || ''

    if (!contentType.startsWith('multipart/form-data')) {
      return reply.status(400).send({ error: 'Content-Type must be multipart/form-data' })
    }

    try {
      const data = await req.file()
      if (!data) return reply.status(400).send({ error: 'No file uploaded' })

      const buf = await data.toBuffer()
      if (buf.length > MAX_SIZE) return reply.status(400).send({ error: 'File too large (max 5MB)' })

      // Determine extension
      const ext = data.filename.split('.').pop()?.toLowerCase() || 'bin'
      const allowed = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'ico']
      if (!allowed.includes(ext)) return reply.status(400).send({ error: `File type .${ext} not allowed` })

      const filename = `${randomUUID()}.${ext}`
      await mkdir(UPLOAD_DIR, { recursive: true })
      await writeFile(join(UPLOAD_DIR, filename), buf)

      const url = `/uploads/${filename}`
      logger.info(`File uploaded: ${filename} (${buf.length} bytes)`)

      return { ok: true, url, filename }
    } catch (err: any) {
      logger.error('Upload error:', err)
      return reply.status(500).send({ error: 'Upload failed' })
    }
  })
}
