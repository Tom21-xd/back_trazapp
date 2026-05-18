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
import { ProjectTypesService } from './project-types.service';
import { CreateProjectTypeDto, UpdateProjectTypeDto } from './dto';
import { Roles } from '../../common/decorators';
import { Role } from '@prisma/client';

@ApiTags('project-types')
@ApiBearerAuth('JWT-auth')
@Controller('project-types')
export class ProjectTypesController {
  constructor(private readonly service: ProjectTypesService) {}

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Crear tipo de proyecto' })
  @ApiResponse({ status: 201, description: 'Tipo creado' })
  @ApiResponse({ status: 409, description: 'Nombre duplicado' })
  create(@Body() dto: CreateProjectTypeDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar tipos de proyecto (paginado)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'all', required: false, description: 'true: sin paginar' })
  @ApiResponse({ status: 200, description: 'Lista paginada de tipos' })
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('all') all?: string,
  ) {
    return this.service.findAll({ page, limit, all });
  }

  @Get(':id')
  @ApiParam({ name: 'id', description: 'ID del tipo' })
  @ApiOperation({ summary: 'Obtener tipo por ID' })
  @ApiResponse({ status: 200, description: 'Tipo encontrado' })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiParam({ name: 'id', description: 'ID del tipo' })
  @ApiOperation({ summary: 'Actualizar tipo de proyecto' })
  @ApiResponse({ status: 200, description: 'Tipo actualizado' })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  update(@Param('id') id: string, @Body() dto: UpdateProjectTypeDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'id', description: 'ID del tipo' })
  @ApiOperation({ summary: 'Eliminar tipo de proyecto' })
  @ApiResponse({ status: 204, description: 'Tipo eliminado' })
  @ApiResponse({ status: 400, description: 'Tiene proyectos asociados' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
