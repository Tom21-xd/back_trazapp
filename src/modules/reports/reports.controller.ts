import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { RequirePermissions } from '../../common/decorators';

@ApiTags('reports')
@ApiBearerAuth('JWT-auth')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('stage-metrics')
  @RequirePermissions('activity:read:any')
  @ApiOperation({
    summary: 'Métricas de tiempo por etapa (global o por proyecto)',
  })
  @ApiQuery({
    name: 'projectId',
    required: false,
    description: 'Filtrar por un proyecto específico',
  })
  @ApiResponse({ status: 200, description: 'Métricas por etapa' })
  @ApiResponse({ status: 403, description: 'No autorizado' })
  stageMetrics(@Query('projectId') projectId?: string) {
    return this.reportsService.stageMetrics(projectId || undefined);
  }
}
