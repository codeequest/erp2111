import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Sales business logic.
 * TODO: implement. Remember:
 *  - wrap every operation that touches stock or money in this.prisma.$transaction(...)
 *  - write an AuditLog row for every create / update / status change
 *  - NEVER write stock tables: call StockFlowsService (exported by InventoryModule)
 *    with the same tx — see inventory/stock/stock-flows.service.ts for which call
 *    goes with which business event (receive, reserveOrder, deliver, ...)
 */
@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}
}
