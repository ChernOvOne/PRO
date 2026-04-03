import '@fastify/jwt'
import 'fastify'

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (
      request: FastifyRequest,
      reply:   FastifyReply,
    ) => Promise<void>

    adminOnly: (
      request: FastifyRequest,
      reply:   FastifyReply,
    ) => Promise<void>

    requireRole: (...roles: string[]) => (
      request: FastifyRequest,
      reply:   FastifyReply,
    ) => Promise<void>

    requireEditor: (
      request: FastifyRequest,
      reply:   FastifyReply,
    ) => Promise<void>

    requireStaff: (
      request: FastifyRequest,
      reply:   FastifyReply,
    ) => Promise<void>
  }

  interface FastifyRequest {
    user: JWTPayload
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JWTPayload
    user:    JWTPayload
  }
}

export interface JWTPayload {
  sub:  string   // user ID
  role: 'USER' | 'ADMIN' | 'EDITOR' | 'INVESTOR' | 'PARTNER'
  iat?: number
  exp?: number
}
