import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  generatePdfReport,
  generateExcelReport,
  generateComparisonData,
} from '../services/report-generator'

export async function adminReportsExportRoutes(app: FastifyInstance) {
  const editor = { preHandler: [app.requireEditor] }

  // ─────────────────────────────────────────────────────────
  //  POST /pdf — Generate HTML report (for print / save as PDF)
  // ─────────────────────────────────────────────────────────
  app.post('/pdf', editor, async (req, reply) => {
    const body = z.object({
      dateFrom: z.string(),
      dateTo:   z.string(),
    }).parse(req.body)

    const html = await generatePdfReport(new Date(body.dateFrom), new Date(body.dateTo))

    return reply
      .header('Content-Type', 'text/html; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="report.html"')
      .send(html)
  })

  // ─────────────────────────────────────────────────────────
  //  POST /excel — Generate CSV report
  // ─────────────────────────────────────────────────────────
  app.post('/excel', editor, async (req, reply) => {
    const body = z.object({
      dateFrom: z.string(),
      dateTo:   z.string(),
    }).parse(req.body)

    const csv = await generateExcelReport(new Date(body.dateFrom), new Date(body.dateTo))

    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="report.csv"')
      .send(csv)
  })

  // ─────────────────────────────────────────────────────────
  //  GET /quick/:period — Quick export (week / month / year)
  // ─────────────────────────────────────────────────────────
  app.get('/quick/:period', editor, async (req, reply) => {
    const { period } = req.params as { period: string }
    const { format } = req.query as { format?: string }

    const now = new Date()
    let dateFrom: Date
    let dateTo: Date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)

    switch (period) {
      case 'week': {
        dateFrom = new Date(dateTo)
        dateFrom.setDate(dateFrom.getDate() - 6)
        dateFrom.setHours(0, 0, 0, 0)
        break
      }
      case 'month': {
        dateFrom = new Date(now.getFullYear(), now.getMonth(), 1)
        break
      }
      case 'year': {
        dateFrom = new Date(now.getFullYear(), 0, 1)
        break
      }
      default:
        return reply.code(400).send({ error: 'Invalid period. Use: week, month, year' })
    }

    if (format === 'excel') {
      const csv = await generateExcelReport(dateFrom, dateTo)
      return reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="report-${period}.csv"`)
        .send(csv)
    }

    // Default: PDF (HTML)
    const html = await generatePdfReport(dateFrom, dateTo)
    return reply
      .header('Content-Type', 'text/html; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="report-${period}.html"`)
      .send(html)
  })

  // ─────────────────────────────────────────────────────────
  //  POST /compare — Compare two periods
  // ─────────────────────────────────────────────────────────
  app.post('/compare', editor, async (req, reply) => {
    const body = z.object({
      periodA: z.object({ from: z.string(), to: z.string() }),
      periodB: z.object({ from: z.string(), to: z.string() }),
    }).parse(req.body)

    const data = await generateComparisonData(
      { from: new Date(body.periodA.from), to: new Date(body.periodA.to) },
      { from: new Date(body.periodB.from), to: new Date(body.periodB.to) },
    )

    return data
  })
}
