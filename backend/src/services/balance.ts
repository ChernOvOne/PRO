import { Decimal } from '@prisma/client/runtime/library'
import { prisma }  from '../db'
import { logger }  from '../utils/logger'
import type { BalanceTransactionType } from '@prisma/client'

class BalanceService {
  /**
   * Get user balance and recent transactions
   */
  async getBalance(userId: string) {
    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: { balance: true },
    })

    const history = await prisma.balanceTransaction.findMany({
      where:   { userId },
      orderBy: { createdAt: 'desc' },
      take:    50,
    })

    return {
      balance: user?.balance ?? new Decimal(0),
      history,
    }
  }

  /**
   * Credit user balance (positive amount)
   */
  async credit(params: {
    userId:      string
    amount:      number
    type:        BalanceTransactionType
    description?: string
    paymentId?:  string
  }) {
    if (params.amount <= 0) throw new Error('Credit amount must be positive')

    return prisma.$transaction(async (tx) => {
      const txn = await tx.balanceTransaction.create({
        data: {
          userId:      params.userId,
          amount:      params.amount,
          type:        params.type,
          description: params.description,
          paymentId:   params.paymentId,
        },
      })

      const user = await tx.user.update({
        where: { id: params.userId },
        data:  { balance: { increment: params.amount } },
      })

      logger.info(`Balance credit: +${params.amount} RUB to user ${params.userId} (${params.type})`)
      return { transaction: txn, newBalance: user.balance }
    })
  }

  /**
   * Debit user balance (negative amount internally)
   */
  async debit(params: {
    userId:      string
    amount:      number
    type:        BalanceTransactionType
    description?: string
  }) {
    if (params.amount <= 0) throw new Error('Debit amount must be positive')

    return prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where:  { id: params.userId },
        select: { balance: true },
      })

      if (!user || user.balance.toNumber() < params.amount) {
        throw new Error('Insufficient balance')
      }

      const txn = await tx.balanceTransaction.create({
        data: {
          userId:      params.userId,
          amount:      -params.amount,
          type:        params.type,
          description: params.description,
        },
      })

      const updated = await tx.user.update({
        where: { id: params.userId },
        data:  { balance: { decrement: params.amount } },
      })

      logger.info(`Balance debit: -${params.amount} RUB from user ${params.userId} (${params.type})`)
      return { transaction: txn, newBalance: updated.balance }
    })
  }

  /**
   * Admin adjustment (can be positive or negative)
   */
  async adminAdjust(params: {
    userId:      string
    amount:      number
    description?: string
  }) {
    if (params.amount === 0) throw new Error('Adjustment amount cannot be zero')

    return prisma.$transaction(async (tx) => {
      const txn = await tx.balanceTransaction.create({
        data: {
          userId:      params.userId,
          amount:      params.amount,
          type:        params.amount > 0 ? 'TOPUP' : 'PURCHASE',
          description: params.description || 'Admin adjustment',
        },
      })

      const user = params.amount > 0
        ? await tx.user.update({ where: { id: params.userId }, data: { balance: { increment: params.amount } } })
        : await tx.user.update({ where: { id: params.userId }, data: { balance: { decrement: Math.abs(params.amount) } } })

      logger.info(`Balance admin adjust: ${params.amount > 0 ? '+' : ''}${params.amount} RUB for user ${params.userId}`)
      return { transaction: txn, newBalance: user.balance }
    })
  }
}

export const balanceService = new BalanceService()
