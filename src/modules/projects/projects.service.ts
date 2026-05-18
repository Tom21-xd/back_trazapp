import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto, UpdateProjectDto } from './dto';
import {
  buildPaginated,
  resolvePagination,
  type PaginationQuery,
} from '../../common/pagination';

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateProjectDto) {
    const { tagIds, ...projectData } = dto;

    const project = await this.prisma.project.create({
      data: {
        ...projectData,
        tags: tagIds
          ? {
              create: tagIds.map((tagId) => ({
                tag: { connect: { id: tagId } },
              })),
            }
          : undefined,
      },
      include: {
        projectType: true,
        tags: {
          include: {
            tag: true,
          },
        },
        _count: {
          select: {
            activities: true,
          },
        },
      },
    });

    return project;
  }

  async findAll(includeInactive = false, pagination: PaginationQuery = {}) {
    const resolved = resolvePagination(pagination);
    const where = includeInactive ? {} : { isActive: true };
    const include = {
      projectType: true,
      tags: { include: { tag: true } },
      _count: { select: { activities: true } },
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.project.findMany({
        where,
        include,
        orderBy: { createdAt: 'desc' },
        ...(resolved.all
          ? {}
          : { skip: resolved.skip, take: resolved.take }),
      }),
      this.prisma.project.count({ where }),
    ]);
    return buildPaginated(data, total, resolved);
  }

  async findOne(id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        projectType: true,
        tags: {
          include: {
            tag: true,
          },
        },
        activities: {
          include: {
            currentStage: true,
            _count: {
              select: {
                assignments: true,
                comments: true,
              },
            },
          },
        },
      },
    });

    if (!project) {
      throw new NotFoundException('Proyecto no encontrado');
    }

    return project;
  }

  async update(id: string, dto: UpdateProjectDto) {
    await this.findOne(id);

    const { tagIds, ...projectData } = dto;

    // Si se envían tags, eliminar los existentes y crear los nuevos
    if (tagIds !== undefined) {
      await this.prisma.projectTag.deleteMany({
        where: { projectId: id },
      });
    }

    const project = await this.prisma.project.update({
      where: { id },
      data: {
        ...projectData,
        tags:
          tagIds !== undefined
            ? {
                create: tagIds.map((tagId) => ({
                  tag: { connect: { id: tagId } },
                })),
              }
            : undefined,
      },
      include: {
        projectType: true,
        tags: {
          include: {
            tag: true,
          },
        },
        _count: {
          select: {
            activities: true,
          },
        },
      },
    });

    return project;
  }

  async remove(id: string) {
    await this.findOne(id);

    await this.prisma.project.delete({
      where: { id },
    });

    return { message: 'Proyecto eliminado exitosamente' };
  }

  async getProjectStats(id: string) {
    await this.findOne(id);

    const stats = await this.prisma.project.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        status: true,
        _count: {
          select: {
            activities: true,
          },
        },
        activities: {
          select: {
            currentStage: {
              select: {
                id: true,
                name: true,
              },
            },
            priority: true,
          },
        },
      },
    });

    // Agrupar actividades por etapa
    const activitiesByStage = stats.activities.reduce((acc, activity) => {
      const stageName = activity.currentStage.name;
      acc[stageName] = (acc[stageName] || 0) + 1;
      return acc;
    }, {});

    // Agrupar por prioridad
    const activitiesByPriority = stats.activities.reduce((acc, activity) => {
      const priority = activity.priority;
      acc[priority] = (acc[priority] || 0) + 1;
      return acc;
    }, {});

    return {
      projectId: stats.id,
      projectName: stats.name,
      projectStatus: stats.status,
      totalActivities: stats._count.activities,
      activitiesByStage,
      activitiesByPriority,
    };
  }
}
