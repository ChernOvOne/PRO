import { randomInt }    from 'crypto'
import { prisma }       from '../db'
import { config }       from '../config'
import { emailService } from './email'
import { logger }       from '../utils/logger'
import type { EmailVerificationType } from '@prisma/client'

class VerificationService {
  /**
   * Generate and send a 6-digit verification code
   */
  async sendCode(params: {
    email:   string
    type:    EmailVerificationType
    userId?: string
  }): Promise<{ ok: boolean; expiresIn: number }> {
    const { email, type, userId } = params

    // Rate limit: 1 code per email per 60s
    const recent = await prisma.emailVerification.findFirst({
      where: {
        email,
        type,
        createdAt: { gt: new Date(Date.now() - 60_000) },
      },
    })
    if (recent) {
      throw new Error('Подождите минуту перед повторной отправкой кода')
    }

    // CSPRNG — Math.random's state is recoverable from a few outputs,
    // making 6-digit codes predictable for password reset / email change.
    const code = String(randomInt(100000, 1000000))
    const ttl  = config.verification.codeTtl

    await prisma.emailVerification.create({
      data: {
        email,
        code,
        type,
        userId,
        expiresAt: new Date(Date.now() + ttl * 1000),
      },
    })

    // Send email
    const subjectMap: Record<EmailVerificationType, string> = {
      REGISTRATION:   'Подтверждение регистрации — HIDEYOU VPN',
      EMAIL_CHANGE:   'Подтверждение смены email — HIDEYOU VPN',
      PASSWORD_RESET: 'Сброс пароля — HIDEYOU VPN',
    }

    await emailService.sendVerificationCode(email, code, subjectMap[type])

    logger.info(`Verification code sent to ${email} (${type})`)
    return { ok: true, expiresIn: ttl }
  }

  /**
   * Verify a code
   */
  async verifyCode(params: {
    email: string
    code:  string
    type:  EmailVerificationType
  }): Promise<boolean> {
    const record = await prisma.emailVerification.findFirst({
      where: {
        email:      params.email,
        code:       params.code,
        type:       params.type,
        verifiedAt: null,
        expiresAt:  { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    })

    if (!record) return false

    await prisma.emailVerification.update({
      where: { id: record.id },
      data:  { verifiedAt: new Date() },
    })

    return true
  }

  /**
   * Check if email was recently verified (within TTL)
   */
  async isRecentlyVerified(email: string, type: EmailVerificationType): Promise<boolean> {
    const record = await prisma.emailVerification.findFirst({
      where: {
        email,
        type,
        verifiedAt: { not: null },
        createdAt:  { gt: new Date(Date.now() - config.verification.codeTtl * 1000) },
      },
    })
    return !!record
  }

  /**
   * Cleanup expired verification records
   */
  async cleanupExpired(): Promise<number> {
    const result = await prisma.emailVerification.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    })
    if (result.count > 0) {
      logger.info(`Cleaned up ${result.count} expired verification codes`)
    }
    return result.count
  }
}

export const verificationService = new VerificationService()
