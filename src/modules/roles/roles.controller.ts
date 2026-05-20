import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
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
import { RolesService } from './roles.service';
import { CreateRoleDto, UpdateRoleDto, AssignRoleDto } from './dto';
import { RequirePermissions } from '../../common/decorators';

@ApiTags('roles')
@ApiBearerAuth('JWT-auth')
@Controller('roles')
export class RolesController {
  constructor(private readonly service: RolesService) {}

  @Get('permissions')
  @RequirePermissions('role:read')
  @ApiOperation({ summary: 'Catálogo de permisos disponibles (agrupado)' })
  @ApiResponse({ status: 200, description: 'Permisos por grupo' })
  listPermissions() {
    return this.service.listPermissions();
  }

  @Get()
  @RequirePermissions('role:read')
  @ApiOperation({ summary: 'Listar roles (paginado)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'all', required: false })
  @ApiResponse({ status: 200, description: 'Lista paginada de roles' })
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('all') all?: string,
  ) {
    return this.service.findAll({ page, limit, all });
  }

  @Get(':id')
  @RequirePermissions('role:read')
  @ApiParam({ name: 'id' })
  @ApiOperation({ summary: 'Obtener rol por ID' })
  @ApiResponse({ status: 200, description: 'Rol encontrado' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @RequirePermissions('role:create')
  @ApiOperation({ summary: 'Crear rol con permisos' })
  @ApiResponse({ status: 201, description: 'Rol creado' })
  @ApiResponse({ status: 409, description: 'Nombre duplicado' })
  create(@Body() dto: CreateRoleDto) {
    return this.service.create(dto);
  }

  @Patch('assign')
  @RequirePermissions('role:assign')
  @ApiOperation({ summary: 'Asignar un rol a un usuario' })
  @ApiResponse({ status: 200, description: 'Rol asignado' })
  assign(@Body() dto: AssignRoleDto) {
    return this.service.assignToUser(dto.userId, dto.roleId ?? null);
  }

  @Patch(':id')
  @RequirePermissions('role:update')
  @ApiParam({ name: 'id' })
  @ApiOperation({ summary: 'Actualizar rol / permisos' })
  @ApiResponse({ status: 200, description: 'Rol actualizado' })
  update(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('role:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'id' })
  @ApiOperation({ summary: 'Eliminar rol' })
  @ApiResponse({ status: 204, description: 'Rol eliminado' })
  @ApiResponse({ status: 400, description: 'Rol del sistema o con usuarios' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
