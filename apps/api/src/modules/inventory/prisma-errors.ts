import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

const FIELD_LABELS: Record<string, string> = {
  sku: 'SKU',
  barcode: 'barcode',
  code: 'code',
  name: 'name',
};

/**
 * Turns the Prisma errors a user can actually cause into clean HTTP errors:
 *  - P2002 unique violation      -> 409 "A product with this SKU already exists"
 *  - P2003 foreign key violation -> 400 "Unknown category / unit / tax rate"
 *  - P2025 record not found      -> 404
 * Anything else is re-thrown unchanged (500).
 */
export function rethrowPrismaError(err: unknown, entity: string): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = err.meta?.target;
      const fields = (Array.isArray(target) ? target : [String(target ?? '')]).filter(
        (f) => f !== 'parent_id' && f !== 'parentId',
      );
      const label = fields.map((f) => FIELD_LABELS[f] ?? f).join(' / ') || 'value';
      throw new ConflictException(`A ${entity.toLowerCase()} with this ${label} already exists`);
    }
    if (err.code === 'P2003') {
      const field = String(err.meta?.field_name ?? '');
      const what = field.includes('category')
        ? 'category'
        : field.includes('unit')
          ? 'unit'
          : field.includes('tax')
            ? 'tax rate'
            : field.includes('parent')
              ? 'parent category'
              : 'reference';
      throw new BadRequestException(`Unknown ${what}`);
    }
    if (err.code === 'P2025') {
      throw new NotFoundException(`${entity} not found`);
    }
  }
  throw err;
}

/** Plain JSON copy for AuditLog.before / after (Decimals become strings). */
export function toAuditJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
