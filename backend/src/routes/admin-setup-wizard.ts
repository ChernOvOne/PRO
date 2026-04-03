import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'

export async function adminSetupWizardRoutes(app: FastifyInstance) {
  const admin = { preHandler: [app.adminOnly] }

  // ── GET /status — check if setup wizard is completed ────────
  app.get('/status', admin, async () => {
    const row = await prisma.setting.findUnique({
      where: { key: 'buh_setup_completed' },
    })
    return { completed: row?.value === '1' }
  })

  // ── POST /complete — complete the setup wizard ──────────────
  app.post('/complete', admin, async (req) => {
    const body = z
      .object({
        companyName:     z.string().min(1),
        currency:        z.string().default('RUB'),
        timezone:        z.string().default('Europe/Moscow'),
        startingBalance: z.number().default(0),
        categories: z
          .array(
            z.object({
              name:  z.string().min(1),
              color: z.string().min(1),
              icon:  z.string().optional(),
            }),
          )
          .optional(),
        partners: z
          .array(
            z.object({
              name:              z.string().min(1),
              roleLabel:         z.string().min(1),
              initialInvestment: z.number().optional(),
            }),
          )
          .optional(),
        tgBotToken:   z.string().optional(),
        tgChannelId:  z.string().optional(),
        tgAdminId:    z.string().optional(),
      })
      .parse(req.body)

    // Upsert settings
    const settings: Record<string, string> = {
      buh_company_name:     body.companyName,
      buh_currency:         body.currency,
      buh_timezone:         body.timezone,
      buh_starting_balance: String(body.startingBalance),
    }

    if (body.tgBotToken)   settings.buh_tg_bot_token   = body.tgBotToken
    if (body.tgChannelId)  settings.buh_tg_channel_id  = body.tgChannelId
    if (body.tgAdminId)    settings.buh_tg_admin_id    = body.tgAdminId

    for (const [key, value] of Object.entries(settings)) {
      await prisma.setting.upsert({
        where:  { key },
        update: { value },
        create: { key, value },
      })
    }

    // Create categories
    if (body.categories?.length) {
      for (let i = 0; i < body.categories.length; i++) {
        const cat = body.categories[i]
        await prisma.buhCategory.create({
          data: {
            name:      cat.name,
            color:     cat.color,
            icon:      cat.icon ?? null,
            sortOrder: i,
          },
        })
      }
    }

    // Create partners
    if (body.partners?.length) {
      for (const p of body.partners) {
        await prisma.buhPartner.create({
          data: {
            name:              p.name,
            roleLabel:         p.roleLabel,
            initialInvestment: p.initialInvestment ?? 0,
          },
        })
      }
    }

    // Mark setup as completed
    await prisma.setting.upsert({
      where:  { key: 'buh_setup_completed' },
      update: { value: '1' },
      create: { key: 'buh_setup_completed', value: '1' },
    })

    return { ok: true }
  })
}
