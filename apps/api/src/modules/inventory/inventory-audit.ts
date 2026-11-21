import { Prisma } from '@prisma/client';

/** Converts Decimals and Dates to plain JSON so the snapshot fits in AuditLog.before/after. */
export function snapshot(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/** Name of the field behind a unique-constraint violation, or null if it is not one. */
export function uniqueViolationField(err: unknown): string | null {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    const target = err.meta?.target;
    if (Array.isArray(target)) return String(target[0]);
    if (typeof target === 'string') return target;
    return 'value';
  }
  return null;
}
