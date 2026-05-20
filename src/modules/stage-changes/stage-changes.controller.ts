import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { StageChangesService } from './stage-changes.service';
import {
  CreateStageChangeRequestDto,
  ReviewStageChangeDto,
  AddCommentDto,
} from './dto';
import {
  CurrentUser,
  RequirePermissions,
  RequireAnyPermission,
} from '../../common/decorators';
import { StageChangeStatus } from '@prisma/client';

type AuthUser = { id: string; permissions: string[] };

@ApiTags('stage-changes')
@ApiBearerAuth('JWT-auth')
@Controller('stage-changes')
export class StageChangesController {
  constructor(private readonly stageChangesService: StageChangesService) {}

  @Post()
  @RequirePermissions('stagechange:create')
  @ApiOperation({ summary: 'Crear solicitud de cambio de etapa' })
  @ApiResponse({ status: 201, description: 'Solicitud creada exitosamente' })
  @ApiResponse({ status: 404, description: 'Actividad o etapa no encontrada' })
  @ApiResponse({ status: 400, description: 'La actividad ya está en la etapa solicitada' })
  createRequest(
    @Body() dto: CreateStageChangeRequestDto,
    @CurrentUser() user: { id: string; permissions: string[] },
  ) {
    return this.stageChangesService.createRequest(dto, user);
  }

  @Get()
  @RequireAnyPermission('stagechange:read:own', 'stagechange:read:any')
  @ApiOperation({ summary: 'Obtener todas las solicitudes de cambio' })
  @ApiQuery({ name: 'activityId', required: false, description: 'Filtrar por actividad' })
  @ApiQuery({ name: 'status', required: false, enum: StageChangeStatus, description: 'Filtrar por estado' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'all', required: false, description: 'true: sin paginar' })
  @ApiResponse({ status: 200, description: 'Lista paginada de solicitudes' })
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('activityId') activityId?: string,
    @Query('status') status?: StageChangeStatus,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('all') all?: string,
  ) {
    return this.stageChangesService.findAll(
      { activityId, status },
      { page, limit, all },
      user,
    );
  }

  @Get('pending')
  @RequireAnyPermission('stagechange:read:any', 'stagechange:review')
  @ApiOperation({ summary: 'Obtener solicitudes pendientes (paginado)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'all', required: false, description: 'true: sin paginar' })
  @ApiResponse({ status: 200, description: 'Lista paginada de solicitudes pendientes' })
  @ApiResponse({ status: 403, description: 'No autorizado' })
  getPending(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('all') all?: string,
  ) {
    return this.stageChangesService.getPendingRequests({ page, limit, all });
  }

  @Get('my-requests')
  @RequireAnyPermission('stagechange:read:own', 'stagechange:read:any')
  @ApiOperation({ summary: 'Obtener mis solicitudes (paginado)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'all', required: false, description: 'true: sin paginar' })
  @ApiResponse({ status: 200, description: 'Lista paginada de solicitudes del usuario' })
  getMyRequests(
    @CurrentUser('id') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('all') all?: string,
  ) {
    return this.stageChangesService.getMyRequests(userId, {
      page,
      limit,
      all,
    });
  }

  @Get(':id')
  @RequireAnyPermission('stagechange:read:own', 'stagechange:read:any')
  @ApiOperation({ summary: 'Obtener solicitud por ID' })
  @ApiParam({ name: 'id', description: 'ID de la solicitud' })
  @ApiResponse({ status: 200, description: 'Solicitud encontrada' })
  @ApiResponse({ status: 404, description: 'Solicitud no encontrada' })
  findOne(@Param('id') id: string) {
    return this.stageChangesService.findOne(id);
  }

  @Patch(':id/review')
  @RequirePermissions('stagechange:review')
  @ApiOperation({ summary: 'Revisar solicitud de cambio (aprobar/rechazar)' })
  @ApiParam({ name: 'id', description: 'ID de la solicitud' })
  @ApiResponse({ status: 200, description: 'Solicitud revisada exitosamente' })
  @ApiResponse({ status: 404, description: 'Solicitud no encontrada' })
  @ApiResponse({ status: 400, description: 'La solicitud ya fue revisada' })
  @ApiResponse({ status: 403, description: 'No autorizado' })
  review(
    @Param('id') id: string,
    @Body() dto: ReviewStageChangeDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.stageChangesService.reviewRequest(id, dto, userId);
  }

  @Post(':id/comments')
  @RequirePermissions('stagechange:comment')
  @ApiOperation({ summary: 'Agregar comentario a la solicitud' })
  @ApiParam({ name: 'id', description: 'ID de la solicitud' })
  @ApiResponse({ status: 201, description: 'Comentario agregado exitosamente' })
  @ApiResponse({ status: 404, description: 'Solicitud no encontrada' })
  addComment(
    @Param('id') requestId: string,
    @Body() dto: AddCommentDto,
    @CurrentUser() user: { id: string; permissions: string[] },
  ) {
    return this.stageChangesService.addComment(requestId, dto, user);
  }
}
