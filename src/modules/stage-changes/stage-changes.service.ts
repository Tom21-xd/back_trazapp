import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateStageChangeRequestDto,
  ReviewStageChangeDto,
  AddCommentDto,
} from './dto';
import { StageChangeStatus } from '@prisma/client';
import { FILE_PUBLIC_SELECT } from '../../common/prisma/file-select';
import { hasAnyPermission } from '../../common/permissions';

interface AuthUser {
  id: string;
  permissions?: string[];
}
import {
  buildPaginated,
  resolvePagination,
  type PaginationQuery,
} from '../../common/pagination';
import { NotificationsService } from '../notifications/notifications.service';
import { ActivityEventsService } from '../activity-events/activity-events.service';

@Injectable()
export class StageChangesService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private events: ActivityEventsService,
  ) {}

  /** 'stagechange:manage:any' gestiona cualquiera; otros solo si están asignados. */
  private async assertAssignedOrModerator(
    activityId: string,
    user: AuthUser,
  ) {
    if (hasAnyPermission(user.permissions, ['stagechange:manage:any'])) return;

    const assignment = await this.prisma.activityAssignment.findFirst({
      where: { activityId, userId: user.id },
      select: { id: true },
    });

    if (!assignment) {
      throw new ForbiddenException(
        'Solo puedes gestionar solicitudes de actividades asignadas a ti',
      );
    }
  }

  async createRequest(dto: CreateStageChangeRequestDto, user: AuthUser) {
    // Verificar que la actividad existe
    const activity = await this.prisma.activity.findUnique({
      where: { id: dto.activityId },
      include: {
        currentStage: true,
      },
    });

    if (!activity) {
      throw new NotFoundException('Actividad no encontrada');
    }

    if (!activity.isActive) {
      throw new ForbiddenException(
        'La actividad está archivada y no admite solicitudes',
      );
    }

    // Regla de asignación: el empleado debe estar asignado a la actividad
    await this.assertAssignedOrModerator(dto.activityId, user);

    // Verificar que la etapa destino existe
    const toStage = await this.prisma.stage.findUnique({
      where: { id: dto.toStageId },
    });

    if (!toStage) {
      throw new NotFoundException('Etapa destino no encontrada');
    }

    // No se puede solicitar cambio a la misma etapa
    if (activity.currentStageId === dto.toStageId) {
      throw new BadRequestException(
        'La actividad ya está en la etapa solicitada',
      );
    }

    const request = await this.prisma.stageChangeRequest.create({
      data: {
        description: dto.description,
        activity: { connect: { id: dto.activityId } },
        fromStage: { connect: { id: activity.currentStageId } },
        toStage: { connect: { id: dto.toStageId } },
        requestedBy: { connect: { id: user.id } },
      },
      include: this.getIncludeOptions(),
    });

    const requester = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { name: true },
    });
    await this.notifications.stageChangeRequested(
      dto.activityId,
      activity.title,
      requester?.name ?? 'Un empleado',
    );

    await this.events.record({
      activityId: dto.activityId,
      type: 'STAGE_CHANGE_REQUESTED',
      actorId: user.id,
      fromStageId: activity.currentStageId,
      toStageId: dto.toStageId,
      stageChangeRequestId: request.id,
      note: dto.description.slice(0, 200),
    });

    return request;
  }

  async findAll(
    filters?: { activityId?: string; status?: StageChangeStatus },
    pagination: PaginationQuery = {},
    user?: AuthUser,
  ) {
    const where: any = {};

    if (filters?.activityId) where.activityId = filters.activityId;
    if (filters?.status) where.status = filters.status;

    // Alcance: sin 'stagechange:read:any' solo ve sus propias solicitudes
    if (
      user &&
      !hasAnyPermission(user.permissions, ['stagechange:read:any'])
    ) {
      where.requestedById = user.id;
    }

    const resolved = resolvePagination(pagination);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.stageChangeRequest.findMany({
        where,
        include: this.getIncludeOptions(),
        orderBy: { createdAt: 'desc' },
        ...(resolved.all
          ? {}
          : { skip: resolved.skip, take: resolved.take }),
      }),
      this.prisma.stageChangeRequest.count({ where }),
    ]);
    return buildPaginated(data, total, resolved);
  }

  async findOne(id: string) {
    const request = await this.prisma.stageChangeRequest.findUnique({
      where: { id },
      include: {
        ...this.getIncludeOptions(),
        comments: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true,
              },
            },
            files: FILE_PUBLIC_SELECT,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!request) {
      throw new NotFoundException('Solicitud no encontrada');
    }

    return request;
  }

  async reviewRequest(
    id: string,
    dto: ReviewStageChangeDto,
    reviewerId: string,
  ) {
    const request = await this.findOne(id);

    if (request.status !== StageChangeStatus.PENDIENTE) {
      throw new BadRequestException('La solicitud ya fue revisada');
    }

    // Si se aprueba, actualizar la etapa de la actividad
    if (dto.status === StageChangeStatus.APROBADO) {
      // Cerrar etapa actual en historial
      const currentHistory = await this.prisma.activityStageHistory.findFirst({
        where: {
          activityId: request.activityId,
          exitedAt: null,
        },
      });

      if (currentHistory) {
        await this.prisma.activityStageHistory.update({
          where: { id: currentHistory.id },
          data: { exitedAt: new Date() },
        });
      }

      // Actualizar actividad y crear nuevo registro en historial
      await this.prisma.activity.update({
        where: { id: request.activityId },
        data: {
          currentStageId: request.toStageId,
          stageHistory: {
            create: {
              stageId: request.toStageId,
              notes: `Cambio aprobado: ${dto.reviewComment || 'Sin comentarios'}`,
            },
          },
        },
      });
    }

    const updated = await this.prisma.stageChangeRequest.update({
      where: { id },
      data: {
        status: dto.status,
        reviewComment: dto.reviewComment,
        reviewedAt: new Date(),
        reviewedBy: { connect: { id: reviewerId } },
      },
      include: this.getIncludeOptions(),
    });

    await this.notifications.stageChangeReviewed(
      request.requestedById,
      request.activityId,
      request.activity?.title ?? 'la actividad',
      dto.status === StageChangeStatus.APROBADO,
      dto.reviewComment,
    );

    await this.events.record({
      activityId: request.activityId,
      type:
        dto.status === StageChangeStatus.APROBADO
          ? 'STAGE_CHANGE_APPROVED'
          : 'STAGE_CHANGE_REJECTED',
      actorId: reviewerId,
      fromStageId: request.fromStageId,
      toStageId: request.toStageId,
      stageChangeRequestId: request.id,
      note: dto.reviewComment?.slice(0, 200),
    });

    return updated;
  }

  async cancelRequest(id: string, user: AuthUser) {
    const request = await this.findOne(id);

    if (request.status !== StageChangeStatus.PENDIENTE) {
      throw new BadRequestException(
        'Solo se puede cancelar una solicitud pendiente',
      );
    }

    const isOwner = request.requestedById === user.id;
    const isManager = hasAnyPermission(user.permissions, [
      'stagechange:manage:any',
    ]);
    if (!isOwner && !isManager) {
      throw new ForbiddenException('No puedes cancelar esta solicitud');
    }

    const updated = await this.prisma.stageChangeRequest.update({
      where: { id },
      data: { status: StageChangeStatus.CANCELADO },
      include: this.getIncludeOptions(),
    });

    await this.events.record({
      activityId: request.activityId,
      type: 'STAGE_CHANGE_CANCELLED',
      actorId: user.id,
      fromStageId: request.fromStageId,
      toStageId: request.toStageId,
      stageChangeRequestId: request.id,
    });

    return updated;
  }

  async addComment(requestId: string, dto: AddCommentDto, user: AuthUser) {
    const request = await this.findOne(requestId);

    // Puede comentar: moderador, quien hizo la solicitud, o un asignado
    if (request.requestedById !== user.id) {
      await this.assertAssignedOrModerator(request.activityId, user);
    }

    const comment = await this.prisma.stageChangeComment.create({
      data: {
        content: dto.content,
        user: { connect: { id: user.id } },
        stageChangeRequest: { connect: { id: requestId } },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
        files: FILE_PUBLIC_SELECT,
      },
    });

    return comment;
  }

  async getPendingRequests(pagination: PaginationQuery = {}) {
    return this.findAll({ status: StageChangeStatus.PENDIENTE }, pagination);
  }

  async getMyRequests(userId: string, pagination: PaginationQuery = {}) {
    const where = { requestedById: userId };
    const resolved = resolvePagination(pagination);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.stageChangeRequest.findMany({
        where,
        include: this.getIncludeOptions(),
        orderBy: { createdAt: 'desc' },
        ...(resolved.all
          ? {}
          : { skip: resolved.skip, take: resolved.take }),
      }),
      this.prisma.stageChangeRequest.count({ where }),
    ]);
    return buildPaginated(data, total, resolved);
  }

  private getIncludeOptions() {
    return {
      activity: {
        select: {
          id: true,
          title: true,
          project: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
      fromStage: true,
      toStage: true,
      requestedBy: {
        select: {
          id: true,
          name: true,
          email: true,
          avatar: true,
        },
      },
      reviewedBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      files: FILE_PUBLIC_SELECT,
      _count: {
        select: {
          comments: true,
        },
      },
    };
  }
}
