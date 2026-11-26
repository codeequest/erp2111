import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditEntryDto, Page } from '@erp/shared';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuditService } from './audit.service';
import { AuditQueryDto } from './dto/audit-query.dto';

@ApiTags('Admin · Audit log')
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions('admin.audit.read')
  @ApiOperation({ summary: 'Search the audit log, newest first' })
  search(@Query() q: AuditQueryDto): Promise<Page<AuditEntryDto>> {
    return this.audit.search(q);
  }

  @Get('actions')
  @RequirePermissions('admin.audit.read')
  @ApiOperation({ summary: 'Every action name that appears in the log (for the filter)' })
  actions(): Promise<string[]> {
    return this.audit.actions();
  }

  @Get(':id')
  @RequirePermissions('admin.audit.read')
  @ApiOperation({ summary: 'One audit entry with its before/after values' })
  one(@Param('id') id: string): Promise<AuditEntryDto> {
    return this.audit.one(id);
  }
}
