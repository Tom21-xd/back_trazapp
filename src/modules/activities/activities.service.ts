import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateActivityDto, UpdateActivityDto, AssignUsersDto } from './dto';
import { FILE_PUBLIC_SELECT } from '../../common/prisma/file-select';
import {
  buildPaginated,
  resolvePagination,
  type PaginationQuery,
} from '../../common/pagination';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ActivitiesService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async create(dto: CreateActivityDto, createdById: string) {
    const {
      assignedUserIds,
      tagIds,
      dependsOnActivityIds,
      ...activityData
    } = dto;

    // Verificar que existen project y stage
    await this.verifyProjectAndStage(dto.projectId, dto.currentStageId);

    // Verificar que los usuarios y tags referenciados existen (evita 500 por FK)
    if (assignedUserIds?.length > 0) {
      await this.verifyUsersExist(assignedUserIds);
    }
    if (tagIds?.length > 0) {
      await this.verifyTagsExist(tagIds);
    }

    // Verificar dependencias circulares
    if (dependsOnActivityIds?.length > 0) {
      await this.validateDependencies(null, dependsOnActivityIds);
    }

    const activity = await this.prisma.activity.create({
      data: {
        ...activityData,
        assignments: assignedUserIds
          ? {
              create: assignedUserIds.map((userId) => ({
                user: { connect: { id: userId } },
              })),
            }
          : undefined,
        tags: tagIds
          ? {
              create: tagIds.map((tagId) => ({
                tag: { connect: { id: tagId } },
              })),
            }
          : undefined,
        dependsOn: dependsOnActivityIds
          ? {
              create: dependsOnActivityIds.map((requiredId) => ({
                requiredActivity: { connect: { id: requiredId } },
              })),
            }
          : undefined,
        stageHistory: {
          create: {
            stage: { connect: { id: dto.currentStageId } },
            notes: 'Actividad creada',
          },
        },
      },
      include: this.getIncludeOptions(),
    });

    if (assignedUserIds && assignedUserIds.length > 0) {
      await this.notifications.activityAssigned(
        activity.id,
        activity.title,
        assignedUserIds,
        createdById,
      );
    }

    return activity;
  }

  async findAll(
    filters?: {
      projectId?: string;
      stageId?: string;
      assignedUserId?: string;
      priority?: string;
    },
    pagination: PaginationQuery = {},
  ) {
    const where: any = { isActive: true };

    if (filters?.projectId) where.projectId = filters.projectId;
    if (filters?.stageId) where.currentStageId = filters.stageId;
    if (filters?.priority) where.priority = filters.priority;
    if (filters?.assignedUserId) {
      where.assignments = {
        some: { userId: filters.assignedUserId },
      };
    }

    const resolved = resolvePagination(pagination);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.activity.findMany({
        where,
        include: this.getIncludeOptions(),
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        ...(resolved.all
          ? {}
          : { skip: resolved.skip, take: resolved.take }),
      }),
      this.prisma.activity.count({ where }),
    ]);
    return buildPaginated(data, total, resolved);
  }

  async findOne(id: string) {
    const activity = await this.prisma.activity.findUnique({
      where: { id },
      include: {
        ...this.getIncludeOptions(),
        stageHistory: {
          include: {
            stage: true,
          },
          orderBy: { enteredAt: 'desc' },
        },
        comments: {
          include: {
            user: {
              select: { id: true, name: true, email: true, avatar: true, role: true },
            },
            files: FILE_PUBLIC_SELECT,
          },
          orderBy: { createdAt: 'desc' },
        },
        files: FILE_PUBLIC_SELECT,
        stageChangeRequests: {
          include: {
            fromStage: true,
            toStage: true,
            requestedBy: {
              select: { id: true, name: true, email: true, avatar: true },
            },
            reviewedBy: {
              select: { id: true, name: true, email: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!activity) {
      throw new NotFoundException('Actividad no encontrada');
    }

    return activity;
  }

  async update(id: string, dto: UpdateActivityDto) {
    const existing = await this.findOne(id);

    const {
      assignedUserIds,
      tagIds,
      dependsOnActivityIds,
      currentStageId,
      ...activityData
    } = dto;

    const stageChanged =
      currentStageId !== undefined &&
      currentStageId !== existing.currentStageId;

    // Validaciones previas (fuera de la transacción, fallan rápido con 404/400)
    if (stageChanged) {
      await this.verifyStageExists(currentStageId);
    }
    if (assignedUserIds !== undefined && assignedUserIds.length > 0) {
      await this.verifyUsersExist(assignedUserIds);
    }
    if (tagIds !== undefined && tagIds.length > 0) {
      await this.verifyTagsExist(tagIds);
    }
    if (dependsOnActivityIds !== undefined) {
      await this.validateDependencies(id, dependsOnActivityIds);
    }

    // Todo el cambio es atómico: si algo falla, no queda historial inconsistente
    await this.prisma.$transaction(async (tx) => {
      if (assignedUserIds !== undefined) {
        await tx.activityAssignment.deleteMany({ where: { activityId: id } });
        if (assignedUserIds.length > 0) {
          await tx.activityAssignment.createMany({
            data: assignedUserIds.map((userId) => ({
              activityId: id,
              userId,
            })),
            skipDuplicates: true,
          });
        }
      }

      if (tagIds !== undefined) {
        await tx.activityTag.deleteMany({ where: { activityId: id } });
        if (tagIds.length > 0) {
          await tx.activityTag.createMany({
            data: tagIds.map((tagId) => ({ activityId: id, tagId })),
            skipDuplicates: true,
          });
        }
      }

      if (dependsOnActivityIds !== undefined) {
        await tx.activityDependency.deleteMany({
          where: { dependentActivityId: id },
        });
        if (dependsOnActivityIds.length > 0) {
          await tx.activityDependency.createMany({
            data: dependsOnActivityIds.map((requiredActivityId) => ({
              dependentActivityId: id,
              requiredActivityId,
            })),
            skipDuplicates: true,
          });
        }
      }

      // Cambio de etapa: cerrar la etapa abierta y abrir la nueva en el historial
      if (stageChanged) {
        const openHistory = await tx.activityStageHistory.findFirst({
          where: { activityId: id, exitedAt: null },
          orderBy: { enteredAt: 'desc' },
        });

        if (openHistory) {
          await tx.activityStageHistory.update({
            where: { id: openHistory.id },
            data: { exitedAt: new Date() },
          });
        }

        await tx.activityStageHistory.create({
          data: {
            activityId: id,
            stageId: currentStageId,
            notes: 'Cambio de etapa',
          },
        });
      }

      await tx.activity.update({
        where: { id },
        data: {
          ...activityData,
          ...(currentStageId !== undefined ? { currentStageId } : {}),
        },
      });
    });

    return this.findOne(id);
  }

  async remove(id: string) {
    await this.findOne(id);

    // Verificar que no tenga actividades que dependan de ella
    const dependentActivities = await this.prisma.activityDependency.count({
      where: { requiredActivityId: id },
    });

    if (dependentActivities > 0) {
      throw new BadRequestException(
        'No se puede eliminar una actividad de la que dependen otras',
      );
    }

    await this.prisma.activity.delete({
      where: { id },
    });

    return { message: 'Actividad eliminada exitosamente' };
  }

  async assignUsers(id: string, dto: AssignUsersDto) {
    await this.findOne(id);

    if (dto.userIds.length > 0) {
      await this.verifyUsersExist(dto.userIds);
    }

    await this.prisma.$transaction([
      this.prisma.activityAssignment.deleteMany({
        where: { activityId: id },
      }),
      this.prisma.activityAssignment.createMany({
        data: dto.userIds.map((userId) => ({
          activityId: id,
          userId,
        })),
        skipDuplicates: true,
      }),
    ]);

    const result = await this.findOne(id);
    if (dto.userIds.length > 0) {
      await this.notifications.activityAssigned(
        result.id,
        result.title,
        dto.userIds,
      );
    }
    return result;
  }

  async unassignUser(activityId: string, userId: string) {
    await this.findOne(activityId);

    await this.prisma.activityAssignment.deleteMany({
      where: {
        activityId,
        userId,
      },
    });

    return { message: 'Usuario desasignado exitosamente' };
  }

  async getMyActivities(userId: string, pagination: PaginationQuery = {}) {
    const where = {
      isActive: true,
      assignments: { some: { userId } },
    };
    const resolved = resolvePagination(pagination);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.activity.findMany({
        where,
        include: this.getIncludeOptions(),
        orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
        ...(resolved.all
          ? {}
          : { skip: resolved.skip, take: resolved.take }),
      }),
      this.prisma.activity.count({ where }),
    ]);
    return buildPaginated(data, total, resolved);
  }

  // Métodos auxiliares
  private async verifyProjectAndStage(projectId: string, stageId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) {
      throw new NotFoundException('Proyecto no encontrado');
    }

    const stage = await this.prisma.stage.findUnique({
      where: { id: stageId },
    });
    if (!stage) {
      throw new NotFoundException('Etapa no encontrada');
    }
  }

  private async verifyStageExists(stageId: string) {
    const stage = await this.prisma.stage.findUnique({
      where: { id: stageId },
    });
    if (!stage) {
      throw new NotFoundException('Etapa no encontrada');
    }
  }

  private async validateDependencies(
    activityId: string | null,
    dependsOnIds: string[],
  ) {
    if (activityId && dependsOnIds.includes(activityId)) {
      throw new BadRequestException(
        'Una actividad no puede depender de sí misma',
      );
    }

    // Verificar que todas las actividades existen
    const activities = await this.prisma.activity.findMany({
      where: { id: { in: dependsOnIds } },
    });

    if (activities.length !== dependsOnIds.length) {
      throw new NotFoundException(
        'Una o más actividades de dependencia no existen',
      );
    }
  }

  private async verifyUsersExist(userIds: string[]) {
    const ids = [...new Set(userIds)];
    const count = await this.prisma.user.count({
      where: { id: { in: ids } },
    });
    if (count !== ids.length) {
      throw new NotFoundException(
        'Uno o más usuarios asignados no existen',
      );
    }
  }

  private async verifyTagsExist(tagIds: string[]) {
    const ids = [...new Set(tagIds)];
    const count = await this.prisma.tag.count({
      where: { id: { in: ids } },
    });
    if (count !== ids.length) {
      throw new NotFoundException('Una o más etiquetas no existen');
    }
  }

  private getIncludeOptions() {
    return {
      project: {
        select: {
          id: true,
          name: true,
          status: true,
        },
      },
      currentStage: true,
      assignments: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
            },
          },
        },
      },
      tags: {
        include: {
          tag: true,
        },
      },
      dependsOn: {
        include: {
          requiredActivity: {
            select: {
              id: true,
              title: true,
              currentStage: true,
            },
          },
        },
      },
      dependedBy: {
        include: {
          dependentActivity: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      },
      _count: {
        select: {
          comments: true,
          files: true,
          stageChangeRequests: true,
        },
      },
    };
  }
}
