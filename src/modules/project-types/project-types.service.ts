import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectTypeDto, UpdateProjectTypeDto } from './dto';
import {
  buildPaginated,
  resolvePagination,
  type PaginationQuery,
} from '../../common/pagination';

@Injectable()
export class ProjectTypesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateProjectTypeDto) {
    const existing = await this.prisma.projectType.findUnique({
      where: { name: dto.name },
    });
    if (existing) {
      throw new ConflictException('Ya existe un tipo con ese nombre');
    }

    return this.prisma.projectType.create({
      data: dto,
      include: { _count: { select: { projects: true } } },
    });
  }

  async findAll(pagination: PaginationQuery = {}) {
    const include = { _count: { select: { projects: true } } };
    const resolved = resolvePagination(pagination);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.projectType.findMany({
        include,
        orderBy: { name: 'asc' },
        ...(resolved.all ? {} : { skip: resolved.skip, take: resolved.take }),
      }),
      this.prisma.projectType.count(),
    ]);
    return buildPaginated(data, total, resolved);
  }

  async findOne(id: string) {
    const type = await this.prisma.projectType.findUnique({
      where: { id },
      include: { _count: { select: { projects: true } } },
    });
    if (!type) {
      throw new NotFoundException('Tipo de proyecto no encontrado');
    }
    return type;
  }

  async update(id: string, dto: UpdateProjectTypeDto) {
    await this.findOne(id);

    if (dto.name) {
      const existing = await this.prisma.projectType.findUnique({
        where: { name: dto.name },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException('Ya existe un tipo con ese nombre');
      }
    }

    return this.prisma.projectType.update({
      where: { id },
      data: dto,
      include: { _count: { select: { projects: true } } },
    });
  }

  async remove(id: string) {
    const type = await this.findOne(id);

    if (type._count.projects > 0) {
      throw new BadRequestException(
        'No se puede eliminar un tipo con proyectos asociados',
      );
    }

    await this.prisma.projectType.delete({ where: { id } });
    return { message: 'Tipo de proyecto eliminado exitosamente' };
  }
}
