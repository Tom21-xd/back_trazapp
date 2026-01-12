import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateActivityDto, UpdateActivityDto, AssignUsersDto } from './dto';

@Injectable()
export class ActivitiesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateActivityDto, createdById: string) {
    const {
      assignedUserIds,
      tagIds,
      dependsOnActivityIds,
      ...activityData
    } = dto;

    // Verificar que existen project y stage
    await this.verifyProjectAndStage(dto.projectId, dto.currentStageId);

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

    return activity;
  }

  async findAll(filters?: {
    projectId?: string;
    stageId?: string;
    assignedUserId?: string;
    priority?: string;
  }) {
    const where: any = { isActive: true };

    if (filters?.projectId) where.projectId = filters.projectId;
    if (filters?.stageId) where.currentStageId = filters.stageId;
    if (filters?.priority) where.priority = filters.priority;
    if (filters?.assignedUserId) {
      where.assignments = {
        some: { userId: filters.assignedUserId },
      };
    }

    return this.prisma.activity.findMany({
      where,
      include: this.getIncludeOptions(),
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
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
      },
    });

    if (!activity) {
      throw new NotFoundException('Actividad no encontrada');
    }

    return activity;
  }

  async update(id: string, dto: UpdateActivityDto) {
    await this.findOne(id);

    const {
      assignedUserIds,
      tagIds,
      dependsOnActivityIds,
      currentStageId,
      ...activityData
    } = dto;

    // Si se cambia la etapa, crear registro en historial
    let stageHistoryUpdate = {};
    if (currentStageId) {
      await this.verifyStageExists(currentStageId);

      stageHistoryUpdate = {
        stageHistory: {
          update: {
            where: {
              activityId_exitedAt: {
                activityId: id,
                exitedAt: null,
              },
            },
            data: { exitedAt: new Date() },
          },
          create: {
            stage: { connect: { id: currentStageId } },
          },
        },
      };
    }

    // Actualizar asignaciones si se proporcionan
    if (assignedUserIds !== undefined) {
      await this.prisma.activityAssignment.deleteMany({
        where: { activityId: id },
      });
    }

    // Actualizar tags si se proporcionan
    if (tagIds !== undefined) {
      await this.prisma.activityTag.deleteMany({
        where: { activityId: id },
      });
    }

    // Actualizar dependencias
    if (dependsOnActivityIds !== undefined) {
      await this.validateDependencies(id, dependsOnActivityIds);
      await this.prisma.activityDependency.deleteMany({
        where: { dependentActivityId: id },
      });
    }

    const activity = await this.prisma.activity.update({
      where: { id },
      data: {
        ...activityData,
        currentStageId,
        ...stageHistoryUpdate,
        assignments:
          assignedUserIds !== undefined
            ? {
                create: assignedUserIds.map((userId) => ({
                  user: { connect: { id: userId } },
                })),
              }
            : undefined,
        tags:
          tagIds !== undefined
            ? {
                create: tagIds.map((tagId) => ({
                  tag: { connect: { id: tagId } },
                })),
              }
            : undefined,
        dependsOn:
          dependsOnActivityIds !== undefined
            ? {
                create: dependsOnActivityIds.map((requiredId) => ({
                  requiredActivity: { connect: { id: requiredId } },
                })),
              }
            : undefined,
      },
      include: this.getIncludeOptions(),
    });

    return activity;
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

    // Eliminar asignaciones actuales
    await this.prisma.activityAssignment.deleteMany({
      where: { activityId: id },
    });

    // Crear nuevas asignaciones
    await this.prisma.activityAssignment.createMany({
      data: dto.userIds.map((userId) => ({
        activityId: id,
        userId,
      })),
    });

    return this.findOne(id);
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

  async getMyActivities(userId: string) {
    return this.prisma.activity.findMany({
      where: {
        isActive: true,
        assignments: {
          some: { userId },
        },
      },
      include: this.getIncludeOptions(),
      orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
    });
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
