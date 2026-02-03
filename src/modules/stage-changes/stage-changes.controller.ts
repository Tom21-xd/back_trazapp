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
import { CurrentUser, Roles } from '../../common/decorators';
import { Role, StageChangeStatus } from '@prisma/client';

@ApiTags('stage-changes')
@ApiBearerAuth('JWT-auth')
@Controller('stage-changes')
export class StageChangesController {
  constructor(private readonly stageChangesService: StageChangesService) {}

  @Post()
  @ApiOperation({ summary: 'Crear solicitud de cambio de etapa' })
  @ApiResponse({ status: 201, description: 'Solicitud creada exitosamente' })
  @ApiResponse({ status: 404, description: 'Actividad o etapa no encontrada' })
  @ApiResponse({ status: 400, description: 'La actividad ya está en la etapa solicitada' })
  createRequest(
    @Body() dto: CreateStageChangeRequestDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.stageChangesService.createRequest(dto, userId);
  }

  @Get()
  @ApiOperation({ summary: 'Obtener todas las solicitudes de cambio' })
  @ApiQuery({ name: 'activityId', required: false, description: 'Filtrar por actividad' })
  @ApiQuery({ name: 'status', required: false, enum: StageChangeStatus, description: 'Filtrar por estado' })
  @ApiResponse({ status: 200, description: 'Lista de solicitudes' })
  findAll(
    @Query('activityId') activityId?: string,
    @Query('status') status?: StageChangeStatus,
  ) {
    return this.stageChangesService.findAll({ activityId, status });
  }

  @Get('pending')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Obtener solicitudes pendientes' })
  @ApiResponse({ status: 200, description: 'Lista de solicitudes pendientes' })
  @ApiResponse({ status: 403, description: 'No autorizado' })
  getPending() {
    return this.stageChangesService.getPendingRequests();
  }

  @Get('my-requests')
  @ApiOperation({ summary: 'Obtener mis solicitudes' })
  @ApiResponse({ status: 200, description: 'Lista de solicitudes del usuario' })
  getMyRequests(@CurrentUser('id') userId: string) {
    return this.stageChangesService.getMyRequests(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener solicitud por ID' })
  @ApiParam({ name: 'id', description: 'ID de la solicitud' })
  @ApiResponse({ status: 200, description: 'Solicitud encontrada' })
  @ApiResponse({ status: 404, description: 'Solicitud no encontrada' })
  findOne(@Param('id') id: string) {
    return this.stageChangesService.findOne(id);
  }

  @Patch(':id/review')
  @Roles(Role.ADMIN)
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
  @ApiOperation({ summary: 'Agregar comentario a la solicitud' })
  @ApiParam({ name: 'id', description: 'ID de la solicitud' })
  @ApiResponse({ status: 201, description: 'Comentario agregado exitosamente' })
  @ApiResponse({ status: 404, description: 'Solicitud no encontrada' })
  addComment(
    @Param('id') requestId: string,
    @Body() dto: AddCommentDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.stageChangesService.addComment(requestId, dto, userId);
  }
}
