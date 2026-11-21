import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Either the Prisma client or the client handed to a `$transaction(async (tx) => …)`
 * callback. Helpers that must run inside the caller's transaction (audit log,
 * document numbering, stock moves) accept this type.
 */
export type Db = PrismaClient | Prisma.TransactionClient;
