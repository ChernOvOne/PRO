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
import { uploadRoutes }           from './upload'
import { adminPromoRoutes, userPromoRoutes } from './promo'
import { adminBotRoutes }     from './admin-bot'
import { adminBroadcastRoutes } from './admin-broadcast'

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
  await app.register(adminBroadcastRoutes,     { prefix: '/api/admin/broadcast'     })
  await app.register(uploadRoutes,             { prefix: '/api/admin'               })

  // Serve uploaded files
  app.register(import('@fastify/static'), { root: '/app/uploads', prefix: '/uploads/', decorateReply: false })
}
