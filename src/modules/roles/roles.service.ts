import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoleDto, UpdateRoleDto } from './dto';
import {
  buildPaginated,
  resolvePagination,
  type PaginationQuery,
} from '../../common/pagination';

@Injectable()
export class RolesService {
  constructor(private prisma: PrismaService) {}

  /** Catálogo de permisos disponibles, agrupado. */
  async listPermissions() {
    const perms = await this.prisma.permission.findMany({
      orderBy: [{ group: 'asc' }, { key: 'asc' }],
    });
    const groups: Record<string, typeof perms> = {};
    for (const p of perms) {
      (groups[p.group] ??= []).push(p);
    }
    return Object.entries(groups).map(([group, items]) => ({
      group,
      permissions: items.map((i) => ({
        key: i.key,
        description: i.description,
      })),
    }));
  }

  private serialize(role: any) {
    return {
      id: role.id,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
      userCount: role._count?.users ?? 0,
      permissionKeys:
        role.permissions?.map((rp: any) => rp.permission.key) ?? [],
    };
  }

  async findAll(pagination: PaginationQuery = {}) {
    const include = {
      permissions: { include: { permission: true } },
      _count: { select: { users: true } },
    };
    const resolved = resolvePagination(pagination);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.appRole.findMany({
        include,
        orderBy: { name: 'asc' },
        ...(resolved.all ? {} : { skip: resolved.skip, take: resolved.take }),
      }),
      this.prisma.appRole.count(),
    ]);
    return buildPaginated(
      data.map((r) => this.serialize(r)),
      total,
      resolved,
    );
  }

  async findOne(id: string) {
    const role = await this.prisma.appRole.findUnique({
      where: { id },
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
    });
    if (!role) throw new NotFoundException('Rol no encontrado');
    return this.serialize(role);
  }

  private async permissionIdsFromKeys(keys: string[]) {
    const unique = [...new Set(keys)];
    const perms = await this.prisma.permission.findMany({
      where: { key: { in: unique } },
      select: { id: true, key: true },
    });
    if (perms.length !== unique.length) {
      const found = new Set(perms.map((p) => p.key));
      const missing = unique.filter((k) => !found.has(k));
      throw new BadRequestException(
        `Permisos inexistentes: ${missing.join(', ')}`,
      );
    }
    return perms.map((p) => p.id);
  }

  async create(dto: CreateRoleDto) {
    const exists = await this.prisma.appRole.findUnique({
      where: { name: dto.name },
    });
    if (exists) throw new ConflictException('Ya existe un rol con ese nombre');

    const permissionIds = await this.permissionIdsFromKeys(dto.permissionKeys);

    const role = await this.prisma.appRole.create({
      data: {
        name: dto.name,
        description: dto.description,
        permissions: {
          create: permissionIds.map((permissionId) => ({ permissionId })),
        },
      },
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
    });
    return this.serialize(role);
  }

  async update(id: string, dto: UpdateRoleDto) {
    const role = await this.prisma.appRole.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Rol no encontrado');

    if (dto.name && dto.name !== role.name) {
      if (role.isSystem) {
        throw new BadRequestException(
          'No se puede renombrar un rol del sistema',
        );
      }
      const dup = await this.prisma.appRole.findUnique({
        where: { name: dto.name },
      });
      if (dup) throw new ConflictException('Ya existe un rol con ese nombre');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.appRole.update({
        where: { id },
        data: {
          ...(dto.name && !role.isSystem ? { name: dto.name } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description }
            : {}),
        },
      });

      if (dto.permissionKeys !== undefined) {
        const permissionIds = await this.permissionIdsFromKeys(
          dto.permissionKeys,
        );
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        if (permissionIds.length > 0) {
          await tx.rolePermission.createMany({
            data: permissionIds.map((permissionId) => ({
              roleId: id,
              permissionId,
            })),
            skipDuplicates: true,
          });
        }
      }
    });

    return this.findOne(id);
  }

  async remove(id: string) {
    const role = await this.prisma.appRole.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });
    if (!role) throw new NotFoundException('Rol no encontrado');
    if (role.isSystem) {
      throw new BadRequestException('No se puede eliminar un rol del sistema');
    }
    if (role._count.users > 0) {
      throw new BadRequestException(
        'No se puede eliminar un rol con usuarios asignados',
      );
    }
    await this.prisma.appRole.delete({ where: { id } });
    return { message: 'Rol eliminado exitosamente' };
  }

  /** Asigna (o quita con roleId null) un rol a un usuario. */
  async assignToUser(userId: string, roleId: string | null | undefined) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    if (roleId) {
      const role = await this.prisma.appRole.findUnique({
        where: { id: roleId },
      });
      if (!role) throw new NotFoundException('Rol no encontrado');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { appRoleId: roleId ?? null },
    });

    return { message: 'Rol asignado correctamente' };
  }
}
