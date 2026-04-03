import type { FastifyInstance } from 'fastify'
import { authRoutes }             from './auth'
import { tmaAuthRoute }           from './tma-auth'
import { userRoutes }             from './users'
import { tariffRoutes }           from './tariffs'
import { paymentRoutes }          from './payments'
import { webhookRoutes }          from './webhooks'
import { adminRoutes }            from './admin'
import { adminImportRoutes }      from './admin-import'
import { publicRoutes }           from './public'
import { instructionRoutes, adminInstructionRoutes } from './instructions'
import { newsRoutes, adminNewsRoutes }               from './news'
import { notificationRoutes, adminNotificationRoutes } from './notifications'
import { proxyRoutes, adminProxyRoutes }             from './proxies'
import { giftRoutes }             from './gifts'
import { verificationRoutes }     from './verification'
import { adminLandingRoutes }     from './admin-landing'
import { adminReportsExportRoutes } from './admin-reports-export'
import { uploadRoutes }           from './upload'
import { adminPromoRoutes, userPromoRoutes } from './promo'
import { adminBotRoutes }     from './admin-bot'
import { adminBotBlockRoutes } from './admin-bot-blocks'
import { adminBroadcastRoutes } from './admin-broadcast'
import { adminFunnelRoutes }    from './admin-funnels'
import { adminPartnerRoutes }       from './admin-partners'
import { adminInkasRoutes }        from './admin-inkas'
import { adminTransactionRoutes }  from './admin-transactions'
import { adminCategoryRoutes }     from './admin-categories'
import { adminInfrastructureRoutes } from './admin-infrastructure'
import { adminAdsRoutes }          from './admin-ads'
import { adminRecurringRoutes }    from './admin-recurring'
import { adminBuhDashboardRoutes } from './admin-buh-dashboard'
import { adminMilestoneRoutes }    from './admin-milestones'
import { adminMonthlyStatsRoutes } from './admin-monthly-stats'
import { adminUtmRoutes }          from './admin-utm'
import { adminAuditRoutes }        from './admin-audit'
import { adminChannelRoutes }      from './admin-channels'
import { adminWebhookKeyRoutes }   from './admin-webhook-keys'
import { buhWebhookPaymentRoutes } from './buh-webhook-payment'
import { buhUtmPublicRoutes }      from './buh-utm-public'
import { adminSetupWizardRoutes }  from './admin-setup-wizard'

export async function registerRoutes(app: FastifyInstance) {
  app.get('/health', async () => ({
    status:    'ok',
    version:   process.env.npm_package_version ?? '1.0.0',
    timestamp: new Date().toISOString(),
    uptime:    Math.floor(process.uptime()),
  }))

  // Public
  await app.register(publicRoutes,             { prefix: '/api/public'              })
  await app.register(newsRoutes,               { prefix: '/api/news'                })

  // Auth
  await app.register(authRoutes,               { prefix: '/api/auth'                })
  await app.register(tmaAuthRoute,             { prefix: '/api/auth'                })
  await app.register(verificationRoutes,       { prefix: '/api/verification'        })

  // User
  await app.register(userRoutes,               { prefix: '/api/user'                })
  await app.register(tariffRoutes,             { prefix: '/api/tariffs'             })
  await app.register(paymentRoutes,            { prefix: '/api/payments'            })
  await app.register(notificationRoutes,       { prefix: '/api/notifications'       })
  await app.register(proxyRoutes,              { prefix: '/api/proxies'             })
  await app.register(giftRoutes,               { prefix: '/api/gifts'               })
  await app.register(userPromoRoutes,          { prefix: '/api/user/promo'          })
  await app.register(instructionRoutes,        { prefix: '/api/instructions'        })

  // Webhooks
  await app.register(webhookRoutes,            { prefix: '/api/webhooks'            })

  // Admin
  await app.register(adminRoutes,              { prefix: '/api/admin'               })
  await app.register(adminImportRoutes,        { prefix: '/api/admin/import'        })
  await app.register(adminInstructionRoutes,   { prefix: '/api/admin/instructions'  })
  await app.register(adminNewsRoutes,          { prefix: '/api/admin/news'          })
  await app.register(adminNotificationRoutes,  { prefix: '/api/admin/notifications' })
  await app.register(adminProxyRoutes,         { prefix: '/api/admin/proxies'       })
  await app.register(adminLandingRoutes,       { prefix: '/api/admin/landing'       })
  await app.register(adminPromoRoutes,         { prefix: '/api/admin/promos'        })
  await app.register(adminBotRoutes,            { prefix: '/api/admin/bot'           })
  await app.register(adminBotBlockRoutes,      { prefix: '/api/admin/bot-blocks'    })
  await app.register(adminBroadcastRoutes,     { prefix: '/api/admin/broadcast'     })
  await app.register(adminFunnelRoutes,        { prefix: '/api/admin/communications'})
  await app.register(adminPartnerRoutes,       { prefix: '/api/admin/partners'      })
  await app.register(adminInkasRoutes,         { prefix: '/api/admin/inkas'          })
  await app.register(adminTransactionRoutes,   { prefix: '/api/admin/transactions'   })
  await app.register(adminCategoryRoutes,      { prefix: '/api/admin/categories'     })
  await app.register(adminInfrastructureRoutes, { prefix: '/api/admin/infrastructure' })
  await app.register(adminAdsRoutes,           { prefix: '/api/admin/ads'            })
  await app.register(adminRecurringRoutes,     { prefix: '/api/admin/recurring'      })
  await app.register(adminBuhDashboardRoutes,  { prefix: '/api/admin/buh-dashboard'  })
  await app.register(adminMilestoneRoutes,     { prefix: '/api/admin/milestones'     })
  await app.register(adminMonthlyStatsRoutes,  { prefix: '/api/admin/monthly-stats'  })
  await app.register(adminUtmRoutes,           { prefix: '/api/admin/utm'            })
  await app.register(adminAuditRoutes,         { prefix: '/api/admin/audit'          })
  await app.register(adminChannelRoutes,       { prefix: '/api/admin/channels'       })
  await app.register(adminWebhookKeyRoutes,    { prefix: '/api/admin/webhook-keys'   })
  await app.register(adminSetupWizardRoutes,   { prefix: '/api/admin/setup-wizard'    })
  await app.register(adminReportsExportRoutes, { prefix: '/api/admin/reports'         })
  await app.register(uploadRoutes,             { prefix: '/api/admin'                })

  // Buhgalteria public routes (no auth)
  await app.register(buhUtmPublicRoutes,       { prefix: '/'                         })
  await app.register(buhWebhookPaymentRoutes,  { prefix: '/api/webhooks/payment-ingest' })

  // Serve uploaded files
  app.register(import('@fastify/static'), { root: '/app/uploads', prefix: '/uploads/', decorateReply: false })
}
