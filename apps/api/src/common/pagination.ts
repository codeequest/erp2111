import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Paginated } from '@erp/shared';

/** Query parameters accepted by every list endpoint: ?page=1&pageSize=20&search=… */
export class PaginationQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;

  @ApiPropertyOptional({ description: 'Free-text search' })
  @IsOptional()
  @IsString()
  search?: string;
}

export function pageArgs(q: PaginationQueryDto) {
  return { skip: (q.page - 1) * q.pageSize, take: q.pageSize };
}

export function paginated<T>(items: T[], total: number, q: PaginationQueryDto): Paginated<T> {
  return { items, total, page: q.page, pageSize: q.pageSize };
}
