import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { TagsService } from './tags.service';
import { CreateTagDto, UpdateTagDto } from './dto';
import { Roles } from '../../common/decorators';
import { Role } from '@prisma/client';

@ApiTags('tags')
@ApiBearerAuth('JWT-auth')
@Controller('tags')
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Crear nueva etiqueta' })
  @ApiResponse({ status: 201, description: 'Etiqueta creada exitosamente' })
  @ApiResponse({ status: 409, description: 'Ya existe una etiqueta con ese nombre' })
  @ApiResponse({ status: 403, description: 'No autorizado' })
  create(@Body() dto: CreateTagDto) {
    return this.tagsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Obtener todas las etiquetas' })
  @ApiResponse({ status: 200, description: 'Lista de etiquetas con conteo de uso' })
  findAll() {
    return this.tagsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener etiqueta por ID' })
  @ApiParam({ name: 'id', description: 'ID de la etiqueta' })
  @ApiResponse({ status: 200, description: 'Etiqueta encontrada' })
  @ApiResponse({ status: 404, description: 'Etiqueta no encontrada' })
  findOne(@Param('id') id: string) {
    return this.tagsService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Actualizar etiqueta' })
  @ApiParam({ name: 'id', description: 'ID de la etiqueta' })
  @ApiResponse({ status: 200, description: 'Etiqueta actualizada' })
  @ApiResponse({ status: 404, description: 'Etiqueta no encontrada' })
  @ApiResponse({ status: 409, description: 'Ya existe una etiqueta con ese nombre' })
  @ApiResponse({ status: 403, description: 'No autorizado' })
  update(@Param('id') id: string, @Body() dto: UpdateTagDto) {
    return this.tagsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar etiqueta' })
  @ApiParam({ name: 'id', description: 'ID de la etiqueta' })
  @ApiResponse({ status: 204, description: 'Etiqueta eliminada' })
  @ApiResponse({ status: 404, description: 'Etiqueta no encontrada' })
  @ApiResponse({ status: 403, description: 'No autorizado' })
  remove(@Param('id') id: string) {
    return this.tagsService.remove(id);
  }
}
