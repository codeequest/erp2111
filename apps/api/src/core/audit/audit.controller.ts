import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { notImplemented } from '../../common/not-implemented';
import { AuditService } from './audit.service';

/**
 * SKELETON — every endpoint answers 501 Not Implemented.
 * Routes and permissions are final; replace notImplemented(...) with calls to
 * AuditService and add DTOs (class-validator) for request bodies.
 */
@ApiTags('Admin · Audit log')
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @RequirePermissions('admin.audit.read')
  @ApiOperation({ summary: 'Search the audit log (filter by user, entity, date)' })
  findAll() {
    return notImplemented('Admin · Audit log: Search the audit log (filter by user, entity, date)');
  }
}
