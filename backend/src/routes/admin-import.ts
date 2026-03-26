import type { FastifyInstance } from 'fastify'
import { exec }    from 'child_process'
import { promisify } from 'util'
import { logger }  from '../utils/logger'
import { prisma }  from '../db'

const execAsync = promisify(exec)

export async function adminImportRoutes(app: FastifyInstance) {
  const admin = { preHandler: [app.adminOnly] }

  // Run import job
  app.post('/run', admin, async (req, reply) => {
    logger.info('Admin triggered import via API')

    // Fire-and-forget — runs in background
    execAsync('node dist/scripts/import-users.js')
      .then(({ stdout, stderr }) => {
        logger.info('Import finished:', stdout)
        if (stderr) logger.warn('Import stderr:', stderr)
      })
      .catch(err => logger.error('Import failed:', err))

    return { ok: true, message: 'Import started. Check server logs.' }
  })

  // Import stats (already in admin.ts but exposed here too)
  app.get('/status', admin, async () => {
    const [total, matched, pending] = await Promise.all([
      prisma.importRecord.count(),
      prisma.importRecord.count({ where: { status: 'matched' } }),
      prisma.importRecord.count({ where: { status: 'pending' } }),
    ])
    return { total, matched, pending, unmatched: total - matched }
  })

  // Recent import records
  app.get('/records', admin, async (req) => {
    const { page = '1', status = '' } = req.query as Record<string, string>
    const skip  = (Number(page) - 1) * 50
    const where = status ? { status } : {}

    const [records, total] = await Promise.all([
      prisma.importRecord.findMany({
        where,
        skip,
        take:    50,
        orderBy: { importedAt: 'desc' },
        include: { user: { select: { email: true, telegramName: true, subStatus: true } } },
      }),
      prisma.importRecord.count({ where }),
    ])

    return { records, total }
  })
}
