import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { verificationService } from '../services/verification'

export async function verificationRoutes(app: FastifyInstance) {
  // Send verification code
  app.post('/send-code', async (req, reply) => {
    const schema = z.object({
      email:   z.string().email(),
      purpose: z.enum(['REGISTRATION', 'EMAIL_CHANGE', 'PASSWORD_RESET']),
    })
    const { email, purpose } = schema.parse(req.body)

    // For EMAIL_CHANGE, require authentication
    let userId: string | undefined
    if (purpose === 'EMAIL_CHANGE') {
      try {
        await app.authenticate(req, reply)
        userId = (req.user as any).sub
      } catch {
        return reply.status(401).send({ error: 'Authentication required' })
      }
    }

    try {
      const result = await verificationService.sendCode({ email, type: purpose, userId })
      return result
    } catch (err: any) {
      return reply.status(429).send({ error: err.message })
    }
  })

  // Verify code
  app.post('/verify-code', async (req, reply) => {
    const schema = z.object({
      email:   z.string().email(),
      code:    z.string().length(6),
      purpose: z.enum(['REGISTRATION', 'EMAIL_CHANGE', 'PASSWORD_RESET']),
    })
    const data = schema.parse(req.body)

    const valid = await verificationService.verifyCode({
      email: data.email,
      code:  data.code,
      type:  data.purpose,
    })

    if (!valid) {
      return reply.status(400).send({ error: 'Неверный или просроченный код' })
    }

    return { ok: true, verified: true }
  })
}
