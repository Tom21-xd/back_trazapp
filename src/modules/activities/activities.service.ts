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
import { ActivityEventsService } from '../activity-events/activity-events.service';
import { hasAnyPermission } from '../../common/permissions';
import { Prisma } from '@prisma/client';

interface AuthUser {
  id: string;
  permissions?: string[];
}

@Injectable()
export class ActivitiesService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private events: ActivityEventsService,
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

    await this.events.record({
      activityId: activity.id,
      type: 'CREATED',
      actorId: createdById,
      toStageId: dto.currentStageId,
      note: activity.title,
    });
    if (assignedUserIds && assignedUserIds.length > 0) {
      for (const targetUserId of assignedUserIds) {
        await this.events.record({
          activityId: activity.id,
          type: 'ASSIGNED',
          actorId: createdById,
          targetUserId,
        });
      }
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
    user?: AuthUser,
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

    // Alcance: sin 'activity:read:any' solo ve las actividades asignadas a sí mismo
    if (user && !hasAnyPermission(user.permissions, ['activity:read:any'])) {
      where.assignments = { some: { userId: user.id } };
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
              select: { id: true, name: true, email: true, avatar: true },
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

  /** Lectura con alcance: 'activity:read:any' ve cualquiera; si no, debe estar asignado. */
  async findOneScoped(id: string, user: AuthUser) {
    const activity = await this.findOne(id);
    if (hasAnyPermission(user.permissions, ['activity:read:any'])) {
      return activity;
    }
    const assigned = activity.assignments?.some(
      (a: { userId: string }) => a.userId === user.id,
    );
    if (!assigned) {
      throw new ForbiddenException('No tienes acceso a esta actividad');
    }
    return activity;
  }

  /** Timeline inmutable de eventos de la actividad. */
  async listEvents(id: string, user: AuthUser, pagination: PaginationQuery = {}) {
    await this.findOneScoped(id, user);
    return this.events.list(id, pagination);
  }

  async update(id: string, dto: UpdateActivityDto, actorId: string) {
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

    const previousAssignees = (existing.assignments ?? []).map(
      (a: { userId: string }) => a.userId,
    );

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

    // Trazabilidad (después de commit — best-effort)
    if (stageChanged) {
      await this.events.record({
        activityId: id,
        type: 'STAGE_CHANGED',
        actorId,
        fromStageId: existing.currentStageId,
        toStageId: currentStageId,
      });
      // Notificar a los asignados (los que quedaron tras el diff) del cambio
      const finalAssignees =
        assignedUserIds !== undefined ? assignedUserIds : previousAssignees;
      if (finalAssignees.length > 0) {
        try {
          const newStage = await this.prisma.stage.findUnique({
            where: { id: currentStageId! },
            select: { name: true },
          });
          await this.notifications.stageChanged(
            id,
            existing.title,
            newStage?.name ?? 'la nueva etapa',
            finalAssignees,
            actorId,
          );
        } catch {
          // best-effort
        }
      }
    }
    if (assignedUserIds !== undefined) {
      const added = assignedUserIds.filter((u) => !previousAssignees.includes(u));
      const removed = previousAssignees.filter((u) => !assignedUserIds.includes(u));
      for (const targetUserId of added) {
        await this.events.record({
          activityId: id,
          type: 'ASSIGNED',
          actorId,
          targetUserId,
        });
      }
      for (const targetUserId of removed) {
        await this.events.record({
          activityId: id,
          type: 'UNASSIGNED',
          actorId,
          targetUserId,
        });
      }
      if (added.length > 0) {
        await this.notifications.activityAssigned(
          id,
          existing.title,
          added,
          actorId,
        );
      }
      if (removed.length > 0) {
        await this.notifications.activityUnassigned(
          id,
          existing.title,
          removed,
          actorId,
        );
      }
    }

    // Diff de campos editables (título, descripción, prioridad, fecha límite, tags, deps)
    type FieldDiff =
      | { from: string | null; to: string | null }
      | { added: string[]; removed: string[] };
    const fieldChanges: Record<string, FieldDiff> = {};
    if (activityData.title !== undefined && activityData.title !== existing.title) {
      fieldChanges.title = {
        from: existing.title ?? null,
        to: activityData.title ?? null,
      };
    }
    if (
      activityData.description !== undefined &&
      activityData.description !== existing.description
    ) {
      fieldChanges.description = {
        from: existing.description ?? null,
        to: activityData.description ?? null,
      };
    }
    if (
      activityData.priority !== undefined &&
      activityData.priority !== existing.priority
    ) {
      fieldChanges.priority = {
        from: existing.priority ?? null,
        to: activityData.priority ?? null,
      };
    }
    if (activityData.dueDate !== undefined) {
      const before = existing.dueDate
        ? new Date(existing.dueDate).toISOString()
        : null;
      const after = activityData.dueDate
        ? new Date(activityData.dueDate as string | Date).toISOString()
        : null;
      if (before !== after) {
        fieldChanges.dueDate = { from: before, to: after };
      }
    }
    if (tagIds !== undefined) {
      const previousTagIds = (existing.tags ?? []).map(
        (t: { tagId: string }) => t.tagId,
      );
      const added = tagIds.filter((t) => !previousTagIds.includes(t));
      const removed = previousTagIds.filter((t) => !tagIds.includes(t));
      if (added.length > 0 || removed.length > 0) {
        fieldChanges.tags = { added, removed };
      }
    }
    if (dependsOnActivityIds !== undefined) {
      const previousDepIds = (existing.dependsOn ?? []).map(
        (d: { requiredActivityId: string }) => d.requiredActivityId,
      );
      const added = dependsOnActivityIds.filter(
        (d) => !previousDepIds.includes(d),
      );
      const removed = previousDepIds.filter(
        (d) => !dependsOnActivityIds.includes(d),
      );
      if (added.length > 0 || removed.length > 0) {
        fieldChanges.dependsOn = { added, removed };
      }
    }
    if (Object.keys(fieldChanges).length > 0) {
      await this.events.record({
        activityId: id,
        type: 'UPDATED',
        actorId,
        metadata: { fields: fieldChanges } as Prisma.InputJsonValue,
        note: Object.keys(fieldChanges).join(', '),
      });
    }

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

  async assignUsers(id: string, dto: AssignUsersDto, actorId: string) {
    const existing = await this.findOne(id);
    const previousAssignees = (existing.assignments ?? []).map(
      (a: { userId: string }) => a.userId,
    );

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

    const added = dto.userIds.filter((u) => !previousAssignees.includes(u));
    const removed = previousAssignees.filter((u) => !dto.userIds.includes(u));
    for (const targetUserId of added) {
      await this.events.record({
        activityId: id,
        type: 'ASSIGNED',
        actorId,
        targetUserId,
      });
    }
    for (const targetUserId of removed) {
      await this.events.record({
        activityId: id,
        type: 'UNASSIGNED',
        actorId,
        targetUserId,
      });
    }

    const result = await this.findOne(id);
    if (added.length > 0) {
      await this.notifications.activityAssigned(
        result.id,
        result.title,
        added,
        actorId,
      );
    }
    if (removed.length > 0) {
      await this.notifications.activityUnassigned(
        result.id,
        result.title,
        removed,
        actorId,
      );
    }
    return result;
  }

  async unassignUser(activityId: string, userId: string, actorId: string) {
    const existing = await this.findOne(activityId);

    const { count } = await this.prisma.activityAssignment.deleteMany({
      where: {
        activityId,
        userId,
      },
    });

    if (count > 0) {
      await this.events.record({
        activityId,
        type: 'UNASSIGNED',
        actorId,
        targetUserId: userId,
      });
      await this.notifications.activityUnassigned(
        activityId,
        existing.title,
        [userId],
        actorId,
      );
    }

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
