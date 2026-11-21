import { Prisma } from '@prisma/client';

/** True when the error is a unique-constraint violation (Prisma P2002). */
export function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}
