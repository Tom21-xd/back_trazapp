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
import { CurrentUser, Roles } from '../../common/decorators';
import { Role } from '@prisma/client';

@ApiTags('activities')
@ApiBearerAuth('JWT-auth')
@Controller('activities')
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  @Post()
  @Roles(Role.ADMIN)
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
  @ApiOperation({ summary: 'Obtener todas las actividades' })
  @ApiQuery({ name: 'projectId', required: false, description: 'Filtrar por proyecto' })
  @ApiQuery({ name: 'stageId', required: false, description: 'Filtrar por etapa' })
  @ApiQuery({ name: 'assignedUserId', required: false, description: 'Filtrar por usuario asignado' })
  @ApiQuery({ name: 'priority', required: false, description: 'Filtrar por prioridad (ALTA, MEDIA, BAJA)' })
  @ApiResponse({ status: 200, description: 'Lista de actividades' })
  findAll(
    @Query('projectId') projectId?: string,
    @Query('stageId') stageId?: string,
    @Query('assignedUserId') assignedUserId?: string,
    @Query('priority') priority?: string,
  ) {
    return this.activitiesService.findAll({
      projectId,
      stageId,
      assignedUserId,
      priority,
    });
  }

  @Get('my-activities')
  @ApiOperation({ summary: 'Obtener mis actividades asignadas' })
  @ApiResponse({ status: 200, description: 'Lista de actividades asignadas al usuario' })
  getMyActivities(@CurrentUser('id') userId: string) {
    return this.activitiesService.getMyActivities(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener actividad por ID' })
  @ApiParam({ name: 'id', description: 'ID de la actividad' })
  @ApiResponse({ status: 200, description: 'Actividad encontrada' })
  @ApiResponse({ status: 404, description: 'Actividad no encontrada' })
  findOne(@Param('id') id: string) {
    return this.activitiesService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Actualizar actividad' })
  @ApiParam({ name: 'id', description: 'ID de la actividad' })
  @ApiResponse({ status: 200, description: 'Actividad actualizada' })
  @ApiResponse({ status: 404, description: 'Actividad no encontrada' })
  @ApiResponse({ status: 403, description: 'No autorizado' })
  update(@Param('id') id: string, @Body() dto: UpdateActivityDto) {
    return this.activitiesService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar actividad' })
  @ApiParam({ name: 'id', description: 'ID de la actividad' })
  @ApiResponse({ status: 204, description: 'Actividad eliminada' })
  @ApiResponse({ status: 404, description: 'Actividad no encontrada' })
  @ApiResponse({ status: 403, description: 'No autorizado' })
  remove(@Param('id') id: string) {
    return this.activitiesService.remove(id);
  }

  @Post(':id/assign')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Asignar usuarios a la actividad' })
  @ApiParam({ name: 'id', description: 'ID de la actividad' })
  @ApiResponse({ status: 200, description: 'Usuarios asignados exitosamente' })
  @ApiResponse({ status: 404, description: 'Actividad no encontrada' })
  @ApiResponse({ status: 403, description: 'No autorizado' })
  assignUsers(@Param('id') id: string, @Body() dto: AssignUsersDto) {
    return this.activitiesService.assignUsers(id, dto);
  }

  @Delete(':id/unassign/:userId')
  @Roles(Role.ADMIN)
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
  ) {
    return this.activitiesService.unassignUser(activityId, userId);
  }
}
