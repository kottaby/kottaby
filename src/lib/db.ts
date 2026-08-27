import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Detect a stale cached client (e.g. after a schema migration adds new models)
// so we don't reuse a PrismaClient that's missing the new model accessors.
function isStaleClient(client: PrismaClient | undefined): boolean {
  if (!client) return true
  // `booking` was added in a later migration — if it's missing, the client is stale.
  return typeof (client as Record<string, unknown>).booking === 'undefined'
}

export const db =
  globalForPrisma.prisma && !isStaleClient(globalForPrisma.prisma)
    ? globalForPrisma.prisma
    : new PrismaClient({
        log: ['query'],
      })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
