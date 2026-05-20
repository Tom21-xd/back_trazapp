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
import { CommentsService } from './comments.service';
import { CreateCommentDto, UpdateCommentDto } from './dto';
import {
  CurrentUser,
  RequirePermissions,
  RequireAnyPermission,
} from '../../common/decorators';

@ApiTags('comments')
@ApiBearerAuth('JWT-auth')
@Controller('comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Post()
  @RequirePermissions('comment:create')
  @ApiOperation({ summary: 'Crear nuevo comentario' })
  @ApiResponse({ status: 201, description: 'Comentario creado exitosamente' })
  @ApiResponse({ status: 404, description: 'Actividad no encontrada' })
  create(
    @Body() dto: CreateCommentDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.commentsService.create(dto, userId);
  }

  @Get()
  @ApiOperation({ summary: 'Obtener comentarios de una actividad (paginado)' })
  @ApiQuery({ name: 'activityId', required: true, description: 'ID de la actividad' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'all', required: false, description: 'true: sin paginar' })
  @ApiResponse({ status: 200, description: 'Lista paginada de comentarios' })
  findByActivity(
    @Query('activityId') activityId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('all') all?: string,
  ) {
    return this.commentsService.findByActivity(activityId, {
      page,
      limit,
      all,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener comentario por ID' })
  @ApiParam({ name: 'id', description: 'ID del comentario' })
  @ApiResponse({ status: 200, description: 'Comentario encontrado' })
  @ApiResponse({ status: 404, description: 'Comentario no encontrado' })
  findOne(@Param('id') id: string) {
    return this.commentsService.findOne(id);
  }

  @Patch(':id')
  @RequireAnyPermission('comment:update:own', 'comment:update:any')
  @ApiOperation({ summary: 'Actualizar comentario' })
  @ApiParam({ name: 'id', description: 'ID del comentario' })
  @ApiResponse({ status: 200, description: 'Comentario actualizado' })
  @ApiResponse({ status: 404, description: 'Comentario no encontrado' })
  @ApiResponse({ status: 403, description: 'No tienes permisos para editar este comentario' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCommentDto,
    @CurrentUser() user: { id: string; permissions: string[] },
  ) {
    return this.commentsService.update(id, dto, user);
  }

  @Delete(':id')
  @RequireAnyPermission('comment:delete:own', 'comment:delete:any')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar comentario' })
  @ApiParam({ name: 'id', description: 'ID del comentario' })
  @ApiResponse({ status: 204, description: 'Comentario eliminado' })
  @ApiResponse({ status: 404, description: 'Comentario no encontrado' })
  @ApiResponse({ status: 403, description: 'No tienes permisos para eliminar este comentario' })
  remove(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; permissions: string[] },
  ) {
    return this.commentsService.remove(id, user);
  }
}
