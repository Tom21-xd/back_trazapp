import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStageDto, UpdateStageDto } from './dto';

@Injectable()
export class StagesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateStageDto) {
    // Verificar que el nombre sea único
    const existing = await this.prisma.stage.findUnique({
      where: { name: dto.name },
    });

    if (existing) {
      throw new ConflictException('Ya existe una etapa con ese nombre');
    }

    const stage = await this.prisma.stage.create({
      data: dto,
      include: {
        _count: {
          select: {
            activitiesCurrent: true,
          },
        },
      },
    });

    return stage;
  }

  async findAll(includeInactive = false) {
    return this.prisma.stage.findMany({
      where: includeInactive ? undefined : { isActive: true },
      include: {
        _count: {
          select: {
            activitiesCurrent: true,
          },
        },
      },
      orderBy: { order: 'asc' },
    });
  }

  async findOne(id: string) {
    const stage = await this.prisma.stage.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            activitiesCurrent: true,
            stageHistory: true,
          },
        },
      },
    });

    if (!stage) {
      throw new NotFoundException('Etapa no encontrada');
    }

    return stage;
  }

  async update(id: string, dto: UpdateStageDto) {
    await this.findOne(id);

    // Si se cambia el nombre, verificar que sea único
    if (dto.name) {
      const existing = await this.prisma.stage.findUnique({
        where: { name: dto.name },
      });

      if (existing && existing.id !== id) {
        throw new ConflictException('Ya existe una etapa con ese nombre');
      }
    }

    const stage = await this.prisma.stage.update({
      where: { id },
      data: dto,
      include: {
        _count: {
          select: {
            activitiesCurrent: true,
          },
        },
      },
    });

    return stage;
  }

  async remove(id: string) {
    const stage = await this.findOne(id);

    // Verificar que no tenga actividades asignadas
    if (stage._count.activitiesCurrent > 0) {
      throw new ConflictException(
        'No se puede eliminar una etapa con actividades asignadas',
      );
    }

    await this.prisma.stage.delete({
      where: { id },
    });

    return { message: 'Etapa eliminada exitosamente' };
  }

  async reorder(stages: { id: string; order: number }[]) {
    // Actualizar el orden de todas las etapas
    await this.prisma.$transaction(
      stages.map((stage) =>
        this.prisma.stage.update({
          where: { id: stage.id },
          data: { order: stage.order },
        }),
      ),
    );

    return { message: 'Etapas reordenadas exitosamente' };
  }
}
