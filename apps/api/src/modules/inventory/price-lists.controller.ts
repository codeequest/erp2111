import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('Inventory · Price lists')
@Controller('inventory/price-lists')
export class PriceListsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions('inventory.product.read')
  @ApiOperation({ summary: 'List price lists (e.g. RETAIL, WHOLESALE) with their product count' })
  async findAll() {
    const lists = await this.prisma.priceList.findMany({
      orderBy: { code: 'desc' },
      include: { _count: { select: { items: true, customers: true } } },
    });
    return lists.map(({ _count, ...l }) => ({
      ...l,
      productCount: _count.items,
      customerCount: _count.customers,
    }));
  }
}
