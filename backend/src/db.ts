import { PrismaClient } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'

// ── Global Decimal → Number serializer ─────────────────────────
// Без этого все Prisma Decimal поля уходят в JSON как строки, а на фронте
// `total += r.amount` превращается в конкатенацию строк → астрономические числа.
// Number безопасно держит значения до 2^53 ≈ 9e15, что покрывает любые разумные суммы.
;(Decimal.prototype as any).toJSON = function () {
  return Number(this)
}

export const prisma = new PrismaClient()
