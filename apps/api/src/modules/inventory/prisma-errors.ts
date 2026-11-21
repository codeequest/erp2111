import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/** Turns common Prisma errors into readable 400 / 409 responses. Re-throws anything else. */
export function rethrowPrismaError(e: unknown): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === 'P2002') {
      const target = (e.meta?.target as string[] | string | undefined) ?? 'value';
      const field = Array.isArray(target) ? target.join(', ') : target;
      throw new ConflictException(`This ${field.replace(/_/g, ' ')} is already used`);
    }
    if (e.code === 'P2003') {
      throw new BadRequestException('A referenced record (category, unit or tax rate) does not exist');
    }
    if (e.code === 'P2025') {
      throw new BadRequestException('Record not found');
    }
  }
  throw e;
}
