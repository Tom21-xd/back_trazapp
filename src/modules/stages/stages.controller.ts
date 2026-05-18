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
  ApiBody,
} from '@nestjs/swagger';
import { StagesService } from './stages.service';
import { CreateStageDto, UpdateStageDto } from './dto';
import { Roles } from '../../common/decorators';
import { Role } from '@prisma/client';

@ApiTags('stages')
@ApiBearerAuth('JWT-auth')
@Controller('stages')
export class StagesController {
  constructor(private readonly stagesService: StagesService) {}

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Crear nueva etapa' })
  @ApiResponse({ status: 201, description: 'Etapa creada exitosamente' })
  @ApiResponse({ status: 409, description: 'Ya existe una etapa con ese nombre' })
  @ApiResponse({ status: 403, description: 'No autorizado' })
  create(@Body() dto: CreateStageDto) {
    return this.stagesService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Obtener todas las etapas (paginado)' })
  @ApiQuery({ name: 'includeInactive', required: false, description: 'Incluir etapas inactivas' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'all', required: false, description: 'true: sin paginar' })
  @ApiResponse({ status: 200, description: 'Lista paginada de etapas ordenadas' })
  findAll(
    @Query('includeInactive') includeInactive?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('all') all?: string,
  ) {
    return this.stagesService.findAll(includeInactive === 'true', {
      page,
      limit,
      all,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener etapa por ID' })
  @ApiParam({ name: 'id', description: 'ID de la etapa' })
  @ApiResponse({ status: 200, description: 'Etapa encontrada' })
  @ApiResponse({ status: 404, description: 'Etapa no encontrada' })
  findOne(@Param('id') id: string) {
    return this.stagesService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Actualizar etapa' })
  @ApiParam({ name: 'id', description: 'ID de la etapa' })
  @ApiResponse({ status: 200, description: 'Etapa actualizada' })
  @ApiResponse({ status: 404, description: 'Etapa no encontrada' })
  @ApiResponse({ status: 409, description: 'Ya existe una etapa con ese nombre' })
  @ApiResponse({ status: 403, description: 'No autorizado' })
  update(@Param('id') id: string, @Body() dto: UpdateStageDto) {
    return this.stagesService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar etapa' })
  @ApiParam({ name: 'id', description: 'ID de la etapa' })
  @ApiResponse({ status: 204, description: 'Etapa eliminada' })
  @ApiResponse({ status: 404, description: 'Etapa no encontrada' })
  @ApiResponse({ status: 409, description: 'No se puede eliminar una etapa con actividades' })
  @ApiResponse({ status: 403, description: 'No autorizado' })
  remove(@Param('id') id: string) {
    return this.stagesService.remove(id);
  }

  @Post('reorder')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Reordenar etapas' })
  @ApiBody({
    description: 'Array de etapas con nuevo orden',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'ID de la etapa' },
          order: { type: 'number', description: 'Nuevo orden' },
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Etapas reordenadas exitosamente' })
  @ApiResponse({ status: 403, description: 'No autorizado' })
  reorder(@Body() stages: { id: string; order: number }[]) {
    return this.stagesService.reorder(stages);
  }
}
