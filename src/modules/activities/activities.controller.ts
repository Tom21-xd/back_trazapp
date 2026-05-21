import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { ActivitiesService } from './activities.service';
import {
  CreateActivityDto,
  UpdateActivityDto,
  AssignUsersDto,
} from './dto';
import {
  CurrentUser,
  RequirePermissions,
  RequireAnyPermission,
} from '../../common/decorators';

type AuthUser = { id: string; permissions: string[] };

@ApiTags('activities')
@ApiBearerAuth('JWT-auth')
@Controller('activities')
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  @Post()
  @RequirePermissions('activity:create')
  @ApiOperation({ summary: 'Crear nueva actividad' })
  @ApiResponse({ status: 201, description: 'Actividad creada exitosamente' })
  @ApiResponse({ status: 404, description: 'Proyecto o etapa no encontrada' })
  @ApiResponse({ status: 403, description: 'No autorizado' })
  create(
    @Body() dto: CreateActivityDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.activitiesService.create(dto, userId);
  }

  @Get()
  @RequireAnyPermission('activity:read:own', 'activity:read:any')
  @ApiOperation({ summary: 'Obtener todas las actividades' })
  @ApiQuery({ name: 'projectId', required: false, description: 'Filtrar por proyecto' })
  @ApiQuery({ name: 'stageId', required: false, description: 'Filtrar por etapa' })
  @ApiQuery({ name: 'assignedUserId', required: false, description: 'Filtrar por usuario asignado' })
  @ApiQuery({ name: 'priority', required: false, description: 'Filtrar por prioridad (ALTA, MEDIA, BAJA)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'all', required: false, description: 'true: sin paginar' })
  @ApiResponse({ status: 200, description: 'Lista paginada de actividades' })
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('projectId') projectId?: string,
    @Query('stageId') stageId?: string,
    @Query('assignedUserId') assignedUserId?: string,
    @Query('priority') priority?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('all') all?: string,
  ) {
    return this.activitiesService.findAll(
      { projectId, stageId, assignedUserId, priority },
      { page, limit, all },
      user,
    );
  }

  @Get('my-activities')
  @RequireAnyPermission('activity:read:own', 'activity:read:any')
  @ApiOperation({ summary: 'Obtener mis actividades asignadas (paginado)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'all', required: false, description: 'true: sin paginar' })
  @ApiResponse({ status: 200, description: 'Lista paginada de actividades asignadas' })
  getMyActivities(
    @CurrentUser('id') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('all') all?: string,
  ) {
    return this.activitiesService.getMyActivities(userId, { page, limit, all });
  }

  @Get(':id')
  @RequireAnyPermission('activity:read:own', 'activity:read:any')
  @ApiOperation({ summary: 'Obtener actividad por ID' })
  @ApiParam({ name: 'id', description: 'ID de la actividad' })
  @ApiResponse({ status: 200, description: 'Actividad encontrada' })
  @ApiResponse({ status: 404, description: 'Actividad no encontrada' })
  @ApiResponse({ status: 403, description: 'Sin acceso a esta actividad' })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.activitiesService.findOneScoped(id, user);
  }

  @Patch(':id')
  @RequirePermissions('activity:update')
  @ApiOperation({ summary: 'Actualizar actividad' })
  @ApiParam({ name: 'id', description: 'ID de la actividad' })
  @ApiResponse({ status: 200, description: 'Actividad actualizada' })
  @ApiResponse({ status: 404, description: 'Actividad no encontrada' })
  @ApiResponse({ status: 403, description: 'No autorizado' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateActivityDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.activitiesService.update(id, dto, userId);
  }

  @Delete(':id')
  @RequirePermissions('activity:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Archivar actividad (soft-delete con trazabilidad)' })
  @ApiParam({ name: 'id', description: 'ID de la actividad' })
  @ApiResponse({ status: 204, description: 'Actividad archivada' })
  @ApiResponse({ status: 404, description: 'Actividad no encontrada' })
  @ApiResponse({ status: 400, description: 'Tiene dependencias activas' })
  @ApiResponse({ status: 403, description: 'No autorizado' })
  remove(@Param('id') id: string, @CurrentUser('id') actorId: string) {
    return this.activitiesService.remove(id, actorId);
  }

  @Post(':id/assign')
  @RequirePermissions('activity:assign')
  @ApiOperation({ summary: 'Asignar usuarios a la actividad' })
  @ApiParam({ name: 'id', description: 'ID de la actividad' })
  @ApiResponse({ status: 200, description: 'Usuarios asignados exitosamente' })
  @ApiResponse({ status: 404, description: 'Actividad no encontrada' })
  @ApiResponse({ status: 403, description: 'No autorizado' })
  assignUsers(
    @Param('id') id: string,
    @Body() dto: AssignUsersDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.activitiesService.assignUsers(id, dto, actorId);
  }

  @Delete(':id/unassign/:userId')
  @RequirePermissions('activity:assign')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Desasignar usuario de la actividad' })
  @ApiParam({ name: 'id', description: 'ID de la actividad' })
  @ApiParam({ name: 'userId', description: 'ID del usuario a desasignar' })
  @ApiResponse({ status: 204, description: 'Usuario desasignado' })
  @ApiResponse({ status: 404, description: 'Actividad o asignación no encontrada' })
  @ApiResponse({ status: 403, description: 'No autorizado' })
  unassignUser(
    @Param('id') activityId: string,
    @Param('userId') userId: string,
    @CurrentUser('id') actorId: string,
  ) {
    return this.activitiesService.unassignUser(activityId, userId, actorId);
  }

  @Get(':id/events')
  @RequireAnyPermission('activity:read:own', 'activity:read:any')
  @ApiOperation({ summary: 'Timeline / trazabilidad de la actividad' })
  @ApiParam({ name: 'id', description: 'ID de la actividad' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'all', required: false, description: 'true: sin paginar' })
  @ApiResponse({ status: 200, description: 'Lista paginada de eventos (más recientes primero)' })
  @ApiResponse({ status: 403, description: 'Sin acceso a esta actividad' })
  listEvents(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('all') all?: string,
  ) {
    return this.activitiesService.listEvents(id, user, { page, limit, all });
  }
}
