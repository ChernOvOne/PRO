import { prisma } from '../db'

/**
 * Log an action to the audit trail.
 * Fire-and-forget — does not throw on failure.
 */
export async function logAudit(params: {
  userId?: string
  action: 'create' | 'update' | 'delete'
  entity: string
  entityId?: string
  oldData?: any
  newData?: any
  ipAddress?: string
}): Promise<void> {
  try {
    await prisma.buhAuditLog.create({
      data: {
        userId:    params.userId ?? null,
        action:    params.action,
        entity:    params.entity,
        entityId:  params.entityId ?? null,
        oldData:   params.oldData ?? undefined,
        newData:   params.newData ?? undefined,
        ipAddress: params.ipAddress ?? null,
      },
    })
  } catch {
    // Audit logging should never break the main flow
  }
}
